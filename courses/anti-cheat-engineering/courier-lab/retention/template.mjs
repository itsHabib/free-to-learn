/**
 * Inputs are validated and in nondecreasing tick order.
 * Return the newest eligible events, each with exactly four permitted fields.
 * Keep the source array, its events and the settings unchanged.
 */
export function retain(events, { nowTick, maxAgeTicks, maxEvents }) {
  // TODO: apply the exclusive old edge and inclusive current edge.
  // TODO: keep the newest maxEvents and project the permitted fields.
  return [];
}
