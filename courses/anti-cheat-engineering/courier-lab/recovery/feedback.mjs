// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'recovery-tuple',
    question: 'Explain the roles of package, configuration and snapshot. What does rolling back only the package leave unresolved?',
    answer: 'The package supplies executable rules and a state decoder; configuration supplies the separately identified settings; the snapshot supplies saved causal state. A package-only rollback leaves the candidate configuration and candidate-format state unresolved.',
    reason: 'The old decoder cannot read the candidate envelope, and the narrowed 100 mm configuration does not restore the old 250 mm pickup behavior. Recovery needs a compatible tuple of all three artifacts.',
    source: 'LEARNER.md#state-compatibility',
    freshVariant: { question: 'A service restores an older binary but keeps a new-format queue snapshot and a changed rate-limit configuration. Which two independent compatibility questions remain before it can resume work?' },
  },
  {
    id: 'declared-target',
    question: 'Release `r4` is requested but only `r1` and `r2` are present. State the exact refusal and explain why a fallback would change the request.',
    answer: "Return exactly {ok:false,reason:'unknown-target'}. Selecting r1 or r2 would substitute a different target for the caller's r4.",
    reason: 'The selection function honors the declared target; it does not choose which release the operator should want. Target refusal precedes configuration and snapshot checks.',
    source: 'LEARNER.md#declared-target',
    freshVariant: { question: 'A requested candidate release is present with a compatible configuration and snapshot, while an older baseline is also available. Is being the baseline a reason to choose the older release?' },
  },
  {
    id: 'snapshot-compatibility',
    question: 'Release `r2` requires schema 2 and configuration `c9/k9`. Compare snapshots schema-2/c9/k8 and schema-1/c9/k9. Explain why changing the displayed schema is not a restore.',
    answer: "Neither snapshot is compatible: schema-2/c9/k8 has the wrong configuration hash, and schema-1/c9/k9 has the wrong schema. With no other snapshots, return {ok:false,reason:'no-compatible-snapshot'}.",
    reason: 'Schema and exact configuration provenance must both match. Relabeling schema does not convert the encoded state into a structure the selected decoder understands.',
    source: 'LEARNER.md#compatible-tuples',
    freshVariant: { question: 'A release requires schema 2 and c2/h2. Snapshot A has schema 2 and c2/h2; snapshot B has schema 2 and c2/h9 with a later ordinal. Which may be considered for selection, and why?' },
  },
  {
    id: 'snapshot-order',
    question: 'Compatible snapshots have ordinals 5 and 8; an incompatible snapshot has ordinal 13. Predict selection under two different array orders. Resolve a tie between `m-snap` and `B-snap` at ordinal 8.',
    answer: 'Choose the compatible ordinal-8 snapshot regardless of array order. If m-snap and B-snap are both compatible at ordinal 8, choose B-snap.',
    reason: 'Filter for compatibility before comparing ordinals. The tie break is ascending JavaScript UTF-16 string order, not source-array order or locale-aware sorting.',
    source: 'LEARNER.md#snapshot-order',
    freshVariant: { question: 'Compatible snapshots Z-ready and a-ready both have ordinal 9; a newer incompatible snapshot has ordinal 12. Which ID wins the tie under the declared comparison, even if a-ready appears first?' },
  },
  {
    id: 'trial-phases',
    question: 'Explain the worked baseline, narrowed-configuration candidate, code-only and full recovery outcomes for the 250 mm idle pickup.',
    answer: 'Baseline pickup succeeds. The candidate refuses the 250 mm action under its 100 mm configuration. Code-only recovery refuses the candidate state envelope because the old decoder expects schema 1. Full recovery of the compatible baseline tuple restores the legal pickup.',
    reason: 'Configuration affects action eligibility; the state schema affects whether restore can run at all. A successful full trial requires both a compatible restore and the subsequent real pickup.',
    source: 'LEARNER.md#run-the-recovery-trial',
    freshVariant: { question: 'A compatible snapshot restores successfully, but it places the actor farther from the pickup than the allowed range. Which of dataLoss.restored and restoredActionApplied can be true, and why must they be separate?' },
  },
  {
    id: 'recovery-evidence',
    question: 'Which evidence would establish successful recovery? Which evidence would be needed to claim that no acknowledged action was lost?',
    answer: 'Pin the selected package/configuration/snapshot identities, observe a successful restore and verify the original legal action with its before/after state in the new lineage. That does not establish lossless recovery: compare original and restored operations, effects and acknowledgments, and account for every accepted post-snapshot action.',
    reason: 'This trial loses a later delivery and restores lastSeq from 12 to 3, reopening sequences 4–12. The new branch pickup reuses sequence 4; a lineage label makes that visible but does not preserve the original acknowledgment history.',
    source: 'LEARNER.md#what-recovery-loses',
    freshVariant: { question: 'A restored snapshot remembers sequence 20, but the failed process acknowledged through 27. What sequence range is reopened, and why does a new successful action after restore not show that the seven acknowledged operations survived?' },
  },
];

const freshVariantAnswers = [
  { id: 'recovery-tuple', answer: 'Determine whether the old decoder accepts the saved queue structure and whether the retained configuration is the exact configuration required by that binary. Fixing one does not establish the other or recover discarded work.' },
  { id: 'declared-target', answer: 'No. Select the declared candidate if its artifacts satisfy the contract. Baseline familiarity is not a selection rule and silently changes the request.' },
  { id: 'snapshot-compatibility', answer: 'Only A is compatible. B has a different configuration identity even though its name and schema match, so its later ordinal cannot make it eligible.' },
  { id: 'snapshot-order', answer: 'Z-ready wins: uppercase Z precedes lowercase a in UTF-16 code-unit order. Ordinal 12 is excluded for incompatibility, and array order does not decide the tie.' },
  { id: 'trial-phases', answer: 'dataLoss.restored can be true while restoredActionApplied is false. Decoding and restoring valid state does not guarantee that the next action is eligible from that state.' },
  { id: 'recovery-evidence', answer: 'Sequences 21–27 are reopened. The restored state lacks their remembered acknowledgments, and a new success proves only the new branch behavior. Preservation requires evidence and coordination for those prior effects, such as a defined epoch or retained sequence floor plus effect reconciliation.' },
];

const transfer = {
  question: 'A repair service changes a saved job from `{remainingTicks:4,charged:true}` to `{schedule:{remaining:4},receipt:{charged:true}}`. An older package only reads the first format. A customer payment completed after the last old-format snapshot. Describe a compatible recovery tuple, one test of resumed repair behavior, and the financial action a snapshot restore cannot undo safely by itself. State what you would refuse to claim without a transaction or compensation mechanism. Keep your first answer and append corrections.',
  rubric: [
    { criterion: 'Compatible artifacts', evidence: 'Selects a package, exact configuration and snapshot in the format its decoder accepts without relabeling new data.' },
    { criterion: 'Resumed behavior', evidence: 'Runs the remaining repair work and checks completion, resource changes and charge behavior after actual restore.' },
    { criterion: 'External effects and loss', evidence: 'Identifies the later payment as an external acknowledged effect that a local snapshot restore cannot reverse or safely repeat.' },
    { criterion: 'Coordination', evidence: 'Requires transaction/compensation and durable request identity or equivalent coordination before claiming no lost acknowledgment or double charge.' },
  ],
  referenceAnswer: 'Use the old package with its required configuration and an actual compatible old-format job snapshot, or keep the new package with a compatible new-format snapshot. Do not relabel the nested state as the old format. After restoring, run the recorded remaining repair ticks and verify exactly one completion and the expected resource/charge result. The customer payment that completed after the old snapshot still exists outside that snapshot. Restore alone cannot refund it, prove it absent or safely repeat it. Reconcile the payment through durable transaction identities and a defined transaction or compensation mechanism before asserting no lost paid work or duplicate charge.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'recovery', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'recovery', freshVariantAnswers, transfer });
}
