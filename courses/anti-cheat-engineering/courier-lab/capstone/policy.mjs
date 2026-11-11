/** Decide one validated repair request using only server-owned state. */
export function repair(state, actorId, request) {
  const next = structuredClone(state);
  const actor = next.actors.find(({ id }) => id === actorId);
  const previous = actor.receipts.find(({ requestId }) => requestId === request.requestId);
  const result = (reason, receipt = null) => ({ reason, receipt, state: next });
  if (previous && previous.stationId !== request.stationId) return result('conflict');
  if (previous) return result('duplicate', previous);
  const station = next.stations.find(({ id }) => id === request.stationId);
  if (!station) return result('station');
  if (actor.receipts.length >= next.config.receiptLimit) return result('history-full');
  const distanceSquared = (actor.x - station.x) ** 2 + (actor.y - station.y) ** 2;
  if (distanceSquared > next.config.rangeMm ** 2) return result('range');
  if (actor.energy >= next.config.energyCap) return result('full');
  if (actor.credits < next.config.repairCost) return result('funds');
  const energyAdded = Math.min(next.config.repairEnergy, next.config.energyCap - actor.energy);
  actor.energy += energyAdded;
  actor.credits -= next.config.repairCost;
  const receipt = { requestId: request.requestId, stationId: request.stationId, energyAdded, creditsSpent: next.config.repairCost, energy: actor.energy, credits: actor.credits };
  actor.receipts.push(receipt);
  return result('repaired', receipt);
}
