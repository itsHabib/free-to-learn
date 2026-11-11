// Public behavior checks, not worked implementations.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {startLab} from '../runtime/lab.mjs';
import {open, seal, context, importSecret, freshSecret} from '../runtime/crypto.mjs';
import {encode, decoder, MAX_FRAME} from '../runtime/wire.mjs';
export async function runChecks(source, stage = 'all') {
  const level = stage === 'all' ? 5 : Number(stage);
  assert.ok(Number.isInteger(level) && level >= 1 && level <= 5, 'Use 1, 2, 3, 4, 5 or all.');
  const p = await import(pathToFileURL(resolve(source)));
  const results = [];
  const check = async (name, run) => {
    try { await run(); results.push({name,pass:true}); }
    catch (e) {results.push({name,pass:false,code:e.code,message:e.message});}
  };
  await check('P1 distinct available path; exclusions; unchanged directory; explicit shortage', () => {
    const directory = [{id:'a',online:true},{id:'b',online:false},{id:'a',online:true},{id:'c',online:true},{id:'d',online:true},{id:'e',online:true}];
    const before = JSON.stringify(directory);
    const path = p.selectPath(directory,['c'],3);
    assert.equal(path.length,3); assert.equal(new Set(path).size,3);
    assert.ok(path.every(id => ['a','d','e'].includes(id))); assert.equal(JSON.stringify(directory),before);
    assert.throws(() => p.selectPath(directory,['a','c'],3), {code:'NO_PATH'});
  });
  if (level === 1) return {results,events:[]};
  await check('P2 partial setup rolls back already attempted relays', async () => {
    const attempted = [], closed = [];
    await assert.rejects(p.createCircuit(['a','b','c'],{
      install:async id => {attempted.push(id);if (id === 'b') throw Object.assign(new Error('setup fault'),{code:'SETUP_FAULT'});},
      close:async id => {closed.push(id);}
    }),{code:'SETUP_FAULT'});
    assert.deepEqual(attempted,['a','b']); assert.ok(closed.includes('a')); assert.ok(closed.includes('b'));
  });
  // In-process contract checks; no relay processes are started for these.
  const recordSetup = async path => {
    const configs = [];
    const circuit = await p.createCircuit(path, {install: async (id, config) => {configs.push({id, config: {...config}});}, close: async () => {}});
    return {circuit, configs};
  };
  await check('P2 setup sends each relay only its own two keys and two neighbors', async () => {
    const {configs} = await recordSetup(['a', 'b', 'c']);
    const allowed = ['backwardSecret', 'circuitId', 'forwardSecret', 'next', 'previous', 'relayId'];
    for (const {id, config} of configs) {
      assert.deepEqual(Object.keys(config).sort(), allowed, 'relay ' + id + ' received fields beyond its own state');
      assert.equal(config.relayId, id);
    }
  });
  await check('P2 forward and backward secrets are independent for every hop', async () => {
    const {configs} = await recordSetup(['a', 'b', 'c']);
    const secrets = configs.flatMap(({config}) => [config.forwardSecret, config.backwardSecret]);
    assert.equal(new Set(secrets).size, secrets.length, 'a secret is reused across directions or hops');
  });
  if (level >= 4) await check('P4 a downstream failure leaves the accepted sequence consumed (no second forward)', async () => {
    const {circuit, configs} = await recordSetup(['a', 'b', 'c']);
    const states = new Map(); p.installCircuit(configs[0].config, states);
    const state = states.get(circuit.id), packet = p.wrapRequest(circuit.hops, {operation: 'lookup', item: 'luna'}, 5);
    let forwards = 0;
    const io = {observe() {}, archive: async () => assert.fail('entry must not serve the archive'),
      forward: async () => {forwards++; throw Object.assign(new Error('down'), {code: 'DELIVERY_FAILED'});}};
    await assert.rejects(p.handleCell(state, packet, io), {code: 'DELIVERY_FAILED'});
    await assert.rejects(p.handleCell(state, packet, io), {code: 'REPLAY'});
    assert.equal(forwards, 1, 'the resent packet was forwarded again');
  });
  // Contract-derived regression cases: setup secrecy and consumed failed sequences.
  await check('P2 setup values name no relay beyond the two neighbors; UUID circuit id', async () => {
    // PROTOCOL.md: "Generate a fresh randomUUID() circuit ID" and "Send only that relay's keys and two
    // neighbors, never the full route or other keys."
    const path = ['relay-north', 'relay-east', 'relay-south', 'relay-west'], calls = [];
    const circuit = await p.createCircuit(path, {install: async (...args) => {calls.push(args);}, close: async () => {}});
    assert.match(circuit.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the circuit id is not a randomUUID() value');
    assert.equal(calls.length, path.length);
    for (const args of calls) {
      const [id, config] = args, known = [id, config.previous, config.next], sent = JSON.stringify(config);
      assert.equal(config.circuitId, circuit.id);
      for (const other of path) if (!known.includes(other)) assert.ok(!sent.includes(other), 'relay ' + id + ' was told about ' + other);
    }
  });
  await check('P2 secrets are fresh for every circuit, not only within one', async () => {
    // PROTOCOL.md: "Keys are fresh per circuit, hop and direction."
    const first = await recordSetup(['a', 'b', 'c']), second = await recordSetup(['a', 'b', 'c']);
    assert.notEqual(first.circuit.id, second.circuit.id);
    const secrets = [...first.configs, ...second.configs].flatMap(({config}) => [config.forwardSecret, config.backwardSecret]);
    assert.equal(new Set(secrets).size, secrets.length, 'a secret from one circuit is used again in another');
  });
  if (level >= 4) await check('P4 a failure at any relay, with DELIVERY_FAILED, leaves the sequence consumed, also a moment later', async () => {
    // PROTOCOL.md: "Propagate failures. A downstream failure leaves the accepted forward sequence consumed;
    // do not clear it or try to encrypt another backward packet under the same key/nonce."
    for (const position of [0, 1, 2]) for (const code of ['DELIVERY_FAILED']) {
      const {circuit, configs} = await recordSetup(['a', 'b', 'c']);
      const states = new Map(); p.installCircuit(configs[position].config, states);
      const state = states.get(circuit.id), seq = 6;
      let packet = p.wrapRequest(circuit.hops, {operation: 'lookup', item: 'luna'}, seq);
      for (let i = 0; i < position; i++) packet = open(circuit.hops[i].forwardKey, context(circuit.id, circuit.hops[i].relayId, 'forward', seq), packet).body;
      let attempts = 0;
      const down = async () => {attempts++; throw Object.assign(new Error('down'), {code});};
      const io = {observe() {}, archive: down, forward: down};
      const where = 'hop ' + position + ', error ' + code;
      await assert.rejects(p.handleCell(state, packet, io), {code}, where + ': the failure was not propagated');
      await new Promise(resolve => setTimeout(resolve, 25));
      await assert.rejects(p.handleCell(state, packet, io), {code: 'REPLAY'}, where + ': the resent packet was accepted');
      assert.equal(attempts, 1, where + ': the resent packet went downstream again');
    }
  });
  let lab;
  try {
    lab = await startLab(source);
    await check('P2 four different relay PIDs; local IPC endpoints; neighbor-only state; duplicate install rejected', async () => {
      const dir = lab.directory(); assert.equal(new Set(dir.map(r => r.pid)).size,4);
      assert.ok(dir.every(r => r.pid !== process.pid && r.endpoint.transport === 'ipc'));
      const c = await lab.open();
      for (let i = 0; i < c.hops.length; i++) {
        const h = c.hops[i], view = (await lab.snapshot(h.relayId)).find(s => s.circuitId === c.id);
        assert.equal(view.previous,c.hops[i-1]?.relayId || 'client');
        assert.equal(view.next,c.hops[i+1]?.relayId || 'archive'); assert.deepEqual(view.seen,[]);
        await assert.rejects(lab.control.install(h.relayId,{...view,forwardSecret:freshSecret(),backwardSecret:freshSecret()}),{code:'CIRCUIT_EXISTS'});
      }
      await lab.close(c);
    });
    if (level >= 3) await check('P3 nested layers match established successors; plaintext absent from envelope; no nonce reuse', async () => {
      const c = await lab.open();
      let packet = p.wrapRequest(c.hops,{operation:'lookup',item:'tide'},12);
      assert.ok(!JSON.stringify(packet).includes('lookup'));
      for (let i = 0; i < c.hops.length; i++) {
        const h = c.hops[i], inner = open(h.forwardKey,context(c.id,h.relayId,'forward',12),packet);
        assert.equal(inner.next,c.hops[i+1]?.relayId || 'archive'); packet = inner.body;
      }
      assert.deepEqual(packet,{operation:'lookup',item:'tide'});
      assert.throws(() => p.wrapRequest(c.hops,{},12),{code:'NONCE_REUSE'}); await lab.close(c);
    });
    if (level >= 4) {
      await check('P4 real round trip; return payload; each relay forwards once; exit alone serves archive', async () => {
        const c = await lab.open(), start = lab.events.length;
        assert.deepEqual(await lab.send(c,'luna'),{item:'luna',record:'Fictional lunar atlas'});
        const events = lab.events.slice(start).filter(e => e.circuitId === c.id);
        assert.deepEqual(events.filter(e => e.kind === 'forward').map(e => e.relayId).sort(),c.hops.slice(0,-1).map(h => h.relayId).sort());
        assert.deepEqual(events.filter(e => e.kind === 'archive').map(e => e.relayId),[c.hops.at(-1).relayId]);
        await lab.close(c);
      });
      await check('P4 authentication and route failure do not consume receiver sequence', async () => {
        const c = await lab.open(), entry = c.hops[0];
        const packet = p.wrapRequest(c.hops,{operation:'lookup',item:'luna'},17);
        const corrupt = {...packet,tag:Buffer.alloc(16).toString('base64')};
        await assert.rejects(lab.raw(entry.relayId,{type:'cell',circuitId:c.id,packet:corrupt}),{code:'AUTH_FAILED'});
        assert.deepEqual((await lab.snapshot(entry.relayId)).find(s => s.circuitId === c.id).seen,[]);
        const wrong = seal(entry.forwardKey,context(c.id,entry.relayId,'forward',18),{next:'forbidden',body:{}});
        await assert.rejects(lab.raw(entry.relayId,{type:'cell',circuitId:c.id,packet:wrong}),{code:'BAD_ROUTE'});
        assert.deepEqual((await lab.snapshot(entry.relayId)).find(s => s.circuitId === c.id).seen,[]);
        const reply = await lab.raw(entry.relayId,{type:'cell',circuitId:c.id,packet});
        assert.equal(p.unwrapReply(c.hops,reply,17).item,'luna'); await lab.close(c);
      });
      await check('P4 concurrent duplicate: one archive effect, one success, one REPLAY', async () => {
        const c = await lab.open(), entry = c.hops[0].relayId;
        const packet = p.wrapRequest(c.hops,{operation:'lookup',item:'tide'},8);
        const cell = {type:'cell',circuitId:c.id,packet};
        const attempts = await Promise.allSettled([lab.raw(entry,cell),lab.raw(entry,cell)]);
        assert.equal(attempts.filter(r => r.status === 'fulfilled').length,1);
        assert.equal(attempts.find(r => r.status === 'rejected')?.reason.code,'REPLAY');
        assert.equal(lab.events.filter(e => e.kind === 'archive' && e.circuitId === c.id).length,1); await lab.close(c);
      });
      await check('P4 every return layer binds caller expected sequence, including mixed inner layer', async () => {
        const c = await lab.open();
        const keys = c.hops.map(() => {const secret = freshSecret();return {writer:importSecret(secret),reader:importSecret(secret)};});
        const hops = c.hops.map((h,i) => ({...h,backwardKey:keys[i].reader}));
        let body = {item:'luna'};
        for (let i = hops.length - 1; i >= 0; i--) body = seal(keys[i].writer,context(c.id,hops[i].relayId,'backward',i === 1 ? 3 : 4),body);
        assert.throws(() => p.unwrapReply(hops,body,4),{code:'BAD_PACKET'});
        const requestPacket = p.wrapRequest(c.hops,{operation:'lookup',item:'luna'},10);
        const reply = await lab.raw(c.hops[0].relayId,{type:'cell',circuitId:c.id,packet:requestPacket});
        assert.throws(() => p.unwrapReply(c.hops,reply,11),{code:'BAD_PACKET'});
        await lab.close(c);
      });
      await check('P4 fresh out-of-order sequences accepted; other circuit keys rejected', async () => {
        const a = await lab.open(), b = await lab.open();
        for (const seq of [9,2]) {
          const packet = p.wrapRequest(a.hops,{operation:'lookup',item:'luna'},seq);
          const reply = await lab.raw(a.hops[0].relayId,{type:'cell',circuitId:a.id,packet});
          assert.equal(p.unwrapReply(a.hops,reply,seq).item,'luna');
        }
        const old = p.wrapRequest(a.hops,{operation:'lookup',item:'luna'},7);
        await assert.rejects(lab.raw(b.hops[0].relayId,{type:'cell',circuitId:b.id,packet:old}),{code:'AUTH_FAILED'});
        await lab.close(a); await lab.close(b);
      });
    }
    if (level >= 5) {
      await check('P5 real relay death; healthy independent circuit; fresh replacement; old circuit retired', async () => {
        const a = await lab.open(), failed = a.hops[1].relayId;
        const b = await lab.open([failed]);
        const oldPacket = p.wrapRequest(a.hops,{operation:'lookup',item:'luna'},40);
        await lab.stop(failed);
        await assert.rejects(lab.send(a),{code:'DELIVERY_FAILED'});
        assert.equal((await lab.send(b,'tide')).item,'tide');
        const replacement = await lab.recover(a,[failed]);
        assert.notEqual(replacement.id,a.id); assert.ok(replacement.hops.every(h => h.relayId !== failed));
        assert.equal(replacement.nextSequence,0); assert.equal((await lab.send(replacement)).item,'luna');
        await assert.rejects(lab.send(a),{code:'CIRCUIT_CLOSED'});
        await assert.rejects(lab.raw(a.hops[0].relayId,{type:'cell',circuitId:a.id,packet:oldPacket}),{code:'UNKNOWN_CIRCUIT'});
        await assert.rejects(lab.raw(replacement.hops[0].relayId,{type:'cell',circuitId:replacement.id,packet:oldPacket}),{code:'AUTH_FAILED'});
        await lab.close(b); await lab.close(replacement); await lab.start(failed);
      });
      await check('P5 lost reply preserves archive receipt; explicit retry uses fresh circuit', async () => {
        const c = await lab.open(); await lab.dropNextReply(c.hops.at(-1).relayId);
        await assert.rejects(lab.send(c),{code:'DELIVERY_FAILED'});
        assert.equal(lab.events.filter(e => e.kind === 'archive' && e.circuitId === c.id).length,1);
        const next = await lab.recover(c,[]); assert.equal((await lab.send(next)).item,'luna'); await lab.close(next);
      });
      await check('P5 shortage stops instead of shortening path; sequence exhaustion requires rebuild', async () => {
        const c = await lab.open();
        c.nextSequence = 1024; await assert.rejects(lab.send(c),{code:'REBUILD_REQUIRED'});
        const failed = lab.directory().slice(0,2).map(r => r.id);
        const plan = p.recoveryPlan(lab.directory(),failed,c.hops.map(h => h.relayId));
        assert.deepEqual(plan,{action:'stop',reason:'NO_PATH'});
        await assert.rejects(lab.recover(c,failed),{code:'NO_PATH'}); assert.equal(c.closed,true);
      });
    }
  } catch (error) {results.push({name:'relay startup or infrastructure',pass:false,code:error.code,message:error.message});}
  finally {await lab?.shutdown();}
  return {results,events:lab?.events || []};
}

export function checkWire() {
  const frame = encode({hello:'fragmented'}); let value, error;
  const push = decoder(v => {value=v;}, e => {error=e;});
  for (const byte of frame) push(Buffer.from([byte]));
  assert.deepEqual(value,{hello:'fragmented'}); assert.equal(error,undefined);
  const oversized = Buffer.alloc(4); oversized.writeUInt32BE(MAX_FRAME+1);
  decoder(() => assert.fail('accepted oversized frame'),e => {error=e;})(oversized);
  assert.equal(error.code,'FRAME_SIZE');
}
