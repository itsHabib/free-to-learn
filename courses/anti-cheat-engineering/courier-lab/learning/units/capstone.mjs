// Sources: teaching-repair/interface.md (base bf923c11) and capstone/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'capstone/LEARNER.md', anchor });
export const unit = {
  id: 'capstone',
  intro: 'A repair request can arrive twice after its reply is lost. Trace the owner’s receipt and resource changes, then choose an observation that can expose a repeated charge.', title: 'M11 · Reason about a repair transaction', prerequisites: ['spatial', 'order', 'testing', 'recovery'],
  objectives: [
    { id: 'capstone.identity', kind: 'procedure', text: 'Resolve actor-scoped retry identities before new repair checks.', prerequisites: ['order.admission', 'recovery.loss'] },
    { id: 'capstone.transaction', kind: 'procedure', text: 'Compute a repair or refusal while preserving atomic resource changes.', prerequisites: ['spatial.range', 'capstone.identity'] },
    { id: 'capstone.observe', kind: 'procedure', text: 'Identify state and receipt mismatches that an independent test must assert.', prerequisites: ['testing.observe', 'testing.controls', 'capstone.transaction'] },
  ],
  sections: [
    { id: 'identity', title: 'Resolve a retry before doing new work', objectiveIds: ['capstone.identity'],
      paragraphs: [
        'A receipt records one successful repair and its requestId, stationId, energyAdded, creditsSpent and resulting balances. Search the current actor’s receipts first. A matching ID and station returns duplicate with the original receipt; the same ID and a different station returns conflict.',
        'A retry acknowledges old work. The actor may have moved away or spent more energy since that work, so rechecking range first would wrongly reject its acknowledgment. Another actor may use the same request ID independently. Failed attempts create no receipt and do not reserve the ID.',
      ],
      worked: { prompt: 'Actor A repaired at alpha with request k, gaining 3 energy and spending 2 credits. A later moves out of range and retries k at alpha.', steps: ['Search A’s receipts before distance checks.', 'Find k with station alpha.', 'Return duplicate with the original receipt and unchanged current state.'], answer: 'No new debit, no new energy and no new receipt. A retry at beta would be conflict.' },
      completion: { prompt: 'Actor B uses k for the first time, while actor A already has a receipt for k.', steps: ['Receipt identity is scoped to the current actor.', 'B has no matching receipt.'], missing: 'Supply whether A’s receipt makes B’s request a duplicate.' }, source: source('request-identity') },
    { id: 'transaction', title: 'Change resources together or leave them alone', objectiveIds: ['capstone.transaction'],
      paragraphs: [
        'For a new request, check station, receipt capacity, circular range, energy below the cap and sufficient credits, in that order. The range edge is included. All values come from server state; the client supplies only the request ID and station ID.',
        'On success, add the smaller of repairEnergy and the gap to energyCap, subtract the full repairCost, and append one receipt. Those changes form one transaction: all happen or none happen. A refusal leaves energy, credits and receipt history unchanged, allowing the same ID to succeed after the condition changes.',
      ],
      worked: { prompt: 'A storage service charges 2 credits to add up to 4 units. Capacity is 12; the balance is 11 units and 5 credits.', steps: ['The remaining capacity is 12 minus 11, or 1 unit.', 'Add min(4,1), which is 1 unit, and charge the full 2 credits.', 'Store a receipt for the actual addition and resulting balances.'], answer: 'The new balances are 12 units and 3 credits; the receipt records one added unit.' },
      completion: { prompt: 'A repair costs 2, adds up to 3 and caps energy at 10. The actor has energy 9 and credits 4, and all other checks pass.', steps: ['The remaining energy space is 1.', 'The repair is allowed and charges the full price.'], missing: 'Supply energyAdded, final energy and final credits.' }, source: source('one-resource-transaction') },
    { id: 'observe', title: 'Test the state that the rule promises', objectiveIds: ['capstone.observe'],
      paragraphs: [
        'A response saying repaired does not establish the right energy, cost or receipt. Compare actual values with independently calculated values. On refusal, compare the whole relevant state before and after; a correct reason can hide an early debit.',
        'Use both correct and deliberately wrong implementations to check your scenario. A scenario should accept different correct implementations and expose wrong costs, additions, receipts and refusal effects. These questions rehearse those observations. The source capstone still requires you to write the complete policy and independent HTTP scenario; answering a small diagnostic is not that production performance.',
      ],
      worked: { prompt: 'A successful repair starts at energy 4 and credits 6; cost is 2, addition is 3 and cap is 10. A response says repaired but returns energy 7 and credits 5.', steps: ['Calculate energy as min(10,4+3), giving 7.', 'Calculate credits as 6 minus 2, giving 4.', 'Assert the actual credit balance equals 4; a reason-only assertion would miss the error.'], answer: 'Energy is correct, but the credit assertion must fail because 5 differs from 4.' },
      completion: { prompt: 'A range refusal returns the right reason, but credits change from 6 to 5.', steps: ['A refusal must leave every resource and the receipt list unchanged.'], missing: 'Name the state comparison that detects the defect.' }, source: source('independent-http-tests') },
  ],
  masterySlots: ['identity', 'atomic', 'transfer'],
  support: {
    milestones: ['Resolve matching and conflicting retries from this actor’s receipts.', 'Compute one success and each ordered refusal without partial mutations.', 'Write capstone/policy.mjs and capstone/scenario.mjs, then inspect both policy and scenario criteria.'],
    hints: ['Find any prior success for this actor and request before checking a new repair.', 'For a new request, stop at the first refusal; on success calculate capacity, cost and receipt together.', 'After a committed attempt, compare the observed state field by field with a separately calculated result.'], reference: 'capstone/LEARNER.md',
  },
};

function hashSeed(seed) { let n = 2166136261; for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0; return n; }
function stateCase(n, identity) {
  const config = { repairCost: 2 + n % 3, repairEnergy: 2 + n % 4, energyCap: 12, rangeMm: 100, receiptLimit: 2 };
  const request = { requestId: `request-${n % 31}`, stationId: 'alpha' };
  const receipt = { requestId: request.requestId, stationId: 'alpha', energyAdded: 2, creditsSpent: config.repairCost, energy: 8, credits: 7 };
  const actor = { id: 'actor-a', x: 0, y: 0, energy: 3 + n % 7, credits: 10, receipts: [] };
  const state = { config, stations: [{ id: 'alpha', x: 0, y: 0 }, { id: 'beta', x: 500, y: 0 }], actors: [actor, { id: 'actor-b', x: 0, y: 0, energy: 2, credits: 10, receipts: [structuredClone(receipt)] }] };
  if (identity && n % 4 < 2) { actor.receipts.push(receipt); actor.x = 1000; }
  if (identity && n % 4 === 1) request.stationId = 'beta';
  if (!identity && n % 6 === 0) actor.x = 100;
  if (!identity && n % 6 === 1) actor.x = 101;
  if (!identity && n % 6 === 2) actor.energy = config.energyCap;
  if (!identity && n % 6 === 3) actor.credits = config.repairCost - 1;
  if (!identity && n % 6 === 4) { actor.receipts = [{ ...receipt, requestId: 'old-a' }, { ...receipt, requestId: 'old-b' }]; actor.x = 101; }
  if (!identity && n % 6 === 5) request.stationId = 'missing';
  return { state, actorId: actor.id, request };
}
function resultFor({ state, actorId, request }) {
  const actor = structuredClone(state.actors.find((a) => a.id === actorId));
  const previous = actor.receipts.find((r) => r.requestId === request.requestId);
  const result = (reason, receipt = null) => ({ reason, receipt, energy: actor.energy, credits: actor.credits, receiptCount: actor.receipts.length });
  if (previous && previous.stationId !== request.stationId) return result('conflict');
  if (previous) return result('duplicate', previous);
  const station = state.stations.find((s) => s.id === request.stationId);
  if (!station) return result('station');
  if (actor.receipts.length >= state.config.receiptLimit) return result('history-full');
  if ((actor.x - station.x) ** 2 + (actor.y - station.y) ** 2 > state.config.rangeMm ** 2) return result('range');
  if (actor.energy >= state.config.energyCap) return result('full');
  if (actor.credits < state.config.repairCost) return result('funds');
  const energyAdded = Math.min(state.config.repairEnergy, state.config.energyCap - actor.energy);
  actor.energy += energyAdded;
  actor.credits -= state.config.repairCost;
  const receipt = { ...request, energyAdded, creditsSpent: state.config.repairCost, energy: actor.energy, credits: actor.credits };
  actor.receipts.push(receipt);
  return result('repaired', receipt);
}
function observationExperiment(n, base) {
  const actorId = 'actor-a';
  const kind = (n >>> 3) % 3;
  const priorId = `accepted-${n % 101}`;
  const config = { repairCost: 1 + n % 4, repairEnergy: 2 + (n >>> 5) % 5, energyCap: 12 + (n >>> 10) % 5 };
  const priorReceipts = [{ actorId: kind === 2 ? 'actor-b' : actorId, requestId: priorId, stationId: 'alpha', energyAdded: 2, creditsSpent: config.repairCost, energy: 9, credits: 4 }];
  const request = { requestId: kind === 1 ? `fresh-${n % 103}` : priorId, stationId: 'alpha' };
  const savedReceipts = priorReceipts.filter((r) => r.actorId === actorId).map(({ actorId: owner, ...receipt }) => receipt);
  const snapshotBefore = n % 2 === 0 ? { actorId, energy: 1 + (n >>> 14) % 6, credits: config.repairCost + 6 + (n >>> 19) % 8, receipts: savedReceipts } : null;
  const duplicate = priorReceipts.some((r) => r.actorId === actorId && r.requestId === request.requestId);
  const expected = { probe: 'actor-state', when: snapshotBefore ? 'after' : 'before-and-after', operation: duplicate ? 'duplicate' : 'new', creditsDelta: duplicate ? 0 : -config.repairCost, energyInvariant: duplicate ? 'unchanged' : 'add-up-to-cap', receiptCountDelta: duplicate ? 0 : 1, receiptIdentity: duplicate ? 'preserve-existing' : 'record-request', replyAloneSuffices: false };
  const inputs = {
    experiment: 'matching-replies-hidden-state', actorId, request, config, priorReceipts, snapshotBefore,
    preconditions: 'The request has not run. The actor is at alpha, below the energy cap, has enough credits and room for a new receipt. No concurrent action or history eviction occurs during this probe.',
    availableProbes: [
      { id: 'repair-reply', returns: 'The POST reply; the two candidate implementations return identical bytes, even if one changes hidden state incorrectly.' },
      { id: 'actor-state', returns: 'A read-only authoritative snapshot of this actor: energy, credits and successful receipts.' },
      { id: 'other-actor-state', returns: 'A read-only snapshot of actor-b only.' },
      { id: 'station-list', returns: 'Station coordinates, with no actor balances or receipts.' },
    ],
  };
  return { ...base, objectiveIds: ['capstone.identity', 'capstone.transaction', 'capstone.observe'], inputs, expected, hints: [],
    prompt: 'Design the smallest observation experiment that can expose hidden repair side effects when two implementations return matching POST replies. The trigger request has not run. Choose one available probe and schedule its read(s) around that one trigger. A non-null snapshotBefore is a complete saved authoritative baseline and needs no new before-read; historical receipt balances are not a current baseline. Return exactly {probe,when,operation,creditsDelta,energyInvariant,receiptCountDelta,receiptIdentity,replyAloneSuffices}. Use when after or before-and-after; operation duplicate or new; energyInvariant unchanged or add-up-to-cap; receiptIdentity preserve-existing or record-request. Deltas mean after minus before. add-up-to-cap means afterEnergy = min(energyCap,beforeEnergy+repairEnergy). preserve-existing means the original current-actor receipt remains byte-for-byte unchanged; record-request means exactly one new current-actor receipt for this request records the actual change. Choose the schedule and invariant the correct implementation must satisfy, not a guess about the identical replies.',
    explanation: `The experiment is ${JSON.stringify(expected)}. ${duplicate ? 'This request repeats a successful ID for this actor, so balances and receipt history must stay unchanged; the original receipt survives even if its historical balances differ from the current baseline.' : 'No receipt matches this actor and request together, so this is new work: charge once, apply the bounded addition and append one current-actor receipt. An ID used only by another actor does not make this a duplicate.'} ${snapshotBefore ? 'A trustworthy before-snapshot is already saved, so one actor-state read after the trigger is sufficient.' : 'There is no current before-snapshot; read this actor before the trigger and again after it completes to compare the invariant.'} Reading the matching reply, another actor or station coordinates cannot establish this actor’s state transition.` };
}
function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown capstone item mode');
  const section = mode === 'mastery' ? { identity: 'identity', atomic: 'transaction', transfer: 'observe' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown capstone item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `capstone:${mode}:${key}:${seed}`, objectiveIds: [`capstone.${section}`], format: { type: 'json' }, source: source(section === 'identity' ? 'request-identity' : section === 'transaction' ? 'one-resource-transaction' : 'independent-http-tests') };
  if (mode === 'mastery' && key === 'transfer') return observationExperiment(n, base);
  if (section === 'observe') {
    const config = { repairCost: 1 + n % 4, repairEnergy: 2 + (n >>> 6) % 5, energyCap: 10 + (n >>> 10) % 8 };
    const energy = (n >>> 13) % config.energyCap;
    const credits = config.repairCost + 3 + (n >>> 17) % 15;
    const correctEnergy = Math.min(config.energyCap, energy + config.repairEnergy);
    const correctCredits = credits - config.repairCost;
    const observed = { energy: correctEnergy, credits: correctCredits, receipt: { energy: correctEnergy, credits: correctCredits, energyAdded: correctEnergy - energy, creditsSpent: config.repairCost } };
    if (n % 5 === 1) observed.energy -= 1;
    if (n % 5 === 2) observed.credits += 1;
    if (n % 5 === 3) observed.receipt.energy += 1;
    if (n % 5 === 4) { observed.energy -= 1; observed.receipt.energyAdded -= 1; }
    const expected = { energyMatches: observed.energy === correctEnergy, creditsMatch: observed.credits === correctCredits, receiptMatches: observed.receipt.energy === correctEnergy && observed.receipt.credits === correctCredits && observed.receipt.energyAdded === correctEnergy - energy && observed.receipt.creditsSpent === config.repairCost };
    return { ...base, inputs: { context: 'quota service applying a successful bounded resource grant', before: { energy, credits }, config, observed }, expected,
      prompt: 'All admission checks passed for a new request in a quota service using the repair rule: charge the full cost, add up to the remaining cap, and record the actual change and resulting balances. Independently calculate the expected resource change. Return {energyMatches,creditsMatch,receiptMatches} for the observed result. A correct reason label is not evidence that these values agree.',
      explanation: `The correct energy is ${correctEnergy}, credits ${correctCredits}, energyAdded ${correctEnergy - energy} and creditsSpent ${config.repairCost}. Comparing each promised result gives ${JSON.stringify(expected)}. A test that checks only the returned reason would miss any false entry.`,
      hints: ['Compute the resource change without reading the observed values first.', 'Compare both final balances and all four numeric receipt fields.', `The independent comparisons are ${JSON.stringify(expected)}.`] };
  }
  const inputs = stateCase(n, section === 'identity');
  const expected = resultFor(inputs);
  return { ...base, inputs, expected,
    prompt: `${mode === 'completion' ? 'The request is validated and actor identity is already resolved. Complete the policy decision. ' : ''}Resolve this actor’s existing request ID first: different station is conflict; same station is duplicate with the original receipt. For a new ID check station, receipt capacity, squared circular range (edge included), energy below cap, then funds. On success add min(repairEnergy,remaining space), charge full repairCost and append a receipt. Return {reason,receipt,energy,credits,receiptCount}. Every refusal has receipt:null and unchanged balances/history.`,
    explanation: `The expected decision is ${JSON.stringify(expected)}. Receipts belong to this actor, so another actor’s same ID has no effect. Existing success is checked before current range or capacity. New requests stop at the first failing requirement; no failed check reserves the ID or debits resources. A duplicate returns its original receipt even when current balances differ.`,
    hints: ['Search the named actor’s receipts before looking at the station or current range.', 'For a new ID, stop at the first refusal; calculate all resource effects only after every check passes.', `The complete result projection is ${JSON.stringify(expected)}.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const actor = x.state?.actors.find((a) => a.id === x.actorId);
    const position = actor?.receipts.findIndex((r) => r.requestId === x.request.requestId);
    const steps = args.key === 'identity'
      ? [`The current actor's receipt lookup is complete: request ${x.request.requestId} occurs at index ${position} (-1 means absent). Another actor's receipt list was excluded. Complete the station comparison or the new-request checks and return the current balances.`]
      : args.key === 'transaction'
        ? [`The available energy space is ${x.state.config.energyCap} − ${actor.energy} = ${x.state.config.energyCap - actor.energy}. Keep that amount for a possible success; first complete all ordered admission checks before changing any resource.`]
        : [`The capacity gap is ${x.config.energyCap} − ${x.before.energy} = ${x.config.energyCap - x.before.energy}. The permitted addition is min(${x.config.repairEnergy}, gap) = ${Math.min(x.config.repairEnergy, x.config.energyCap - x.before.energy)}. Complete the final balance and receipt comparisons independently of the observed values.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from the calculated work in inputs.completedSteps; fill the remaining resource or receipt decisions. ${item.prompt}` };
  }
  return item;
}
