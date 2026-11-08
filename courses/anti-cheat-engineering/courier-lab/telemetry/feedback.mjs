// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'missing-index',
    question: 'A window starts at index 70 and has entries 71 and 73. Its replay happens to match `final`. What should your policy return, and what claim is missing?',
    answer: "Return {ok:false,reason:'sequence'}. The two entries must be 71 and 72; the record does not establish a complete ordered history after index 70.",
    reason: 'A matching final state does not account for missing operation 72. Sequence validation precedes applying events or comparing final state.',
    source: 'LEARNER.md#absolute-order',
    freshVariant: { question: 'A record starts at index 20 and ends at 22. Both retained entries are numbered 21, and both happen to be stale inputs. Can unchanged gameplay state justify accepting this record?' },
  },
  {
    id: 'reordered-history',
    question: "A two-event window contains an input followed by a tick. Another file reverses their array order but keeps each event's original index. Should the policy sort the array? Explain the effect on the evidence claim.",
    answer: "Do not sort. Return {ok:false,reason:'sequence'} for the reversed indices.",
    reason: 'The record claims that operations occurred in the supplied order. Sorting rewrites that claim; an input before a tick can also produce different behavior from a tick before an input.',
    source: 'LEARNER.md#absolute-order',
    freshVariant: { question: 'A recorder swaps two operations and renumbers them to be consecutive. Replay matches the claimed final state. What can the ordered replay establish, and what can it not establish about the original capture?' },
  },
  {
    id: 'causal-checkpoint',
    question: 'A checkpoint has two recent distant range denials and a pending interaction. The first retained operation is a tick. Which private fields could change the resulting finding if restore omitted them?',
    answer: 'The pending interaction and the detector history containing the earlier denials are essential. Movement intent and expiry, interaction cooldown and actor positions can also affect whether and where that interaction is evaluated.',
    reason: 'A tick consumes causal state, not just public position and score. Dropping the pending request can remove the observation; clearing the prior eligible denials can remove the repeated-event finding.',
    source: 'LEARNER.md#causal-state',
    freshVariant: { question: 'Two checkpoints have identical public positions and scores. One retains a staged interaction and active cooldown; the other omits both. Why is a public snapshot insufficient to promise the same next-tick result?' },
  },
  {
    id: 'empty-window',
    question: 'A complete window has no events. What should be compared, and which boundary relation still applies?',
    answer: 'Restore the checkpoint, compute its canonical gameplay state and compare that result with final. endIndex must equal startIndex.',
    reason: 'Zero retained operations leaves the checkpoint state unchanged but does not remove the final-state check or the boundary contract.',
    source: 'LEARNER.md#complete-windows',
    freshVariant: { question: 'A complete empty window starts at 18 and claims endIndex 19. Its final equals the restored checkpoint state. Which refusal applies first, and what endIndex would permit final comparison?' },
  },
];

const freshVariantAnswers = [
  { id: 'missing-index', answer: 'No. Return sequence: the second index must be 22, not 21. Stale inputs are still observed operations, and gameplay equality does not establish history completeness.' },
  { id: 'reordered-history', answer: 'Replay can establish internal consistency of the supplied consecutively indexed history and its final state. It cannot authenticate that the producer preserved the original capture or establish actual network order; renumbering can conceal that alteration.' },
  { id: 'causal-checkpoint', answer: 'The staged interaction determines whether an interaction is attempted, while cooldown can change its decision. Equal public state omits those causes and therefore does not promise equal continuation; restore must retain the private causal state.' },
  { id: 'empty-window', answer: 'Return sequence before final comparison. With zero events, endIndex must be 18, equal to startIndex.' },
];

const transfer = {
  question: 'A repair station queues one repair per player, charges a resource when the repair completes, and has a six-tick cooldown. You receive the last four operations after earlier history was retired. Name the checkpoint state required to reproduce the next completion, propose a missing-operation test and a duplicate-operation test, and state one identity or timing claim that a matching replay cannot settle. Preserve your first answer and append any correction.',
  rubric: [
    { criterion: 'Causal continuation', evidence: 'Preserves pending repair ownership/progress, balances, cooldown deadline and other state that affects completion, rather than only a public final balance.' },
    { criterion: 'Complete ordered evidence', evidence: 'Anchors the four retained operations after a checkpoint index and refuses a deleted or repeated index without sorting or renumbering.' },
    { criterion: 'Execution and comparison', evidence: 'Restores a fresh world, applies the supplied operations and compares computed canonical result with the claim.' },
    { criterion: 'Evidence boundary', evidence: 'Separates internal replay consistency from producer identity, real delivery order or wall-clock timing.' },
  ],
  referenceAnswer: 'The checkpoint must retain the queued repair and its player, remaining work or completion tick, balances, cooldown and any resource availability or position needed by the rule. Start the retained window from that state and its absolute index. Removing an entry must leave an index gap; duplicating an entry must repeat an index or violate the end boundary, and both should be refused even if balances happen to match. Replaying the intact four operations must reproduce the claimed final state. Agreement establishes consistency of this supplied continuation, not who authored it, when a packet arrived or whether the record is an authentic capture.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'telemetry', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'telemetry', freshVariantAnswers, transfer });
}
