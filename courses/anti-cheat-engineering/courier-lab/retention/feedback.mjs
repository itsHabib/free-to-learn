// Author material. Do not copy this module into a newly prepared workspace.
const predictions = [
  {
    id: 'retention-window',
    question: 'At nowTick 14 with maxAgeTicks 6, which of ticks 7, 8, 9, 14 and 15 belong in the window? Why?',
    answer: 'Ticks 9 and 14 remain.',
    reason: 'The window is 8 < tick <= 14. Tick 8 is the excluded old edge, 7 is older, and 15 is in the future.',
    source: 'LEARNER.md#the-tick-window',
    freshVariant: {
      question: 'At nowTick 23 with maxAgeTicks 4, which of ticks 18, 19, 20, 23 and 24 remain? State both inequalities.',
      answer: 'Ticks 20 and 23 remain because 19 < tick <= 23.',
    },
  },
  {
    id: 'retention-count',
    question: 'Eligible entries are A@11, B@12, C@12, D@12 and E@14. With maxEvents 3, which entries remain and in what order? Why?',
    answer: 'C@12, D@12, E@14 remain in that order.',
    reason: 'The newest three entries are the final three in the supplied order. Equal ticks do not authorize sorting or exchanging B, C and D.',
    source: 'LEARNER.md#the-count-bound',
    freshVariant: {
      question: 'Eligible entries are P@30, Q@30, R@30, S@31 and T@31. With maxEvents 4, which entries remain and in what order?',
      answer: 'Q@30, R@30, S@31, T@31; drop only P and preserve the supplied order.',
    },
  },
  {
    id: 'retention-projection',
    question: 'Why would deleting unwanted fields from the source objects be different from returning new four-field objects?',
    answer: 'Deleting from source objects changes data still owned by the caller. New four-field objects leave the originals intact.',
    reason: 'The caller may need the original capture for another purpose. The export contract chooses fields for a separate output; it does not rewrite the capture.',
    source: 'LEARNER.md#four-fields-only',
    freshVariant: {
      question: 'Two tools share one source event. If an export function deletes source.device, what can the other tool observe, and what should the export function return instead?',
      answer: 'The other tool observes the missing device field. Return a new object containing only tick, actorId, reason and distanceSquared.',
    },
  },
  {
    id: 'retention-deletion',
    question: 'What data remains after deleting one export, if a checkpoint and a second export exist?',
    answer: 'The checkpoint and the second export remain. The deletion removes only the unchanged file named by its receipt.',
    reason: 'A receipt identifies one artifact. Removing that artifact does not remove separate copies, causal state, source records or learner attempts.',
    source: 'LEARNER.md#export-and-deletion-scope',
    freshVariant: {
      question: 'An export was explicitly copied to another path before its receipt was deleted. Does successful deletion establish that the copy is gone? Explain the scope.',
      answer: 'No. The receipt deletes its named unchanged export only; the copy is a separate artifact.',
    },
  },
];

/** Release only after the checker captures the learner's committed response. */
export function postCheckFeedback() {
  return {
    schema: 1, module: 'retention',
    instruction: 'Compare each saved first prediction with its answer and reason. Append a correction where needed, then answer the fresh variant without replacing your first response. These explanations do not grade your written answer.',
    predictions: predictions.map(({ freshVariant, ...prediction }) => ({ ...prediction, freshVariant: { question: freshVariant.question } })),
  };
}

/** Reference material for advisory review, not learner feedback or a score. */
export function reviewerFeedback() {
  return {
    schema: 1, module: 'retention',
    freshVariants: predictions.map(({ id, freshVariant }) => ({ id, ...freshVariant })),
    reconciliation: {
      question: 'At tick 40, a detector examines 20 ticks, an export keeps 8 ticks, and relevant observations occurred at ticks 23, 29 and 37. Which remain and what can be recomputed?',
      referenceAnswer: 'Only tick 37 remains in the export because 32 < tick <= 40. All three observations are in the live 20-tick window. A threshold decision depending on 23 and 29 cannot be independently recomputed from this export alone. A count bound could remove still more events. Live detector state supports current decisions, a causal checkpoint supports continuing replay, and a minimized export supports only the observations it retains. Pseudonymous actor IDs still permit behavior to be linked.',
    },
    transfer: {
      question: 'A collaborative drawing tool exports rejected edits to explain a rate-limit decision over 30 seconds. Users can request deletion of old exports. Propose a minimal event shape and two bounds, explain their evidence limits, and define what one deletion removes. State what separate policy governs live rate-limit state or another saved copy.',
      rubric: [
        'Names a debugging question and chooses only the fields needed to answer it; treats any actor label as pseudonymous.',
        'Declares an age window in seconds with explicit boundary semantics and a count bound; explains that a count cap can truncate even the age window.',
        'Explains whether the retained events can reconstruct the whole 30-second decision, and identifies missing evidence instead of assuming absence means no event.',
        'Defines deletion as removal of a named export; describes separate policies for live rate-limit state and any other saved copy.',
        'Keeps debugging exports separate from replay checkpoints and does not claim anonymity, total deletion or production capacity.',
      ],
      referenceAnswer: 'One defensible export contains a pseudonymous actor label, server event time, refusal reason and an operation category if that category is needed to explain the limit. It omits edit contents, addresses and device fields. Keep events in (now-30 seconds, now], then cap the newest 200 events in original order. The count cap bounds file growth but can make a full 30-second reconstruction impossible; report the retained span and truncation. Deleting one receipt removes that unchanged export only. The live limiter needs a separately specified expiry policy, and an explicit copied export needs its own deletion and access rules. The proposal must be revised if the debugging question requires other evidence; these illustrative bounds are not a universal policy.',
      reviewStatus: 'Advisory only. Accept other justified minimal designs and bounds; no keyword score establishes understanding.',
    },
  };
}
