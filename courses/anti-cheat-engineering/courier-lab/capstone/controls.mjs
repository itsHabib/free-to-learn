import { adaptRequest } from './server.mjs';

function queuePolicy(state, actorId, request) {
  const next = JSON.parse(JSON.stringify(state));
  const actor = next.actors.filter((item) => item.id === actorId)[0];
  const old = actor.receipts.filter((item) => item.requestId === request.requestId)[0];
  const reply = (reason, receipt = null) => ({ reason, receipt, state: next });
  if (old) return reply(old.stationId === request.stationId ? 'duplicate' : 'conflict', old.stationId === request.stationId ? old : null);
  const station = next.stations.filter((item) => item.id === request.stationId)[0];
  if (!station) return reply('station');
  if (actor.receipts.length === next.config.receiptLimit) return reply('history-full');
  if ((actor.x - station.x) ** 2 + (actor.y - station.y) ** 2 > next.config.rangeMm ** 2) return reply('range');
  if (actor.energy === next.config.energyCap) return reply('full');
  if (actor.credits < next.config.repairCost) return reply('funds');
  const energy = Math.min(actor.energy + next.config.repairEnergy, next.config.energyCap);
  const receipt = { requestId: request.requestId, stationId: request.stationId, energyAdded: energy - actor.energy, creditsSpent: next.config.repairCost, energy, credits: actor.credits - next.config.repairCost };
  Object.assign(actor, { energy, credits: receipt.credits, receipts: [...actor.receipts, receipt] });
  return reply('repaired', receipt);
}

function transactionPolicy(state, actorId, request) {
  const actor = state.actors.find((item) => item.id === actorId);
  const old = actor.receipts.find((item) => item.requestId === request.requestId);
  const station = state.stations.find((item) => item.id === request.stationId);
  let reason = 'repaired';
  if (old) reason = old.stationId === request.stationId ? 'duplicate' : 'conflict';
  if (!old && !station) reason = 'station';
  if (!old && station && actor.receipts.length >= state.config.receiptLimit) reason = 'history-full';
  if (reason === 'repaired' && Math.hypot(actor.x - station.x, actor.y - station.y) > state.config.rangeMm) reason = 'range';
  if (reason === 'repaired' && actor.energy >= state.config.energyCap) reason = 'full';
  if (reason === 'repaired' && actor.credits < state.config.repairCost) reason = 'funds';
  const next = structuredClone(state);
  if (reason === 'duplicate') return { reason, receipt: structuredClone(old), state: next };
  if (reason !== 'repaired') return { reason, receipt: null, state: next };
  const updated = next.actors.find((item) => item.id === actorId);
  const energyAdded = Math.min(state.config.repairEnergy, state.config.energyCap - actor.energy);
  updated.energy += energyAdded;
  updated.credits -= state.config.repairCost;
  const receipt = { requestId: request.requestId, stationId: request.stationId, energyAdded, creditsSpent: state.config.repairCost, energy: updated.energy, credits: updated.credits };
  updated.receipts = updated.receipts.concat(receipt);
  return { reason, receipt, state: next };
}

export const correctPolicies = [
  { name: 'copied bounded receipt queue', repair: queuePolicy },
  { name: 'decide before copying transaction', repair: transactionPolicy },
];
const actorIn = (state, id) => state.actors.find((actor) => actor.id === id);
const failure = (state, reason) => ({ reason, receipt: null, state: structuredClone(state) });

export const wrongPolicies = [
  { name: 'duplicate charged again', intended: 'original receipt', repair(state, id, request) {
    const copy = structuredClone(state);
    actorIn(copy, id).receipts = actorIn(copy, id).receipts.filter((receipt) => receipt.requestId !== request.requestId);
    return queuePolicy(copy, id, request);
  } },
  { name: 'range checked before receipt', intended: 'retry after movement', repair(state, id, request) {
    const actor = actorIn(state, id);
    const station = state.stations.find((item) => item.id === request.stationId);
    if (station && Math.hypot(actor.x - station.x, actor.y - station.y) > state.config.rangeMm) return failure(state, 'range');
    return queuePolicy(state, id, request);
  } },
  { name: 'conflict treated as duplicate', intended: 'station conflict', repair(state, id, request) {
    const old = actorIn(state, id).receipts.find((receipt) => receipt.requestId === request.requestId);
    return queuePolicy(state, id, old ? { ...request, stationId: old.stationId } : request);
  } },
  { name: 'failed ID reserved', intended: 'failed request changes nothing', repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason !== 'range') return result;
    const actor = actorIn(result.state, id);
    actor.receipts.push({ ...request, energyAdded: 0, creditsSpent: 0, energy: actor.energy, credits: actor.credits });
    return result;
  } },
  { name: 'exclusive distance boundary', intended: 'inclusive range edge', repair(state, id, request) {
    const actor = actorIn(state, id);
    const station = state.stations.find((item) => item.id === request.stationId);
    if (station && Math.hypot(actor.x - station.x, actor.y - station.y) === state.config.rangeMm) return failure(state, 'range');
    return queuePolicy(state, id, request);
  } },
  { name: 'one-credit repair', intended: 'successful resource transaction', repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason !== 'repaired') return result;
    actorIn(result.state, id).credits += 1;
    result.receipt.creditsSpent = 1;
    result.receipt.credits += 1;
    return result;
  } },
  { name: 'two-energy repair', intended: 'successful resource transaction', repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason !== 'repaired') return result;
    actorIn(result.state, id).energy -= 1;
    result.receipt.energyAdded -= 1;
    result.receipt.energy -= 1;
    return result;
  } },
  { name: 'wrong receipt balance', intended: 'successful resource transaction', repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason === 'repaired') result.receipt.energy += 1;
    return result;
  } },
  { name: 'range refusal debits credit', intended: 'failed request changes nothing', repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason === 'range') actorIn(result.state, id).credits -= 1;
    return result;
  } },
  { name: 'evict oldest receipt', intended: 'history bound', repair(state, id, request) {
    const copy = structuredClone(state);
    const actor = actorIn(copy, id);
    if (actor.receipts.length >= copy.config.receiptLimit && !actor.receipts.some((receipt) => receipt.requestId === request.requestId)) actor.receipts.shift();
    return queuePolicy(copy, id, request);
  } },
  { name: 'ignore vertical distance', intended: 'diagonal range', repair(state, id, request) {
    const copy = structuredClone(state);
    const station = copy.stations.find((item) => item.id === request.stationId);
    if (station) actorIn(copy, id).y = station.y;
    return queuePolicy(copy, id, request);
  } },
  { name: 'ignore energy cap', intended: 'partial top-up', policyOnly: true, repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.reason !== 'repaired') return result;
    const actor = actorIn(result.state, id);
    actor.energy = actorIn(state, id).energy + state.config.repairEnergy;
    result.receipt.energyAdded = state.config.repairEnergy;
    result.receipt.energy = actor.energy;
    return result;
  } },
  { name: 'mutate input state', intended: 'source unchanged', policyOnly: true, repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    Object.assign(state, result.state);
    return result;
  } },
  { name: 'return aliased rejection state', intended: 'fresh state', policyOnly: true, repair(state, id, request) {
    const result = queuePolicy(state, id, request);
    if (result.receipt === null) result.state = state;
    return result;
  } },
  { name: 'globally scoped request IDs', intended: 'same ID and receipt capacity', repair(state, id, request) {
    const previous = state.actors.flatMap((actor) => actor.receipts).find((receipt) => receipt.requestId === request.requestId);
    if (previous) return { reason: 'duplicate', receipt: structuredClone(previous), state: structuredClone(state) };
    return queuePolicy(state, id, request);
  } },
];

export const wrongAdapters = [{ name: 'accept client resource claims', requestAdapter(state, id, body) {
  const actor = actorIn(state, id);
  for (const key of ['x', 'y', 'energy', 'credits']) {
    if (Object.hasOwn(body, key)) actor[key] = body[key];
  }
  return adaptRequest(state, id, { requestId: body.requestId, stationId: body.stationId });
} }];
