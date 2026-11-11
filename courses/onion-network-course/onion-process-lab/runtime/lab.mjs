import {fork} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {LabError, requireThat, destroyKey} from './crypto.mjs';
import {request} from './wire.mjs';

export async function startLab(source, onEvent = () => {}, transport = 'ipc') {
  requireThat(['ipc','tcp'].includes(transport),'BAD_TRANSPORT');
  source = resolve(source);
  const protocol = await import(pathToFileURL(source));
  const nodes = new Map(), events = [], circuits = new Set();
  let serial = 0;
  const record = event => {
    const row = {...event, time:Date.now()};
    if (events.length < 2000) events.push(row);
    onEvent(row);
  };
  const directory = () => [...nodes].map(([id, node]) => ({id, online:node.online, endpoint:node.endpoint, pid:node.child.pid}));
  async function command(id, message) {
    const node = nodes.get(id);
    requireThat(node?.online, 'RELAY_OFFLINE');
    const requestId = ++serial;
    return new Promise((resolveCommand, reject) => {
      const timer = setTimeout(() => { node.pending.delete(requestId); reject(new LabError('CONTROL_TIMEOUT')); }, 2500);
      node.pending.set(requestId, {resolve:value => {clearTimeout(timer);resolveCommand(value);}, reject:error => {clearTimeout(timer);reject(error);}});
      node.child.send({...message, requestId}, error => {
        if (error) { node.pending.get(requestId)?.reject(new LabError('CONTROL_FAILED')); node.pending.delete(requestId); }
      });
    });
  }
  async function updatePeers() {
    const peers = directory().filter(row => row.online);
    await Promise.all(peers.map(row => command(row.id, {op:'peers',peers})));
  }
  async function start(id) {
    requireThat(['r1','r2','r3','r4'].includes(id), 'BAD_RELAY');
    requireThat(!nodes.get(id)?.online, 'ALREADY_RUNNING');
    const child = fork(fileURLToPath(new URL('./relay-process.mjs', import.meta.url)), [id, source, transport], {stdio:['ignore','ignore','pipe','ipc'], env:{}});
    const node = {child, pending:new Map(), online:false, endpoint:null, stderr:''};
    nodes.set(id,node);
    child.stderr.on('data', bytes => {node.stderr += bytes.toString().slice(0,2000);});
    await new Promise((resolveStart,reject) => {
      const timer = setTimeout(() => {child.kill('SIGTERM');reject(new LabError('START_TIMEOUT'));},3000);
      child.on('message', message => {
        if (message.type === 'ready') {
          clearTimeout(timer); node.online = true; node.endpoint = message.endpoint;
          record({kind:'ready',relayId:id,pid:child.pid,endpoint:node.endpoint}); resolveStart();
        }
        if (message.type === 'event') record(message);
        if (message.type === 'forward') {
          // Simulated links: the trusted operator routes bytes between real child processes.
          command(message.next,{op:'deliver',cell:message.cell}).then(
            result => {if (child.connected) child.send({type:'forward-response',requestId:message.requestId,result});},
            () => {if (child.connected) child.send({type:'forward-response',requestId:message.requestId,error:'DELIVERY_FAILED'});}
          );
        }
        if (message.type === 'ack') {
          const pending = node.pending.get(message.requestId); node.pending.delete(message.requestId);
          if (message.error) { pending?.reject(new LabError(message.error)); return; }
          pending?.resolve(message.result);
        }
      });
      child.on('error', error => {clearTimeout(timer);reject(error);});
      child.on('exit', (code,signal) => {
        clearTimeout(timer); node.online = false;
        for (const pending of node.pending.values()) pending.reject(new LabError('RELAY_OFFLINE'));
        node.pending.clear();
        record({kind:'stopped',relayId:id,pid:child.pid,code,signal});
        reject(new LabError('START_FAILED', node.stderr || `Relay exited (${code}).`));
      });
    });
    await updatePeers();
  }
  async function stop(id) {
    const node = nodes.get(id);
    if (!node || node.child.exitCode !== null || node.child.signalCode !== null) return;
    await new Promise(resolveStop => {
      const timer = setTimeout(() => node.child.kill('SIGKILL'), 1500);
      node.child.once('exit', () => {clearTimeout(timer);resolveStop();});
      node.child.kill('SIGTERM');
    });
    // Keep known addresses of stopped peers so an old circuit attempts its real dead socket.
  }
  const control = {
    install: (id, config) => command(id, {op:'install',config}),
    close: (id, circuitId) => nodes.get(id)?.online ? command(id,{op:'close',circuitId}) : Promise.resolve()
  };
  async function open(failedIds = [], length = 3, chosenPath) {
    const path = chosenPath || protocol.selectPath(directory(),failedIds,length);
    requireThat(Array.isArray(path) && path.length === length && new Set(path).size === length
      && path.every(id => nodes.get(id)?.online && !failedIds.includes(id)), 'BAD_PATH');
    const circuit = await protocol.createCircuit(path,control);
    requireThat(circuit?.id && circuit.hops?.length === length && circuit.hops.every((hop,i) => hop.relayId === path[i]), 'BAD_CIRCUIT');
    circuit.nextSequence = 0; circuit.closed = false; circuits.add(circuit);
    return circuit;
  }
  async function close(circuit) {
    if (circuit.closed) return;
    circuit.closed = true;
    for (const hop of circuit.hops) {destroyKey(hop.forwardKey);destroyKey(hop.backwardKey);}
    await Promise.all(circuit.hops.map(hop => control.close(hop.relayId,circuit.id)));
  }
  async function raw(id,cell) {
    if (transport === 'tcp') return request(nodes.get(id).endpoint,cell);
    if (!nodes.get(id)?.online) throw new LabError('DELIVERY_FAILED');
    return command(id,{op:'deliver',cell});
  }
  async function send(circuit, item = 'luna') {
    requireThat(!circuit.closed, 'CIRCUIT_CLOSED');
    requireThat(circuit.nextSequence < 1024, 'REBUILD_REQUIRED');
    const seq = circuit.nextSequence++; // A failed send still consumes its nonce.
    const packet = protocol.wrapRequest(circuit.hops,{operation:'lookup',item},seq);
    const reply = await raw(circuit.hops[0].relayId,{type:'cell',circuitId:circuit.id,packet});
    return protocol.unwrapReply(circuit.hops,reply,seq);
  }
  async function recover(circuit, failedIds) {
    const plan = protocol.recoveryPlan(directory(),failedIds,circuit.hops.map(hop => hop.relayId));
    await close(circuit);
    if (plan.action === 'stop' && plan.reason === 'NO_PATH') throw new LabError('NO_PATH');
    requireThat(plan.action === 'rebuild', 'BAD_RECOVERY');
    return open(failedIds,circuit.hops.length,plan.path);
  }
  async function shutdown() {
    for (const circuit of circuits) await close(circuit).catch(() => {});
    for (const id of nodes.keys()) await stop(id);
  }
  try { for (const id of ['r1','r2','r3','r4']) await start(id); }
  catch (error) {await shutdown();throw error;}
  return {protocol,events,directory,open,close,send,recover,start,stop,shutdown,control,
    dropNextReply:id => command(id,{op:'drop-reply'}),
    snapshot:id => command(id,{op:'snapshot'}),
    raw,transport};
}
