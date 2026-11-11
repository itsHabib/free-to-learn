// Public requirement checks. These are practice feedback, not hidden certification.
import {assert} from './assert.mjs';
import { context, seal, open } from './crypto.mjs';
import { directory, establish, exchange, deliverForward, deliverBackward, sampleRequest,
  tamper, recover, views } from './network.mjs';

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
  for (const seq of [-1,1024,1.5,NaN]) await errorCode(async ()=>await impl.acceptSequence(seen,seq),'BAD_SEQUENCE');
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
  assert.deepEqual([...await impl.correlate([0,4,13],candidates,1)].sort(),['x','y']);
});
add('M6-none', 6, 'Return no matches for incompatible or insufficient observations.', { events:1 }, async impl => {
  assert.deepEqual(await impl.correlate([0],[{id:'x',times:[10]}],1),[]);
  assert.deepEqual(await impl.correlate([0,4,13],[{id:'x',times:[10,20,30]}],0),[]);
});

export { cases };
export async function evaluate(implementation, through = 6) {
  const results=[];
  for (const test of cases.filter(c=>c.module<=through)) {
    try { await test.run(implementation); results.push({...summary(test),pass:true}); }
    catch(error) { results.push({...summary(test),pass:false,code:error.code??error.name,detail:error.message,
      ...(error.actual !== undefined ? {actual:error.actual,expected:error.expected}: {})}); }
  }
  return {passed:results.filter(r=>r.pass).length,total:results.length,results};
}
function summary(test) { return {id:test.id,module:test.module,requirement:test.requirement,input:test.input,lesson:`lessons/0${test.module}.md`}; }
