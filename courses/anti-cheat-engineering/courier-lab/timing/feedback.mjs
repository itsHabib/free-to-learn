// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'receipt-window',
    question: 'At x=1000, an east input arrives when the owner is at tick 3, although sentAtMs says 0. Name its four eligible movement ticks and x after them:',
    answer: 'The eligible ticks are 4, 5, 6 and 7. After four east steps, x=2000 mm.',
    reason: 'Admission at processed tick 3 sets expiresAt=7. Each following eligible tick adds 250 mm; the client timestamp cannot backdate movement.',
    source: 'LEARNER.md#four-processed-ticks',
    freshVariant: { question: 'An actor at x=2000 receives west input at processed tick 8 after a delivery delay. No newer input arrives. At which ticks can it move, and what are its positions after ticks 11, 12 and 13?' },
  },
  {
    id: 'stale-retry',
    question: 'An east input was admitted at tick 0 at x=1000. At tick 3, a west retry repeats that sequence. What changes immediately, at tick 4, and at tick 5?',
    answer: 'At tick 3 the retry is stale: x stays 1750, direction stays east and expiry stays 4. Tick 4 moves east to x=2000. Tick 5 leaves x=2000.',
    reason: 'Only a strictly larger sequence replaces intent or renews expiry. A repeated sequence does neither, even when it requests the opposite direction.',
    source: 'LEARNER.md#retries-and-reordering',
    freshVariant: { question: 'A west input with sequence 5 was admitted at tick 0 from x=2000. At tick 2, sequence 4 asks for east; at tick 4, sequence 6 asks for idle. Which receipts are stale or admitted, and can tick 5 move?' },
  },
  {
    id: 'bounded-clock',
    question: 'A sample arrives at 826.5 ms after a start of 0. Name processed ticks, dropped ticks and retained remainder. What happens at a later sample of 850 ms?',
    answer: 'The first sample processes 5 ticks, drops 11 whole ticks and retains 26.5 ms; overruns becomes 1. At 850 ms, 23.5+26.5=50 ms produces 1 tick, drops 0 and leaves remainder 0; total processed tick is 6 and overruns remains 1.',
    reason: '826.5 ms contains 16 whole 50 ms intervals plus 26.5 ms. The cap applies to whole due ticks; dropped work is never repaid, but the fractional remainder carries into the next sample.',
    source: 'LEARNER.md#owner-clock',
    freshVariant: { question: 'A clock starts at 0 and is sampled at 20 ms, 620 ms and 650 ms. Give ticks, dropped, overruns and remainder for each sample. Does the last sample repay any dropped whole ticks?' },
  },
  {
    id: 'connection-recovery',
    question: "An east input was admitted at tick 0 at x=1000, and the connection disappears after tick 1. Predict the old actor's position through expiry. Distinguish a resume from a fresh join:",
    answer: 'After ticks 1, 2, 3 and 4 the old actor is at x=1250, 1500, 1750 and 2000 respectively; it stops there at tick 5 without new input. Resume keeps that actor, position, last sequence and expiry. A fresh join creates a separate actor at x=1000 with lastSeq=0 and expiresAt=0; the old actor remains.',
    reason: 'Disconnect gates delivery; it does not erase server-owned intent or actor state. Resuming a binding and allocating a new actor are different operations.',
    source: 'LEARNER.md#connection-recovery',
    freshVariant: { question: 'A binding disconnects before any movement after admitting sequence 9. After its window expires, it resumes and sends sequence 9 again. A second binding also joins. Which request can change the old actor, and what state belongs to the new actor?' },
  },
];

const freshVariantAnswers = [
  { id: 'receipt-window', answer: 'Movement is eligible at ticks 9, 10, 11 and 12. Positions after ticks 11, 12 and 13 are 1250, 1000 and 1000 mm. Receipt tick 8, not claimed send time, determines expiry 12.' },
  { id: 'stale-retry', answer: 'Sequence 4 is stale and does not replace west intent. Sequence 6 is admitted at tick 4 and replaces intent with idle, expiring at tick 8. Tick 5 cannot move because the latest intent is idle.' },
  { id: 'bounded-clock', answer: 'At 20: ticks=0,dropped=0,overruns=0,remainder=20. At 620: elapsed=620, so ticks=5,dropped=7,overruns=1,remainder=20. At 650: elapsed=50, so ticks=1,dropped=0,overruns=1,remainder=0. No dropped whole tick is repaid.' },
  { id: 'connection-recovery', answer: 'The repeated sequence 9 is stale on resume; only a sequence greater than 9 can replace the old actor intent. The fresh binding owns a different actor with x=1000,lastSeq=0,expiresAt=0 and idle intent. It does not reset the old actor.' },
];

const transfer = {
  question: 'A server holds a seat until owner-monotonic time 1000 ms, rather than for a count of processed ticks. Its callbacks pause from 900 to 1200 ms and process at most two queued jobs when they resume. At 1200 ms a client retries a request it claims to have sent at 950 ms; a second client requests the same seat. Explain why the game\'s four-processed-tick rule cannot decide this reservation. Which owner receipt and prior-result evidence distinguish a retry of an already accepted reservation from a new late request? What must recovery establish if the process restarted and the old monotonic clock no longer has the same origin?',
  rubric: [
    { criterion: 'Deadline contract', evidence: 'Distinguishes an owner-time deadline from a processed-tick window; a two-job callback cap does not extend the seat deadline.' },
    { criterion: 'Receipt and retry identity', evidence: 'Uses owner-observed admission and the retained result for a request ID to distinguish an accepted operation from a new late request; client claimed send time alone is insufficient.' },
    { criterion: 'Contention and recovery', evidence: 'Requires one authoritative seat decision and enough durable state to reconstruct accepted ownership and the deadline under a defined new clock origin.' },
  ],
  referenceAnswer: 'A time deadline can expire while callbacks are paused; the game rule expires only as processed ticks advance. At 1200 ms a claimed send time of 950 ms does not establish timely owner admission. A stored successful result for the same request identity can acknowledge a prior acceptance without allocating the seat again; a new request must be judged under the reservation deadline and contention policy. Recovery must establish the accepted owner, prior request results and a defensible deadline mapping after restart. A new monotonic origin cannot be compared directly with the old value. Without that evidence, refuse to claim the seat remained available or that the retry had already won.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'timing', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'timing', freshVariantAnswers, transfer });
}
