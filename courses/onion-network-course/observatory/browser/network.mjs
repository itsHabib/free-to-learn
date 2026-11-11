// Supplied in-process harness. There are no sockets, DNS calls or external relays.
const randomUUID=()=>globalThis.crypto.randomUUID();
import { freshKey, destroyKey, requireThat, LabError } from './crypto.mjs';
import {utf8,toBase64,fromBase64} from './crypto.mjs';

export const directory = () => ['cedar', 'birch', 'maple', 'elm', 'ash'].map(id => ({ id, online: true }));
export const sampleRequest = () => ({ operation: 'lookup', item: 'luna' });
const catalog = { luna: 'Luna: a fictional lunar atlas', tide: 'Tide: a fictional ocean atlas' };

export function establish(path, relays = directory()) {
  requireThat(path.length >= 2 && new Set(path).size === path.length, 'BAD_PATH');
  requireThat(path.every(id => relays.some(r => r.id === id && r.online)), 'BAD_PATH');
  const circuitId = randomUUID();
  const hops = path.map(relayId => ({ circuitId, relayId, forwardKey: freshKey(), backwardKey: freshKey() }));
  // Omniscient setup is deliberately supplied. It is NOT a handshake or Tor telescoping.
  const states = hops.map((hop, i) => ({ ...hop, previous: path[i - 1] ?? 'client',
    next: path[i + 1] ?? 'archive', seenForward: new Set() }));
  return { id: circuitId, path: [...path], hops, states, nextSeq: 0, received: new Set(), closed: false, trace: [] };
}
export function closeCircuit(circuit) {
  circuit.closed = true;
  for (const hop of circuit.hops) { destroyKey(hop.forwardKey); destroyKey(hop.backwardKey); }
}
const bytes = packet => utf8(JSON.stringify(packet)).length;

export async function deliverForward(implementation, circuit, packet, { failAt = null, modifyAt = null, dropAt = null, onReceive = () => {} } = {}) {
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
export async function deliverBackward(implementation, circuit, reply, seq) {
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
export function archive(request) {
  requireThat(request?.operation === 'lookup' && Object.hasOwn(catalog, request.item), 'BAD_REQUEST');
  return { item: request.item, record: catalog[request.item] };
}
export async function exchange(implementation, circuit, request = sampleRequest(), fault = {}) {
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
export function tamper(packet) {
  const altered = structuredClone(packet);
  const bytes = fromBase64(altered.ciphertext);
  requireThat(bytes.length > 0, 'BAD_PACKET');
  bytes[0] ^= 1;
  altered.ciphertext = toBase64(bytes);
  return altered;
}
export async function recover(implementation, oldCircuit, relays, failedIds) {
  closeCircuit(oldCircuit);
  const plan = await implementation.recoveryPlan(relays, failedIds, oldCircuit.path);
  if (plan.action === 'stop') return { plan, circuit: null };
  requireThat(plan.action === 'rebuild', 'BAD_PLAN');
  requireThat(!plan.path.some(id => failedIds.includes(id)), 'BAD_PLAN');
  return { plan, circuit: establish(plan.path, relays) };
}
export function views(circuit) {
  // A pedagogical projection, NOT isolation from the local process operator.
  return Object.fromEntries([...circuit.path, 'archive'].map(id =>
    [id, circuit.trace.filter(event => event.observer === id)]));
}
