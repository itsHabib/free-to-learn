// Author-side answers for prompt version 3. Never copy into a prepared workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'stale-command',
    question: 'At T1 seq7/W is admitted from x=2000. At T3 seq6/E/interact=true arrives. Predict x, pending interaction and expiry just after T4, and explain.',
    answer: 'Just after T4, x=1250, pendingInteract=false and expiresAt=5. The older sequence 6 is stale and changes none of the admitted state.',
    reason: 'The west input admitted at T1 moves on T2, T3 and T4, three 250 mm steps from 2000. The stale east request neither reverses direction, stages interaction nor renews expiry.',
    source: 'LEARNER.md#policy-contract',
    freshVariant: { question: 'An admitted sequence 12 has move=idle and pendingInteract=true. Before the next tick, stale sequence 11 arrives with move=E and interact=false. Which admitted fields may the stale request clear or replace?' },
  },
  {
    id: 'read-only-polling',
    question: 'At T2 seq3/E is admitted from x=1000. Only state reads happen after that. Predict the last moving tick and position at T8.',
    answer: 'The last moving tick is T6. Position at T8 is x=2000.',
    reason: 'Admission at T2 allows four steps on T3, T4, T5 and T6. State reads cannot renew expiry or add movement, so T7 and T8 remain stopped.',
    source: 'LEARNER.md#policy-contract',
    freshVariant: { question: 'A west intent is admitted at T5 from x=2000. The client reads state before every later tick without sending input. What are x at T9 and T10, and which operation would be needed to extend motion?' },
  },
  {
    id: 'edge-renewal',
    question: 'At T6 a fresh W input renews a west direction admitted at T2. Predict what happens at T7.',
    answer: 'The actor moves another 250 mm west at T7. The fresh admission at T6 sets expiresAt=10.',
    reason: 'A strictly newer sequence renews the window from its own receipt tick. Renewal at the old inclusive edge keeps the next step active without catch-up.',
    source: 'LEARNER.md#policy-contract',
    freshVariant: { question: 'An east intent expires at T4. The next fresh east input arrives at T7 after motion has stopped. Does T8 perform one step or repay the missed steps, and what is the new expiry?' },
  },
  {
    id: 'duplicate-no-op',
    question: 'A response was lost; the same sequence is retried. Which state must remain unchanged, and should a finding be produced?',
    answer: 'Keep lastSeq, lastSeen, expiresAt, move and pendingInteract unchanged. Produce no finding for the stale retry itself.',
    reason: 'Equal sequences are stale. A missing response does not authorize a repeated effect, renew intent or establish a rule violation by the client.',
    source: 'LEARNER.md#policy-contract',
    freshVariant: { question: 'A duplicate retry carries interact=true after the original request used interact=false. The owner has already accepted that sequence. May the duplicate add an interaction or count as a repeated distant violation?' },
  },
];

const freshVariantAnswers = [
  { id: 'stale-command', answer: 'None. All five admitted fields remain unchanged: lastSeq, lastSeen, expiresAt, move and pendingInteract. In particular, idle stays idle and the already pending true interaction is not cleared.' },
  { id: 'read-only-polling', answer: 'The four steps are T6 through T9, giving x=1000 at T9 and still x=1000 at T10. A strictly newer admitted input is needed to replace or renew intent; polling is observation only.' },
  { id: 'edge-renewal', answer: 'T8 performs one 250 mm east step. The new expiry is T11. No request repays unprocessed or expired movement steps.' },
  { id: 'duplicate-no-op', answer: 'No to both. The repeated sequence is stale, so its changed interaction bit is ignored and does not become an admitted interaction or a detector observation.' },
];

const transfer = {
  question: 'An owned replay scrubber receives seek commands {seq, frame} instead of movement. The latest admitted command selects a frame; reading the displayed frame must not change the selected frame or the last admitted sequence. Explain which admission/observation rules transfer, which four-tick movement rule does not automatically transfer, and propose one stale-command test plus one read-only polling test. Do not invent an expiry requirement for the scrubber.',
  rubric: [
    { criterion: 'Admission authority', evidence: 'Uses a strictly newer sequence to replace the selected frame; stale or duplicate commands preserve the admitted state.' },
    { criterion: 'Observation', evidence: 'Keeps frame reads observational and proposes a polling test that detects a change to command identity or selected state.' },
    { criterion: 'Changed contract', evidence: 'Does not import movement, speed, catch-up or a four-tick expiry requirement into a frame-selection interface.' },
    { criterion: 'Independent tests', evidence: 'Proposes a conflicting older seek and repeated reads with assertions on selected frame and command identity, without merely checking a status string.' },
  ],
  referenceAnswer: 'Retain an owner-side last admitted sequence and selected frame. A lower or equal sequence cannot replace the frame or create a newer command, and reading the frame changes neither field. Test a newer seek followed by a conflicting older seek, then assert that the newer selected frame and sequence remain. In a separate case, repeatedly read the frame and assert that those same fields remain unchanged. The movement model and its four-tick lifetime do not follow from a seek contract; no new scrubber expiry policy is specified here.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'order', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'order', freshVariantAnswers, transfer });
}
