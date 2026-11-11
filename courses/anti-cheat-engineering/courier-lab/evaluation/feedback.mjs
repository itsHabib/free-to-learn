// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'eligible-observations',
    question: 'At a 600 mm minimum, decide which count: range/360,000; cooldown/1,000,000; range/490,000.',
    answer: 'Only range/490,000 counts. Range/360,000 is exactly on the excluded distance boundary. Cooldown/1,000,000 does not count.',
    reason: 'Compare squared distance with 600² = 360,000 using >, and require reason range. A distant cooldown denial still fails the reason filter.',
    source: 'LEARNER.md#eligible-observations',
    freshVariant: { question: 'Minimum 500 mm, threshold two, window five: range/250,001 at tick 4, cooldown/1,000,000 at tick 5, and range/250,000 at tick 6. Does this case flag, and which observations count?' },
  },
  {
    id: 'window-boundaries',
    question: 'Threshold two, window seven: predict eligible ticks [12,19] and [13,19]. Then add a cooldown at tick 80 to the second case.',
    answer: '[12,19] does not flag. [13,19] flags. Adding the cooldown at tick 80 leaves that earlier flag true.',
    reason: 'The interval ending at 19 is (12,19]: tick 12 is excluded and tick 13 is included. The contract asks whether any interval qualified; a later ineligible observation does not erase an earlier qualifying interval.',
    source: 'LEARNER.md#window-boundaries',
    freshVariant: { question: 'Threshold three, window four: eligible observations at ticks [5,6,9,9]. Does any interval qualify? State its left edge and how the equal-tick entries count.' },
  },
  {
    id: 'one-case-one-vote',
    question: 'Three cases are flagged-positive, flagged-negative and unflagged-negative, containing twelve, three and zero denials. Compute total, tp, fp, tn and fn.',
    answer: 'total=3, tp=1, fp=1, tn=1, fn=0.',
    reason: 'The unit is a case. Each case enters exactly one matrix cell; the twelve observations explain a prediction but never become twelve votes.',
    source: 'LEARNER.md#one-case-one-vote',
    freshVariant: { question: 'An unflagged positive case has forty denials, a flagged negative case has two, and two negative quiet cases are unflagged. Compute the four cells, total and recall.' },
  },
  {
    id: 'counts-and-rates',
    question: 'Compute every count and rate for one negative case with no signals. Change only its label to positive and recompute.',
    answer: 'Negative: total=1, tp=0, fp=0, tn=1, fn=0; precision=null, recall=null, falsePositiveRate=0. Positive: total=1, tp=0, fp=0, tn=0, fn=1; precision=null, recall=0, falsePositiveRate=null.',
    reason: 'The prediction stays unflagged because signals did not change. Undefined means a zero denominator, while zero means a defined ratio with a zero numerator.',
    source: 'LEARNER.md#counts-and-rates',
    freshVariant: { question: 'A dataset contains two positive cases and no negatives. Both are flagged. Compute precision, recall and false-positive rate, including any undefined rate.' },
  },
  {
    id: 'labels-are-not-features',
    question: 'Why can identical legal honest and automated traces not reveal automation status, and why is accepting both not a missed violation?',
    answer: 'Identical signal inputs with identical settings produce the same deterministic decision. Both twins have negative violation labels; accepting both is correct for this detector, but gives no evidence about which script was automated.',
    reason: 'A behavior label and a claim about how a client produced that behavior answer different questions. Additional signals may be uncertain proxies and require a separate justification for collection and use.',
    source: 'LEARNER.md#labels-are-not-features',
    freshVariant: { question: 'Two clients submit the same legal requests, but one uses an accessibility macro. A reviewer proposes labeling the macro trace positive merely to increase automation recall. What changes in the meaning of the metric, and what must be stated before using it?' },
  },
];

const freshVariantAnswers = [
  { id: 'eligible-observations', answer: 'No flag. Only tick 4 counts: 250,001 > 500². Tick 5 is cooldown; tick 6 is exactly on the excluded distance boundary. One eligible observation cannot reach threshold two.' },
  { id: 'window-boundaries', answer: 'Yes. The interval (5,9] contains tick 6 and both observations at tick 9, for three observations. Tick 5 is excluded; equal ticks are separate entries under this policy contract.' },
  { id: 'one-case-one-vote', answer: 'total=4, tp=0, fp=1, tn=2, fn=1; recall=0/(0+1)=0. Forty denials still contribute only one false negative.' },
  { id: 'counts-and-rates', answer: 'Precision=1 and recall=1; falsePositiveRate=null because fp+tn=0. There are no negative cases on which to compute that rate.' },
  { id: 'labels-are-not-features', answer: 'The target changes from repeated rule violations to a declared method of input production. Legal macro use is not evidence of the original violation. State the new target, labeling policy and consequences; the same signal-only detector still cannot separate identical traces. Do not present the new recall as rule-violation recall.' },
];

const transfer = {
  question: 'A repair station denies requests when its shared repair resource is empty, during a six-tick cooldown, or when an actor is beyond 400 mm. Two legal scripts have identical request timings: one is manual-shaped and one is declared automated. Design eligible observations and a case-level evaluation for repeated remote requests. Explain which denials cannot support that classification, what the twins imply, how a rare positive population could change precision, and which counts become unknowable if you retain only the most recent five ticks for a twelve-tick detector.',
  rubric: [
    { criterion: 'Eligibility and target', evidence: 'Counts authoritative range denials strictly beyond 400 mm for repeated remote requests; excludes cooldown and resource-empty denials. Does not silently relabel legal automation as a remote-request violation.' },
    { criterion: 'Unit and denominators', evidence: 'Predicts once per actor run, then counts tp/fp/tn/fn once per case; states precision, recall and false-positive-rate denominators and null when zero.' },
    { criterion: 'Identical legal twins', evidence: 'Explains that identical available signals cannot reveal automation status. Both may be correctly negative for the violation target. Additional evidence must be justified rather than treated as proof of intent.' },
    { criterion: 'Prevalence and scope', evidence: 'Explains that more negative cases can add false positives and lower precision even with unchanged class-conditional rates; separates a synthetic mix from a measured human population.' },
    { criterion: 'Retention and uncertainty', evidence: 'Identifies the missing seven ticks of a twelve-tick window. Does not count missing denials as zero or report complete-window confusion counts without labels/predictions for the missing cases. States what a sufficient checkpoint summary would need to preserve.' },
  ],
  referenceAnswer: 'Use authoritative denied-interaction observations with reason range and distanceSquared > 400². Exclude cooldown and resource-empty refusals: neither establishes a remote request. Select a repeated-event threshold using a separate exploration set, then evaluate one decision per actor run against repeated-remote labels. Report raw tp/fp/tn/fn plus the three rates with their own denominators. The legal twins can receive the same correct negative decision; their timing cannot establish whether automation was used. If positives become rare while negative false-positive probability remains nonzero, false positives can outnumber true positives and precision can fall. With only five recent ticks, the preceding seven ticks needed for a twelve-tick rule are unavailable. A complete-window flag, and therefore its matrix cell and all rates depending on missing decisions, cannot be asserted from those retained events alone. Mark the evidence incomplete, retain enough history, or design and validate a checkpoint summary that preserves the exact needed detector state. A partial-window positive may still establish that the threshold was reached, but a partial-window negative does not establish that the full window never qualified.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'evaluation', predictions });
}

/** Author/reviewer material; do not release as the learner's first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'evaluation', freshVariantAnswers, transfer });
}
