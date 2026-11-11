const BrowserCrypto=(()=>{

// Browser adapter: only the platform's vetted AES-GCM implementation encrypts data.
class LabError extends Error {
  constructor(code, detail=code) {super(detail);this.name='LabError';this.code=code;}
}
function requireThat(condition,code,detail) {if(!condition)throw new LabError(code,detail);}
const utf8=value=>new TextEncoder().encode(value);
function toBase64(bytes) {
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);
}
function fromBase64(text) {
  return Uint8Array.from(atob(text),c=>c.charCodeAt(0));
}
function context(circuitId,relayId,direction,seq) {
  requireThat(typeof circuitId==='string'&&typeof relayId==='string','BAD_CONTEXT');
  requireThat(['forward','backward'].includes(direction),'BAD_DIRECTION');
  requireThat(Number.isSafeInteger(seq)&&seq>=0&&seq<1024,'BAD_SEQUENCE');
  return {protocol:'onion-lab-v1',circuitId,relayId,direction,seq};
}
function createCryptoPlatform(provider=globalThis.crypto) {
  requireThat(provider?.subtle&&provider?.getRandomValues,'CRYPTO_UNAVAILABLE','This environment needs built-in Web Crypto.');
  const materials=new WeakMap();
  function freshKey() {
    const handle=Object.freeze({kind:'ephemeral-toy-key'}),raw=provider.getRandomValues(new Uint8Array(32));
    const promise=provider.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']).finally(()=>raw.fill(0));
    materials.set(handle,{promise,used:new Set(),active:true});return handle;
  }
  function destroyKey(handle) {
    const material=materials.get(handle);if(material)material.active=false;materials.delete(handle);
    // CryptoKey/JS memory cannot be securely erased by this application.
  }
  function materialFor(handle) {
    const material=materials.get(handle);requireThat(material?.active,'KEY_UNAVAILABLE');return material;
  }
  const aad=ctx=>utf8(JSON.stringify(context(ctx.circuitId,ctx.relayId,ctx.direction,ctx.seq)));
  const nonce=seq=>{const bytes=new Uint8Array(12);new DataView(bytes.buffer).setUint32(8,seq);return bytes;};
  async function seal(handle,ctx,value) {
    const additionalData=aad(ctx),material=materialFor(handle);
    requireThat(!material.used.has(ctx.seq),'NONCE_REUSE','Use a fresh sequence or rebuild with fresh keys.');
    const plaintext=utf8(JSON.stringify(value));requireThat(plaintext.length<=262144,'OVERSIZE');
    // Reserve synchronously, before any await, so concurrent calls cannot reuse a nonce.
    material.used.add(ctx.seq);
    const key=await material.promise;requireThat(material.active,'KEY_UNAVAILABLE');
    const combined=new Uint8Array(await provider.subtle.encrypt({name:'AES-GCM',iv:nonce(ctx.seq),additionalData,tagLength:128},key,plaintext));
    return {seq:ctx.seq,ciphertext:toBase64(combined.slice(0,-16)),tag:toBase64(combined.slice(-16))};
  }
  async function open(handle,ctx,packet) {
    const additionalData=aad(ctx),material=materialFor(handle);
    requireThat(packet&&packet.seq===ctx.seq&&typeof packet.ciphertext==='string'&&typeof packet.tag==='string','BAD_PACKET');
    requireThat(packet.ciphertext.length<=350000,'OVERSIZE');
    const key=await material.promise;requireThat(material.active,'KEY_UNAVAILABLE');
    try {
      const ciphertext=fromBase64(packet.ciphertext),tag=fromBase64(packet.tag);requireThat(tag.length===16,'AUTH_FAILED');
      const combined=new Uint8Array(ciphertext.length+tag.length);combined.set(ciphertext);combined.set(tag,ciphertext.length);
      const plaintext=await provider.subtle.decrypt({name:'AES-GCM',iv:nonce(ctx.seq),additionalData,tagLength:128},key,combined);
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
    }catch {throw new LabError('AUTH_FAILED','Ciphertext, tag, context or key did not authenticate.');}
  }
  return {freshKey,destroyKey,seal,open,context,requireThat,LabError};
}
const platform=createCryptoPlatform();
const {freshKey,destroyKey,seal,open}=platform;

return {LabError,requireThat,utf8,toBase64,fromBase64,context,createCryptoPlatform,freshKey,destroyKey,seal,open};
})();
const BrowserAssert=(()=>{

// Narrow assertion adapter for the course's public cases; not a general test framework.
function failure(actual,expected,message) {
  const error=new Error(message??`Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`);
  error.code='ERR_ASSERTION';error.actual=actual;error.expected=expected;throw error;
}
function equivalent(a,b) {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a),other=Object.keys(b);
  return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&equivalent(a[k],b[k]));
}
const assert={
  equal:(a,b,message)=>{if(!Object.is(a,b))failure(a,b,message);},
  notEqual:(a,b,message)=>{if(Object.is(a,b))failure(a,`different from ${b}`,message);},
  ok:(value,message)=>{if(!value)failure(value,true,message);},
  deepEqual:(a,b,message)=>{if(!equivalent(a,b))failure(a,b,message);},
};

return {assert};
})();
const BrowserNetwork=(()=>{
const {freshKey,destroyKey,requireThat,LabError,utf8,toBase64,fromBase64}=BrowserCrypto;
// Supplied in-process harness. There are no sockets, DNS calls or external relays.
const randomUUID=()=>globalThis.crypto.randomUUID();

const directory = () => ['cedar', 'birch', 'maple', 'elm', 'ash'].map(id => ({ id, online: true }));
const sampleRequest = () => ({ operation: 'lookup', item: 'luna' });
const catalog = { luna: 'Luna: a fictional lunar atlas', tide: 'Tide: a fictional ocean atlas' };

function establish(path, relays = directory()) {
  requireThat(path.length >= 2 && new Set(path).size === path.length, 'BAD_PATH');
  requireThat(path.every(id => relays.some(r => r.id === id && r.online)), 'BAD_PATH');
  const circuitId = randomUUID();
  const hops = path.map(relayId => ({ circuitId, relayId, forwardKey: freshKey(), backwardKey: freshKey() }));
  // Omniscient setup is deliberately supplied. It is NOT a handshake or Tor telescoping.
  const states = hops.map((hop, i) => ({ ...hop, previous: path[i - 1] ?? 'client',
    next: path[i + 1] ?? 'archive', seenForward: new Set() }));
  return { id: circuitId, path: [...path], hops, states, nextSeq: 0, received: new Set(), closed: false, trace: [] };
}
function closeCircuit(circuit) {
  circuit.closed = true;
  for (const hop of circuit.hops) { destroyKey(hop.forwardKey); destroyKey(hop.backwardKey); }
}
const bytes = packet => utf8(JSON.stringify(packet)).length;

async function deliverForward(implementation, circuit, packet, { failAt = null, modifyAt = null, dropAt = null, onReceive = () => {} } = {}) {
  requireThat(!circuit.closed, 'CIRCUIT_CLOSED');
  let body = packet;
  for (const state of circuit.states) {
    if (state.relayId === failAt) throw new LabError('RELAY_DOWN', state.relayId);
    if (state.relayId === dropAt) throw new LabError('FORWARD_LOST', state.relayId);
    if (state.relayId === modifyAt) body = tamper(body);
    const size = bytes(body);
    onReceive({observer:state.relayId,previous:state.previous,seq:body.seq,bytes:size,phase:'received'});
    let layer;
    try { layer = await implementation.peelForward(state, body); }
    catch(error) { onReceive({observer:state.relayId,phase:'rejected',code:error.code??error.name}); throw error; }
    circuit.trace.push({ direction: 'forward', observer: state.relayId, previous: state.previous,
      next: layer.next, seq: body.seq, bytes: size, payload: layer.next === 'archive' ? layer.body : '[encrypted inner packet]' });
    body = layer.body;
  }
  return body;
}
async function deliverBackward(implementation, circuit, reply, seq) {
  let packet = reply;
  for (let i = circuit.hops.length - 1; i >= 0; i--) {
    const hop = circuit.hops[i];
    packet = await implementation.addReturnLayer(hop, packet, seq);
    circuit.trace.push({ direction: 'backward', observer: hop.relayId,
      previous: circuit.path[i + 1] ?? 'archive', next: circuit.path[i - 1] ?? 'client', seq, bytes: bytes(packet),
      payload: i === circuit.hops.length - 1 ? reply : '[encrypted inner packet]' });
  }
  return packet;
}
function archive(request) {
  requireThat(request?.operation === 'lookup' && Object.hasOwn(catalog, request.item), 'BAD_REQUEST');
  return { item: request.item, record: catalog[request.item] };
}
async function exchange(implementation, circuit, request = sampleRequest(), fault = {}) {
  requireThat(!circuit.closed, 'CIRCUIT_CLOSED');
  const seq = circuit.nextSeq++;
  requireThat(seq < 1024, 'REBUILD_REQUIRED');
  const packet = await implementation.wrapRequest(circuit.hops, request, seq);
  const arrived = await deliverForward(implementation, circuit, packet, fault);
  const reply = archive(arrived);
  circuit.trace.push({ direction: 'endpoint', observer: 'archive', previous: circuit.path.at(-1), payload: arrived });
  if (fault.dropReply) throw new LabError('REPLY_LOST', 'Archive received the lookup; client did not receive its reply.');
  const response = await deliverBackward(implementation, circuit, reply, seq);
  // The caller's request sequence is the expected identity at EVERY return layer.
  // Do not replace seq with a value read from an incoming packet.
  const unwrapped = await implementation.unwrapReply(circuit.hops, response, seq);
  // Client replay tracking is supplied; M4 applies the same rule to relay state.
  requireThat(!circuit.received.has(seq), 'REPLAY');
  circuit.received.add(seq);
  return unwrapped;
}
function tamper(packet) {
  const altered = structuredClone(packet);
  const bytes = fromBase64(altered.ciphertext);
  requireThat(bytes.length > 0, 'BAD_PACKET');
  bytes[0] ^= 1;
  altered.ciphertext = toBase64(bytes);
  return altered;
}
async function recover(implementation, oldCircuit, relays, failedIds) {
  closeCircuit(oldCircuit);
  const plan = await implementation.recoveryPlan(relays, failedIds, oldCircuit.path);
  if (plan.action === 'stop') return { plan, circuit: null };
  requireThat(plan.action === 'rebuild', 'BAD_PLAN');
  requireThat(!plan.path.some(id => failedIds.includes(id)), 'BAD_PLAN');
  return { plan, circuit: establish(plan.path, relays) };
}
function views(circuit) {
  // A pedagogical projection, NOT isolation from the local process operator.
  return Object.fromEntries([...circuit.path, 'archive'].map(id =>
    [id, circuit.trace.filter(event => event.observer === id)]));
}

return {directory,sampleRequest,establish,closeCircuit,deliverForward,deliverBackward,archive,exchange,tamper,recover,views};
})();
const BrowserChecks=(()=>{
const {assert}=BrowserAssert; const {context,seal,open}=BrowserCrypto; const {directory,establish,exchange,deliverForward,deliverBackward,sampleRequest,tamper,recover,views}=BrowserNetwork;
// Public requirement checks. These are practice feedback, not hidden certification.

const cases = [];
const add = (id, module, requirement, input, run) => cases.push({ id, module, requirement, input, run });
const circuit = () => establish(['cedar', 'birch', 'maple']);
const errorCode = async (fn, code) => {
  let observed='NO_ERROR';
  try { await fn(); } catch(error) { observed=error.code??error.name; }
  assert.equal(observed,code,`Expected ${code}; observed ${observed}`);
};
function validPath(path, relays, failed, length) {
  assert.equal(path.length, length, 'Keep the requested number of hops.');
  assert.equal(new Set(path).size, length, 'Each relay must occur only once.');
  assert.ok(path.every(id => relays.some(r => r.id === id && r.online) && !failed.includes(id)),
    'Only online, permitted, non-failed relay IDs may occur.');
}

add('M1-distinct', 1, 'Choose three distinct available relays.', { length: 3 }, async impl => {
  const relays = directory(); validPath(await impl.selectPath(relays, [], 3), relays, [], 3);
});
add('M1-filter', 1, 'Respect both failed and offline relays without mutating the directory.',
  { failed: ['cedar'], offline: 'birch' }, async impl => {
    const relays = directory(); relays[1].online = false; const before = structuredClone(relays);
    validPath(await impl.selectPath(relays, ['cedar']), relays, ['cedar'], 3); assert.deepEqual(relays, before);
  });
add('M1-no-path', 1, 'Stop explicitly if too few distinct relays remain.', { available: 2 }, async impl => {
  await errorCode(async () => await impl.selectPath(directory().slice(0, 2)), 'NO_PATH');
});
add('M1-duplicate-directory', 1, 'Duplicate directory rows do not create distinct hops.', { ids: ['cedar', 'cedar', 'birch'] }, async impl => {
  await errorCode(async () => await impl.selectPath([{id:'cedar',online:true},{id:'cedar',online:true},{id:'birch',online:true}]), 'NO_PATH');
});

add('M2-layer-order', 2, 'Only the intended next relay can open the remaining onion.', { route: ['cedar','birch','maple'], seq: 0 }, async impl => {
  const c = circuit(); let packet = await impl.wrapRequest(c.hops, sampleRequest(), 0);
  for (let i = 0; i < c.hops.length; i++) {
    const hop = c.hops[i];
    const layer = await open(hop.forwardKey, context(c.id, hop.relayId, 'forward', 0), packet);
    assert.equal(layer.next, c.path[i+1] ?? 'archive'); packet = layer.body;
  }
  assert.deepEqual(packet, sampleRequest());
});
add('M2-no-plaintext', 2, 'The outer packet exposes neither destination nor request.', { item:'luna' }, async impl => {
  const c = circuit(); const encoded = JSON.stringify(await impl.wrapRequest(c.hops, sampleRequest(), 1));
  for (const word of ['luna', 'lookup', 'archive', 'maple']) assert.ok(!encoded.includes(word), `Outer packet exposed ${word}`);
});
add('M2-context-binding', 2, 'Bind circuit, relay and direction to authentication.', { wrongContext: ['circuit','relay','direction'] }, async impl => {
  const c = circuit(); const hop = c.hops[0]; const packet = await impl.wrapRequest(c.hops, sampleRequest(), 2);
  const contexts = [context('other', hop.relayId,'forward',2), context(c.id,'elm','forward',2), context(c.id,hop.relayId,'backward',2)];
  for (const ctx of contexts) await errorCode(async () => await open(hop.forwardKey, ctx, packet), 'AUTH_FAILED');
});
add('M2-two-hops', 2, 'Construct from the supplied hop list, without hard-coding three layers.', { hops:2 }, async impl => {
  const c = establish(['elm','ash']); const first = await impl.wrapRequest(c.hops, {operation:'lookup',item:'tide'}, 5);
  let packet = first;
  for (const hop of c.hops) packet = (await open(hop.forwardKey, context(c.id,hop.relayId,'forward',5),packet)).body;
  assert.equal(packet.item,'tide');
});

add('M3-forward', 3, 'Peel exactly one authenticated layer and preserve the inner packet.', { request:sampleRequest() }, async impl => {
  const c = circuit(); const packet = await impl.wrapRequest(c.hops,sampleRequest(),0);
  assert.deepEqual(await deliverForward(impl,c,packet),sampleRequest());
});
add('M3-return', 3, 'Wrap reply exit-to-entry and unwrap entry-to-exit using backward keys.', { seq:4 }, async impl => {
  const c = circuit(); const reply = {record:'fictional atlas'};
  const packet = await deliverBackward(impl,c,reply,4);
  assert.deepEqual(await impl.unwrapReply(c.hops,packet,4),reply);
  await errorCode(async () => await open(c.hops[0].forwardKey,context(c.id,c.path[0],'backward',4),packet),'AUTH_FAILED');
});
add('M3-return-request-binding', 3, 'Bind a reply to the caller\'s expected request sequence, not the packet\'s claimed sequence.',
  { packetSequence:7, expectedSequence:8, correctExpectedSequence:7 }, async impl => {
    const c=establish(['elm','ash']), reply={record:'reply to request 7'};
    const packet=await deliverBackward(impl,c,reply,7);
    await errorCode(async ()=>await impl.unwrapReply(c.hops,packet,8),'BAD_PACKET');
    assert.deepEqual(await impl.unwrapReply(c.hops,packet,7),reply,
      'Rejecting the wrong expected sequence must not prevent the correctly matched reply.');
  });
add('M3-return-inner-binding', 3, 'Every return layer must bind to the same caller-supplied expected sequence.',
  { outerSequence:8, innerSequence:7, expectedSequence:8 }, async impl => {
    const c=establish(['elm','ash']);
    const inner=await impl.addReturnLayer(c.hops[1],{record:'reply to request 7'},7);
    const mixed=await impl.addReturnLayer(c.hops[0],inner,8);
    await errorCode(async ()=>await impl.unwrapReply(c.hops,mixed,8),'BAD_PACKET');
  });
add('M3-return-independent', 3, 'Stateless reply unwrapping permits correctly matched replies out of order and on independent circuits.',
  { arrivalSequences:[9,2], independentCircuitSequence:9 }, async impl => {
    const a=establish(['elm','ash']), b=establish(['elm','ash']);
    const early={record:'reply 2'}, late={record:'reply 9'}, separate={record:'independent reply 9'};
    const p2=await deliverBackward(impl,a,early,2), p9=await deliverBackward(impl,a,late,9);
    const independent=await deliverBackward(impl,b,separate,9);
    assert.deepEqual(await impl.unwrapReply(a.hops,p9,9),late);
    assert.deepEqual(await impl.unwrapReply(a.hops,p2,2),early);
    assert.deepEqual(await impl.unwrapReply(b.hops,independent,9),separate);
    assert.deepEqual(await impl.unwrapReply(a.hops,p2,2),early,
      'Unwrap is stateless: replay acceptance remains the receiver\'s separate responsibility.');
    await errorCode(async ()=>await impl.unwrapReply(b.hops,p9,9),'AUTH_FAILED');
  });
add('M3-wrong-route', 3, 'Reject an authenticated instruction that disagrees with local successor state.', { next:'ash', expected:'birch' }, async impl => {
  const c = circuit(); const s = c.states[0];
  const packet = await seal(s.forwardKey,context(c.id,s.relayId,'forward',6),{next:'ash',body:{}});
  await errorCode(async () => await impl.peelForward(s,packet),'BAD_ROUTE');
});
add('M3-missing-body', 3, 'Reject an authenticated matching route without a body before consuming its sequence.', { missing:'body' }, async impl => {
  const c=circuit(), s=c.states[0];
  const packet=await seal(s.forwardKey,context(c.id,s.relayId,'forward',10),{next:s.next});
  await errorCode(async ()=>await impl.peelForward(s,packet),'BAD_ROUTE');
  assert.equal(s.seenForward.size,0,'Rejected payload must not consume the sequence.');
});
add('M3-end-to-end', 3, 'Use the learner functions for the entire request and return.', { item:'luna' }, async impl => {
  const c=circuit(); assert.deepEqual(await exchange(impl,c),{item:'luna',record:'Luna: a fictional lunar atlas'});
  const v = views(c);
  assert.equal(v.cedar[0].payload,'[encrypted inner packet]');
  assert.equal(v.birch[0].payload,'[encrypted inner packet]');
  assert.deepEqual(v.maple[0].payload,sampleRequest());
  assert.equal(v.archive[0].previous,'maple');
});

add('M4-replay', 4, 'A relay must reject a repeated valid packet on the same circuit.', { repeatSeq:0 }, async impl => {
  const c=circuit(); const packet=await impl.wrapRequest(c.hops,sampleRequest(),0);
  await impl.peelForward(c.states[0],packet); await errorCode(async ()=>await impl.peelForward(c.states[0],packet),'REPLAY');
});
add('M4-tamper-first', 4, 'An invalid tag must not consume the sequence number.', { tamper:'ciphertext', then:'original' }, async impl => {
  const c=circuit(); const packet=await impl.wrapRequest(c.hops,sampleRequest(),0);
  await errorCode(async ()=>await impl.peelForward(c.states[0],tamper(packet)),'AUTH_FAILED');
  assert.equal(c.states[0].seenForward.size,0,'Authenticate before changing freshness state.');
  assert.equal((await impl.peelForward(c.states[0],packet)).next,'birch');
});
add('M4-header-tamper', 4, 'Changing the visible sequence must fail authentication.', { from:0,to:1 }, async impl => {
  const c=circuit(); const packet=await impl.wrapRequest(c.hops,sampleRequest(),0); packet.seq=1;
  await errorCode(async ()=>await impl.peelForward(c.states[0],packet),'AUTH_FAILED');
  assert.equal(c.states[0].seenForward.size,0);
});
add('M4-freshness-policy', 4, 'Accept unseen in-range values even out of order; reject replay and invalid values.', { arrival:[8,2,8] }, async impl => {
  const seen=new Set(); await impl.acceptSequence(seen,8); await impl.acceptSequence(seen,2);
  await errorCode(async ()=>await impl.acceptSequence(seen,8),'REPLAY');
  for (const seq of [-1,1024,1.5,NaN,'5',null]) await errorCode(async ()=>await impl.acceptSequence(seen,seq),'BAD_SEQUENCE');
  assert.deepEqual([...seen].sort((a,b)=>a-b),[2,8]);
});
add('M4-circuit-separation', 4, 'A packet from another circuit must fail without poisoning this circuit.', { reusedSeq:0 }, async impl => {
  const a=circuit(), b=circuit(); const packet=await impl.wrapRequest(a.hops,sampleRequest(),0);
  await errorCode(async ()=>await impl.peelForward(b.states[0],packet),'AUTH_FAILED');
  assert.equal(b.states[0].seenForward.size,0);
});
add('M4-return-tamper', 4, 'Return authentication must complete before any reply is accepted.', { tamper:'return-ciphertext' }, async impl => {
  const c=circuit(); const packet=await deliverBackward(impl,c,{record:'atlas'},9);
  await errorCode(async ()=>await impl.unwrapReply(c.hops,tamper(packet),9),'AUTH_FAILED');
});
add('M4-bad-route-state', 4, 'A rejected route must not mutate freshness state.', { next:'wrong' }, async impl => {
  const c=circuit(), s=c.states[0]; const packet=await seal(s.forwardKey,context(c.id,s.relayId,'forward',12),{next:'wrong',body:{}});
  await errorCode(async ()=>await impl.peelForward(s,packet),'BAD_ROUTE'); assert.equal(s.seenForward.size,0);
});

add('M5-rebuild', 5, 'Replace a broken circuit with distinct available relays and fresh circuit identity.', { failed:['birch'] }, async impl => {
  const c=circuit(); await errorCode(async ()=>await exchange(impl,c,sampleRequest(),{failAt:'birch'}),'RELAY_DOWN');
  const next=await recover(impl,c,directory(),['birch']);
  assert.equal(c.closed,true); assert.equal(next.plan.action,'rebuild');
  validPath(next.circuit.path,directory(),['birch'],3); assert.notEqual(next.circuit.id,c.id);
  assert.equal((await exchange(impl,next.circuit)).item,'luna');
  await errorCode(async ()=>await exchange(impl,c),'CIRCUIT_CLOSED');
});
add('M5-stop', 5, 'Report no path instead of weakening the requested route.', { failed:['cedar','birch','maple'] }, async impl => {
  assert.deepEqual(await impl.recoveryPlan(directory(),['cedar','birch','maple'],['cedar','birch','maple']),{action:'stop',reason:'NO_PATH'});
});
add('M5-old-packet', 5, 'Fresh circuit keys reject old packets even when a relay is reused.', { failed:['birch'] }, async impl => {
  const c=circuit(); const packet=await impl.wrapRequest(c.hops,sampleRequest(),0);
  const next=(await recover(impl,c,directory(),['birch'])).circuit;
  await errorCode(async ()=>await impl.peelForward(next.states[0],packet),'AUTH_FAILED');
});
add('M5-lost-reply', 5, 'A lost reply does not prove that the archive did not receive the request.', { dropReply:true }, async impl => {
  const c=circuit(); await errorCode(async ()=>await exchange(impl,c,sampleRequest(),{dropReply:true}),'REPLY_LOST');
  assert.equal(c.trace.filter(e=>e.observer==='archive').length,1);
  const next=(await recover(impl,c,directory(),[])).circuit; assert.equal((await exchange(impl,next)).item,'luna');
});

add('M6-shift', 6, 'Compare inter-event gaps, allowing an unknown constant delay.', { entry:[0,4,13],candidate:[50,54,63] }, async impl => {
  assert.deepEqual(await impl.correlate([0,4,13],[{id:'x',times:[50,54,63]},{id:'y',times:[50,59,63]}],0),['x']);
});
add('M6-ambiguity', 6, 'Keep every plausible match; matching is not proof of identity.', { matchingCandidates:2 }, async impl => {
  const candidates=[{id:'x',times:[20,24,33]},{id:'y',times:[70,75,83]},{id:'z',times:[10,14]}];
  assert.deepEqual([...await impl.correlate([0,4,13],candidates,1)],['x','y']);
});
add('M6-none', 6, 'Return no matches for incompatible or insufficient observations.', { events:1 }, async impl => {
  assert.deepEqual(await impl.correlate([0],[{id:'x',times:[10]}],1),[]);
  assert.deepEqual(await impl.correlate([0,4,13],[{id:'x',times:[10,20,30]}],0),[]);
});

async function evaluate(implementation, through = 6) {
  const results=[];
  for (const test of cases.filter(c=>c.module<=through)) {
    try { await test.run(implementation); results.push({...summary(test),pass:true}); }
    catch(error) { results.push({...summary(test),pass:false,code:error.code??error.name,detail:error.message,
      ...(error.actual !== undefined ? {actual:error.actual,expected:error.expected}: {})}); }
  }
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
}
function summary(test) { return {id:test.id,module:test.module,requirement:test.requirement,input:test.input,lesson:`lessons/0${test.module}.md`}; }

return {cases,evaluate};
})();
const BrowserWorkshop=(()=>{
const {requireThat,LabError}=BrowserCrypto; const {directory,establish,closeCircuit,deliverForward,deliverBackward,archive,recover}=BrowserNetwork;
// Ordered, entirely in-process experiments. This schedules the existing learner protocol.

const relayIds=directory().map(r=>r.id);
const fields={open:['circuit','length','avoid'],send:['circuit','packet','item','fault'],
  replay:['circuit','packet'],offline:['relays'],online:['relays'],recover:['circuit','replacement','failed'],close:['circuit']};
const fail=message=>{throw new LabError('BAD_SCENARIO',message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function only(value,keys,label) {
  if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(`${label}: use only ${keys.join(', ')}.`);
}
function alias(value,label) {if(typeof value!=='string'||!(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/).test(value))fail(`${label}: use a short letter-led name.`);}
function relays(value,label) {if(!Array.isArray(value)||value.some(x=>!relayIds.includes(x))||new Set(value).size!==value.length)fail(`${label}: use distinct supplied relay names.`);}
function validateWorkshop(input) {
  only(input,['version','title','predictions','steps'],'Scenario');
  if(input.version!==1||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)fail('Use version 1 and a title of 1–160 characters.');
  if(!Array.isArray(input.predictions)||input.predictions.length>12)fail('Use a predictions array (up to 12 claims).');
  for(const p of input.predictions) {
    only(p,['observer','claim'],'Prediction');
    if(!['client','archive','operator',...relayIds].includes(p.observer)||typeof p.claim!=='string'||!p.claim.trim()||p.claim.length>2000)fail('Each prediction needs a supplied observer and a claim of 1–2000 characters.');
  }
  if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>32)fail('Use 1–32 ordered steps.');
  for(const [i,s] of input.steps.entries()) {
    const label=`Step ${i+1}`;
    if(!object(s)||!Object.hasOwn(fields,s.action))fail(`${label}: unknown action.`);
    only(s,['action',...fields[s.action]],label);
    for(const key of ['circuit','packet','replacement'])if(fields[s.action].includes(key))alias(s[key],`${label} ${key}`);
    if(s.action==='open') {if(![2,3,4].includes(s.length))fail(`${label}: length must be 2, 3 or 4.`);relays(s.avoid,`${label} avoid`);}
    if(['online','offline'].includes(s.action))relays(s.relays,`${label} relays`);
    if(s.action==='recover')relays(s.failed,`${label} failed`);
    if(s.action==='send') {
      if(!['luna','tide'].includes(s.item))fail(`${label}: choose luna or tide.`);
      if(s.fault!==undefined) {
        only(s.fault,['kind','hop'],`${label} fault`);
        if(!['drop-forward','corrupt-forward','drop-reply'].includes(s.fault.kind))fail(`${label}: unknown fault.`);
        if(s.fault.kind==='drop-reply') {if(s.fault.hop!==undefined)fail(`${label}: drop-reply has no hop.`);}
        else if(!Number.isInteger(s.fault.hop)||s.fault.hop<0||s.fault.hop>3)fail(`${label}: hop is a zero-based index from 0 to 3.`);
      }
    }
  }
  const created=input.steps.filter(s=>['open','recover'].includes(s.action));
  const names=created.map(s=>s.action==='open'?s.circuit:s.replacement);
  if(names.length>8||new Set(names).size!==names.length)fail('Use at most 8 distinct circuit names; never replace an earlier name.');
  const packets=input.steps.filter(s=>s.action==='send').map(s=>s.packet);
  if(new Set(packets).size!==packets.length)fail('Every send needs a new packet name. Use replay to repeat captured bytes.');
  return structuredClone(input);
}

const workshopContract={id:'multi-circuit-workshop-v1',version:1,
  requirement:'Run learner-authored ordered steps with the submitted protocol; keep failed steps and observer-scoped evidence. Written claims are unassessed.',
  semantics:'Sequential logical steps, not time or concurrent network simulation. Explicit recovery only; no automatic retry. Relay downtime is known to the experiment operator. Client sees no reply without the hidden fault cause. Packet replay sends captured forward bytes; new sends allocate a fresh sequence. Existing module contracts still apply.',
  limits:{steps:32,circuits:8,predictions:12},actions:fields};

async function runWorkshop(impl,input) {
  const scenario=validateWorkshop(input),network=directory(),circuits=new Map(),captures=new Map();
  const observations=Object.fromEntries(['client',...relayIds,'archive'].map(id=>[id,[]]));
  const steps=[];
  let index=0;
  const record=(observer,event)=>observations[observer]?.push({step:index+1,...event});
  const snapshot=c=>({id:c.id,path:[...c.path],closed:c.closed,nextSeq:c.nextSeq,received:[...c.received],
    relayState:c.states.map(s=>({relay:s.relayId,seen:[...s.seenForward]}))});
  function circuit(name) {requireThat(circuits.has(name),'UNKNOWN_CIRCUIT',name);return circuits.get(name);}
  async function forward(c,name,packet,expectedSeq,fault={},clientWaiting=true) {
    const start=c.trace.length;
    let reachedClient=false;
    try {
      const destination=fault.hop===undefined?null:c.path[fault.hop];
      requireThat(fault.hop===undefined||destination,'BAD_HOP','The selected hop is outside this actual path.');
      const failed=c.path.find(id=>!network.find(r=>r.id===id).online);
      const request=await deliverForward(impl,c,packet,{failAt:failed,
        dropAt:fault.kind==='drop-forward'?destination:null,modifyAt:fault.kind==='corrupt-forward'?destination:null,
        onReceive:event=>record(event.observer,{...event,circuit:name,direction:'forward'})});
      let reply;
      try {reply=archive(request);}
      catch(error) {record('archive',{circuit:name,phase:'rejected',payload:request,code:error.code??error.name});throw error;}
      c.trace.push({direction:'endpoint',observer:'archive',previous:c.path.at(-1),payload:request});
      if(fault.kind==='drop-reply')throw new LabError('REPLY_LOST','Archive received the read-only lookup.');
      const response=await deliverBackward(impl,c,reply,expectedSeq);
      reachedClient=true;
      // Preserve accepted request binding at every return layer, including replay experiments.
      const unwrapped=await impl.unwrapReply(c.hops,response,expectedSeq);
      requireThat(!c.received.has(expectedSeq),'REPLAY');c.received.add(expectedSeq);
      record('client',{circuit:name,phase:'reply',seq:expectedSeq,payload:unwrapped});
      return unwrapped;
    } catch(error) {
      if(clientWaiting)record('client',{circuit:name,phase:'no-reply',detail:'No usable reply observed. The hidden fault cause and endpoint receipt are not established by this observation.'});
      if(!clientWaiting&&reachedClient)record('client',{circuit:name,phase:'rejected-reply',code:error.code??error.name});
      throw error;
    } finally {
      for(const event of c.trace.slice(start))record(event.observer,{...event,circuit:name,phase:'accepted'});
    }
  }
  try {
    for(index=0;index<scenario.steps.length;index++) {
      const action=scenario.steps[index],entry={step:index+1,input:action};
      try {
        if(action.action==='open') {
          const path=await impl.selectPath(network,action.avoid,action.length),c=establish(path,network);
          circuits.set(action.circuit,c);entry.value={path};record('client',{phase:'opened',circuit:action.circuit,path});
        }
        if(['offline','online'].includes(action.action)) {
          for(const id of action.relays)network.find(r=>r.id===id).online=action.action==='online';
          entry.value={relays:action.relays,online:action.action==='online'};
          // This is operator fault injection, not an oracle supplied to every observer.
        }
        if(action.action==='send') {
          const c=circuit(action.circuit);requireThat(!c.closed,'CIRCUIT_CLOSED');
          requireThat(action.fault?.hop===undefined||action.fault.hop<c.path.length,'BAD_HOP');
          const seq=c.nextSeq++;requireThat(seq<1024,'REBUILD_REQUIRED');
          const packet=await impl.wrapRequest(c.hops,{operation:'lookup',item:action.item},seq);
          captures.set(action.packet,{packet:structuredClone(packet),origin:action.circuit,seq});
          record('client',{phase:'sent',circuit:action.circuit,seq,item:action.item});
          entry.value=await forward(c,action.circuit,packet,seq,action.fault);
        }
        if(action.action==='replay') {
          requireThat(captures.has(action.packet),'UNKNOWN_PACKET',action.packet);
          const c=circuit(action.circuit);requireThat(!c.closed,'CIRCUIT_CLOSED');
          // Replay is experiment-operator injection; it is not a new client send or new encryption.
          const captured=captures.get(action.packet);
          entry.value=await forward(c,action.circuit,structuredClone(captured.packet),captured.seq,{},false);
        }
        if(action.action==='recover') {
          const old=circuit(action.circuit);requireThat(!old.closed,'CIRCUIT_CLOSED');
          record('client',{phase:'recovery-requested',circuit:action.circuit,failed:action.failed});
          const next=await recover(impl,old,network,action.failed);
          if(next.circuit)circuits.set(action.replacement,next.circuit);
          entry.value={plan:next.plan,oldClosed:old.closed,replacement:next.circuit?action.replacement:null};
          record('client',{phase:'recovered',circuit:action.circuit,...entry.value});
        }
        if(action.action==='close') {
          closeCircuit(circuit(action.circuit));entry.value={closed:true};record('client',{phase:'closed',circuit:action.circuit});
        }
        entry.outcome='returned';
      } catch(error) {entry.outcome='threw';entry.code=error.code??error.name;entry.detail=error.message;}
      entry.state=Object.fromEntries([...circuits].map(([name,c])=>[name,snapshot(c)]));
      steps.push(entry);
    }
    return {kind:'workshop',title:scenario.title,contract:workshopContract.id,predictions:scenario.predictions,
      reasoning:'UNASSESSED: compare your claims with observer evidence; step errors are experimental outcomes, not a course score.',
      steps,observations,circuits:Object.fromEntries([...circuits].map(([name,c])=>[name,snapshot(c)])),
      captures:[...captures].map(([name,c])=>({name,origin:c.origin,seq:c.seq})),
      visibility:'Operator-only steps and state contain the fault script and all circuits. Observer projections contain their local evidence. Shared step numbers and circuit names are teaching labels, not wire identifiers or timing measurements. Single-process simulation; no anonymity guarantee.',
      cleanup:'All remaining circuit key handles are discarded after this snapshot; closed fields describe the end of the authored steps.'};
  } finally {for(const c of circuits.values())closeCircuit(c);}
}

return {validateWorkshop,workshopContract,runWorkshop};
})();
const BrowserRunner=(()=>{
const {seal,open,context,requireThat,LabError}=BrowserCrypto; const {directory,establish,exchange,deliverForward,deliverBackward,archive,tamper,recover,views}=BrowserNetwork; const {evaluate,cases}=BrowserChecks; const {runWorkshop}=BrowserWorkshop;

const functionNames=['selectPath','wrapRequest','peelForward','addReturnLayer','unwrapReply','acceptSequence','recoveryPlan','correlate'];
function compileLearner(source) {
  requireThat(typeof source==='string'&&source.length>0&&source.length<=100000,'BAD_SOURCE','Use a nonempty project under 100,000 characters.');
  // Executed only inside the disposable worker, never in the document's global scope.
  const compile=new Function('seal','open','context','requireThat','LabError',
    '"use strict";\n'+source+'\nreturn {'+functionNames.map(n=>`${n}:typeof ${n}==="function"?${n}:undefined`).join(',')+'};');
  const implementation=compile(seal,open,context,requireThat,LabError);
  for(const name of functionNames)requireThat(typeof implementation[name]==='function','MISSING_FUNCTION',`Define ${name} using the browser starter.`);
  return implementation;
}
async function observed(action) {
  try{return {outcome:'returned',value:await action()};}
  catch(error){return {outcome:'threw',code:error.code??error.name,detail:error.message};}
}
async function diagnose(impl,options={}) {
  const mode=options.mode??'round-trip',item=options.item??'luna',length=Number(options.length??3);
  requireThat(['round-trip','tamper','replay','wrong-request','failed-hop','lost-reply'].includes(mode),'BAD_SCENARIO');
  requireThat(['luna','tide'].includes(item)&&[2,3,4].includes(length),'BAD_SCENARIO');
  const path=await impl.selectPath(directory(),[],length),circuit=establish(path);
  const request={operation:'lookup',item},events=[];let replacement=null;
  if(mode==='round-trip'||mode==='lost-reply') {
    events.push({action:mode,...await observed(()=>exchange(impl,circuit,request,{dropReply:mode==='lost-reply'}))});
  }else if(mode==='failed-hop') {
    events.push({action:'send through failed middle relay',...await observed(()=>exchange(impl,circuit,request,{failAt:path[1]}))});
    const next=await recover(impl,circuit,directory(),[path[1]]);replacement=next.circuit;
    events.push({action:'recovery plan',plan:next.plan,oldClosed:circuit.closed});
    if(replacement)events.push({action:'replacement lookup',...await observed(()=>exchange(impl,replacement,request))});
  }else {
    const seq=mode==='wrong-request'?7:0;
    const packet=await impl.wrapRequest(circuit.hops,request,seq),state=circuit.states[0];
    if(mode==='tamper')events.push({action:'altered packet',...await observed(()=>impl.peelForward(state,tamper(packet))),seenAfter:[...state.seenForward]});
    const forward=await observed(()=>deliverForward(impl,circuit,packet));
    events.push({action:'original forward',...forward});
    if(forward.outcome==='returned') {
      const reply=archive(forward.value);
      circuit.trace.push({direction:'endpoint',observer:'archive',previous:path.at(-1),payload:forward.value});
      const response=await deliverBackward(impl,circuit,reply,seq);
      if(mode==='wrong-request')events.push({action:'reply 7 offered to request 8',...await observed(()=>impl.unwrapReply(circuit.hops,response,8))});
      events.push({action:'matching reply',...await observed(()=>impl.unwrapReply(circuit.hops,response,seq))});
    }
    if(mode==='replay')events.push({action:'repeated forward packet',...await observed(()=>impl.peelForward(state,packet)),seenAfter:[...state.seenForward]});
  }
  return {mode:'learner-code simulation',scenario:mode,path,events,trace:circuit.trace,views:views(circuit),
    replacement:replacement?{path:replacement.path,trace:replacement.trace,views:views(replacement)}:null,
    visibility:'These are local observer projections. The single worker operator can inspect all state; this is not anonymity.'};
}
async function runProject(request) {
  const {source,command='check',through=6,options={}}=request;
  requireThat(['check','diagnose','capstone','workshop'].includes(command),'BAD_COMMAND');
  requireThat(Number.isInteger(through)&&through>=1&&through<=6,'BAD_MODULE');
  const impl=compileLearner(source);
  if(command==='workshop')return runWorkshop(impl,options.scenario);
  if(command==='diagnose')return diagnose(impl,options);
  const checks=await evaluate(impl,command==='capstone'?6:through);
  if(command==='check'||checks.passed!==checks.total)return {kind:command,checks,scenarios:'NOT_RUN unless capstone checks all pass'};
  const scenarios=[];
  for(const mode of ['round-trip','tamper','replay','wrong-request','failed-hop','lost-reply'])scenarios.push(await diagnose(impl,{mode,item:'tide'}));
  const transfer=[
    {id:'A',entry:[0,4,13,18],tolerance:1,candidates:[{id:'A',times:[50,54,63,68]},{id:'B',times:[80,85,93,98]},{id:'C',times:[100,104,114,121]}]},
    {id:'B',entry:[0,1,2,3],tolerance:0,candidates:[{id:'P',times:[20,21,22,23]},{id:'Q',times:[60,61,62,63]},{id:'R',times:[90,91,92,93]}]},
  ];
  for(const task of transfer)task.retained=await impl.correlate(task.entry,task.candidates,task.tolerance);
  return {kind:'capstone',checks,scenarios,transfer,reasoning:'UNASSESSED: apply the written capstone rubric.'};
}
const requirements=cases.map(({id,module,requirement,input})=>({id,module,requirement,input}));

return {compileLearner,diagnose,runProject,requirements};
})();
// Appended to the bundled adapters. One committed project per disposable worker.
const deliver=self.postMessage.bind(self);
const blockNetwork=()=>{throw new BrowserCrypto.LabError('NETWORK_DISABLED','Only the supplied simulated relays are available.');};
for(const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts']) {
  Object.defineProperty(self,name,{value:blockNetwork,writable:false,configurable:false});
}
let started=false;
self.addEventListener('message',async event=>{
  if(started)return;started=true;
  const {id,request}=event.data??{};
  try{
    const result=await BrowserRunner.runProject(request);
    BrowserCrypto.requireThat(JSON.stringify(result).length<=1000000,'RESULT_TOO_LARGE','The result exceeded the local one-million-character limit.');
    deliver({id,type:'result',result});
  }
  catch(error){deliver({id,type:'result',result:{executionFailure:true,code:error.code??error.name,detail:error.message}});}
});
