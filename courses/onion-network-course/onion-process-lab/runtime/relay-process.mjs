// Each instance has a separate heap, PID, listening socket, and circuit map.
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {decoder, encode, request} from './wire.mjs';
import {requireThat, destroyKey, LabError} from './crypto.mjs';
const [relayId, source, transport = 'ipc'] = process.argv.slice(2);
const forwards = new Map();
let forwardSerial = 0;
function forwardIPC(next, cell) {
  return new Promise((resolve, reject) => {
    const requestId = ++forwardSerial;
    const timer = setTimeout(() => {forwards.delete(requestId); reject(new LabError('DELIVERY_FAILED'));},1800);
    forwards.set(requestId,{resolve:value => {clearTimeout(timer);resolve(value);}, reject:() => {clearTimeout(timer);reject(new LabError('DELIVERY_FAILED'));}});
    process.send({type:'forward',requestId,next,cell});
  });
}
const protocol = await import(pathToFileURL(source));
const states = new Map(), peers = new Map(), sockets = new Set();
let loseNextReply = false;
const event = (kind, data = {}) => process.send?.({type:'event', relayId, pid:process.pid, kind, ...data});
const dispose = state => { destroyKey(state.forwardKey); destroyKey(state.backwardKey); };
async function processCell(cell) {
      requireThat(cell?.type === 'cell' && typeof cell.circuitId === 'string', 'BAD_CELL');
      const state = states.get(cell.circuitId);
      requireThat(state, 'UNKNOWN_CIRCUIT');
      event('received', {circuitId:cell.circuitId, seq:cell.packet?.seq, bytes:encode(cell).length});
      const io = {
        forward: async (next, packet) => {
          requireThat(next === state.next && peers.has(next), 'BAD_ROUTE');
          event('forward', {circuitId:cell.circuitId, next, seq:packet.seq});
          // Report no downstream identity or OS diagnostic as a client observation.
          try {
            const outgoing = {type:'cell',circuitId:cell.circuitId,packet};
            if (transport === 'tcp') return await request(peers.get(next),outgoing);
            return await forwardIPC(next,outgoing);
          }
          catch { throw new LabError('DELIVERY_FAILED'); }
        },
        archive: async body => {
          requireThat(state.next === 'archive', 'BAD_ROUTE');
          requireThat(body?.operation === 'lookup' && ['luna','tide'].includes(body.item)
            && Object.keys(body).length === 2, 'BAD_REQUEST');
          event('archive', {circuitId:cell.circuitId, request:body});
          return {item:body.item, record:body.item === 'luna' ? 'Fictional lunar atlas' : 'Fictional tidal register'};
        },
        observe: data => event('peeled', {circuitId:cell.circuitId, ...data})
      };
      const reply = await protocol.handleCell(state, cell.packet, io);
      if (loseNextReply) { loseNextReply = false; event('reply-dropped', {circuitId:cell.circuitId}); throw new LabError('DELIVERY_FAILED'); }
      return reply;
}
const server = net.createServer(socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
  const timer = setTimeout(() => socket.destroy(),2200);
  socket.on('close', () => clearTimeout(timer));
  socket.on('data', decoder(async cell => {
    try { socket.end(encode({ok:true,body:await processCell(cell)})); }
    catch (error) { event('rejected',{code:error.code || 'HANDLER_FAILED',circuitId:cell?.circuitId}); socket.end(encode({ok:false,code:error.code || 'HANDLER_FAILED'})); }
  }, () => socket.destroy()));
});
server.on('error', error => { event('startup-failed', {code:error.code}); console.error(error.code); process.exitCode = 1; process.disconnect?.(); });
if (transport === 'tcp') {
  server.listen(0, '127.0.0.1', () => process.send({type:'ready', relayId, pid:process.pid, endpoint:{host:'127.0.0.1',port:server.address().port}}));
} else {
  process.send({type:'ready',relayId,pid:process.pid,endpoint:{transport:'ipc'}});
}
process.on('message', async message => {
  if (message.type === 'forward-response') {
    const pending = forwards.get(message.requestId); forwards.delete(message.requestId);
    if (message.error) {pending?.reject();return;}
    pending?.resolve(message.result);return;
  }
  try {
    let result = true;
    if (message.op === 'deliver') {
      result = await processCell(message.cell);
    } else if (message.op === 'peers') {
      peers.clear();
      for (const peer of message.peers) { if (peer.id !== relayId) peers.set(peer.id, peer.endpoint); }
    } else if (message.op === 'install') {
      const config = message.config;
      requireThat(config?.relayId === relayId && typeof config.circuitId === 'string', 'BAD_SETUP');
      requireThat(config.next === 'archive' || peers.has(config.next), 'BAD_SETUP');
      requireThat(config.previous === 'client' || peers.has(config.previous), 'BAD_SETUP');
      requireThat(states.size < 32, 'CIRCUIT_LIMIT');
      await protocol.installCircuit(config, states);
      event('installed', {circuitId:config.circuitId, previous:config.previous, next:config.next});
    } else if (message.op === 'close') {
      const state = states.get(message.circuitId);
      if (state) { dispose(state); states.delete(message.circuitId); }
    } else if (message.op === 'drop-reply') { loseNextReply = true;
    } else if (message.op === 'snapshot') {
      result = [...states.values()].map(s => ({circuitId:s.circuitId, relayId:s.relayId, previous:s.previous, next:s.next, seen:[...s.seenForward]}));
    } else { throw new LabError('BAD_CONTROL'); }
    process.send?.({type:'ack', requestId:message.requestId, result});
  } catch (error) {
    event('rejected',{code:error.code || 'CONTROL_FAILED',circuitId:message.cell?.circuitId});
    process.send?.({type:'ack', requestId:message.requestId, error:error.code || 'CONTROL_FAILED'});
  }
});
process.on('disconnect', () => {
  for (const state of states.values()) dispose(state);
  for (const socket of sockets) socket.destroy();
  if (server.listening) server.close();
});
