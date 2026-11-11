export const CONFIG = Object.freeze({ repairCost: 2, repairEnergy: 3, energyCap: 10, rangeMm: 400, receiptLimit: 2 });

export function initialState() {
  return { config: { ...CONFIG }, stations: [{ id: 'alpha', x: 0, y: 0 }, { id: 'beta', x: 2000, y: 0 }], actors: [] };
}

export function addActor(state, id) {
  const next = structuredClone(state);
  next.actors.push({ id, x: 0, y: 0, energy: 4, credits: 6, receipts: [] });
  return next;
}
