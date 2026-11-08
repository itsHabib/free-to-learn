import { createClock } from '../../clock.mjs';
import { runInvestigation } from '../../timing/runtime.mjs';

const source = { path: 'timing/LEARNER.md', anchor: 'owner-clock' };

export const unit = {
  id: 'timing', title: 'M4 · Separate elapsed time from processed work', prerequisites: ['order', 'testing'],
  intro: 'The owner wakes up late while a client reconnects. Predict which ticks really run, when a newly received intent expires, and which state survives the interruption.',
  difficulty: 'The hardest trace combines a retained millisecond fraction, dropped whole ticks, receipt at a processed tick, and a restored connection binding. Keep a separate clock and actor ledger.',
  objectives: [
    { id: 'timing.clock', kind: 'procedure', text: 'Convert owner-clock samples into bounded processed ticks, dropped work and a retained remainder.', prerequisites: ['order.expiry'] },
    { id: 'timing.receipt', kind: 'procedure', text: 'Predict movement and expiry from the processed receipt tick rather than a client timestamp or dropped work.', prerequisites: ['timing.clock', 'order.admission', 'order.expiry'] },
    { id: 'timing.recovery', kind: 'procedure', text: 'Distinguish resumed connection state, a fresh actor, and a clock with a new origin.', prerequisites: ['timing.clock', 'timing.receipt'] },
  ],
  sections: [
    {
      id: 'clock', title: 'Keep fractions; bound whole ticks', objectiveIds: ['timing.clock'],
      paragraphs: [
        'A clock sample is an owner reading in milliseconds. Subtract the previous reading and add the retained remainder. Divide that elapsed total by 50 and take the whole-number part: these are the due ticks. Process at most five in one callback. Excess whole ticks are dropped; they are not carried forward as a debt.',
        'Keep the fraction smaller than 50 ms for the next sample. Increment overruns once for each callback that drops one or more ticks, not once per dropped tick. The world tick advances only by the ticks processed. Reading the clock twice at the same millisecond cannot create elapsed time.',
      ],
      worked: { prompt: 'Start at 1000 ms with no remainder. Sample at 1020, then 1085, then 1510 ms.', steps: ['1020: elapsed 20, due 0; process 0 and retain 20.', '1085: 65 new ms + 20 retained = 85; process 1 and retain 35.', '1510: 425 new ms + 35 retained = 460; due 9, process 5, drop 4 and retain 10.', 'The world has processed 6 ticks and one overrun callback.'], answer: 'Final clock: ticks = 5, dropped = 4, overruns = 1, remainder = 10. Cumulative processed tick = 6.' },
      completion: { prompt: 'Start at 200 ms. A sample at 230 retains 30 and processes zero ticks. The next sample is 280.', steps: ['The new elapsed interval is 50 ms.', 'Add the old retained fraction: 50 + 30.'], missing: 'Compute due ticks, processed ticks and the new remainder.' }, source,
    },
    {
      id: 'receipt', title: 'Expire from the processed receipt tick', objectiveIds: ['timing.receipt'],
      paragraphs: [
        'A receipt is a request reaching admission. It gets the owner’s current processed tick, even if the callback was delayed. A newly admitted direction expires four processed ticks later. The client’s optional sentAtMs is a claim about when it sent the request; it cannot move the actor into the past or choose expiry.',
        'Receipt leaves position unchanged. Later samples run movement for the processed ticks still inside the inclusive window. A large elapsed gap can create dropped work, but dropped ticks are not movement and are not extra processed tick numbers. Conversely, if five actual ticks run, a four-tick intent moves on four and stops on the fifth. Write elapsed milliseconds, processed tick and position in separate columns.',
      ],
      worked: { prompt: 'A delayed callback has processed only through tick 5. It then receives seq 10, E, with sentAtMs 0. The courier is at x=1000. A later sample processes five ticks.', steps: ['The receipt tick is 5, not 0 and not a nominal wall-clock tick.', 'The admitted intent expires at processed tick 9. Receipt keeps x=1000.', 'Processed ticks 6, 7, 8 and 9 move east to x=2000.', 'Processed tick 10 is outside expiry and adds no movement.'], answer: 'receiptTick = 5; expiresAt = 9; final processed tick = 10; x = 2000.' },
      completion: { prompt: 'A west input is admitted at processed tick 3 from x=1000. A later callback processes three ticks.', steps: ['Expiry is 3 + 4 = 7.', 'The processed ticks are 4, 5 and 6.'], missing: 'Compute the final processed tick and x. Do not add movement at receipt.' }, source: { path: 'timing/LEARNER.md', anchor: 'receipt-and-movement' },
    },
    {
      id: 'recovery', title: 'Resume the binding; do not reset its history', objectiveIds: ['timing.recovery'],
      paragraphs: [
        'A connection binding links a client label to an owner actor. In this owned model, disconnect blocks new receipts for that binding. It does not delete the actor, stop the owner clock, clear intent or reset the last sequence. Already admitted movement continues until its normal expiry. An offline request changes nothing.',
        'Resume restores the same binding and actor. Its position, expiry and lastSeq remain, so retrying an admitted sequence is stale. A fresh join creates a new actor at x=1000 with lastSeq 0; it does not replace the old actor. This is a delivery-outage model, not a claim about production authentication or restart recovery.',
        'A process restart is a different boundary. A monotonic clock measures elapsed time relative to its origin. Readings from a new origin cannot be subtracted from an old process reading to measure the outage. A reservation with an absolute deadline in one continuing owner clock can expire while no game ticks run; the game’s processed-tick lease is not automatically the right rule for that reservation.',
      ],
      worked: { prompt: 'An actor at x=1000 admits seq 6 E at tick 0. Two ticks run, the connection disconnects, two more ticks run, then the same binding resumes and retries seq 6.', steps: ['The first two steps reach x=1500.', 'Disconnect blocks delivery but the old intent remains eligible for ticks 3 and 4, reaching x=2000.', 'Resume preserves lastSeq 6 and expiry 4. The retry is stale.', 'A separate fresh join would create actor-2 at x=1000, without resetting actor-1.'], answer: 'Resumed actor: x = 2000, lastSeq = 6, expiresAt = 4; retry status = stale.' },
      completion: { prompt: 'A connection disconnects after seq 9 was admitted. It tries seq 10 while offline, resumes, then sends seq 10 again.', steps: ['The offline attempt never reaches admission.', 'lastSeq remains 9 until the resumed delivery.'], missing: 'Decide the resumed request’s status and explain why the offline attempt did not consume its sequence.' }, source: { path: 'timing/LEARNER.md', anchor: 'connection-recovery' },
    },
  ],
  masterySlots: ['clock', 'receipt', 'transfer'],
  support: {
    milestones: ['Keep elapsed milliseconds and processed ticks in separate ledgers.', 'Trace each receipt before applying any later movement.', 'After the guided checks, implement the timing predictor in the prepared source workspace and compare its named checkpoints with the owned runtime.'],
    hints: ['Ask which clock or state owns each value before doing arithmetic.', 'Only processed ticks advance the actor; only newer admitted inputs renew its four-tick window.', 'After committing, compare the clock ledger and actor ledger with the worked correction, retaining your original trace.'], reference: 'timing/LEARNER.md',
  },
};

function clockCase(n) {
  const startMs = 400 + n % 113;
  const first = 11 + n % 37;
  const second = 41 + Math.floor(n / 3) % 64;
  const third = [0, 249, 301, 777][Math.floor(n / 4) % 4] + Math.floor(n / 17) % 13;
  const readings = [startMs + first, startMs + first + second, startMs + first + second + third];
  const timer = createClock(startMs);
  let tick = 0;
  const expected = readings.map((nowMs) => {
    const clock = timer.sample(nowMs);
    tick += clock.ticks;
    return { tick, ...clock };
  });
  return { inputs: { startMs, readings, initial: { tick: 0, remainder: 0, overruns: 0 }, tickMs: 50, maximumTicksPerSample: 5 }, expected, prompt: 'For each reading, return one JSON object {tick,ticks,dropped,overruns,remainder}; tick is cumulative processed work. Return the objects as an array in reading order.', explanation: `The successive elapsed totals include the retained fractions. The resulting ledger is ${JSON.stringify(expected)}. Dropped whole ticks never enter cumulative tick and never remain as debt; only the remainder below 50 ms carries forward.` };
}

function receiptCase(n) {
  const startMs = 3000 + n % 73;
  const before = (n % 4) * 50 + Math.floor(n / 4) % 20;
  const after = [151, 200, 251, 777][Math.floor(n / 3) % 4] + Math.floor(n / 7) % 19;
  const record = { schema: 1, startMs, actions: [
    { type: 'join', label: 'join', id: 'courier' },
    { type: 'sample', label: 'before-receipt', nowMs: startMs + before },
    { type: 'input', label: 'receipt', id: 'courier', seq: 7 + n % 31, move: n % 2 ? 'E' : 'W', sentAtMs: Math.floor(n / 5) % 2 ? 1 : startMs + before + 9000 },
    { type: 'sample', label: 'after-receipt', nowMs: startMs + before + after },
  ] };
  const { observed } = runInvestigation(record);
  const received = observed.checkpoints[2];
  const final = observed.checkpoints[3];
  const expected = { receiptTick: received.tick, expiresAt: received.actors[0].expiresAt, xAtReceipt: received.actors[0].x, processedTick: final.tick, xAfterSample: final.actors[0].x, clock: final.clock };
  return { inputs: { record, initialActor: { x: 1000, move: 'idle', lastSeq: 0 } }, expected, prompt: 'Run this open-floor record in order. At startMs, processed tick, clock remainder and overruns are all zero. Return JSON {receiptTick,expiresAt,xAtReceipt,processedTick,xAfterSample,clock}; clock is the last sample’s {ticks,dropped,overruns,remainder}. All returned fields are numbers. sentAtMs is only a client annotation.', explanation: `Receipt occurs at processed tick ${received.tick} and keeps x=${received.actors[0].x}. Expiry is ${received.tick}+4=${expected.expiresAt}. The next callback processes ${final.clock.ticks} ticks and drops ${final.clock.dropped}; the final actor is x=${expected.xAfterSample}, tick=${final.tick}. The sentAtMs claim cannot change any of these fields.` };
}

function recoveryCase(n, transfer) {
  const startMs = 500 + n % 97;
  const seq = 10 + Math.floor(n / 3) % 70;
  const gap = [50, 100, 151][n % 3];
  const resumedSeq = seq + [-1, 0, 1][Math.floor(n / 3) % 3];
  const record = { schema: 1, startMs, actions: [
    { type: 'join', label: 'initial-join', id: 'A' },
    { type: 'input', label: 'initial-intent', id: 'A', seq, move: 'E' },
    { type: 'sample', label: 'two-steps', nowMs: startMs + 100 },
    { type: 'disconnect', label: 'outage', id: 'A' },
    { type: 'input', label: 'offline-attempt', id: 'A', seq: seq + 1, move: 'W' },
    { type: 'sample', label: 'during-outage', nowMs: startMs + 100 + gap },
    { type: 'resume', label: 'same-binding', id: 'A' },
    { type: 'input', label: 'resumed-receipt', id: 'A', seq: resumedSeq, move: 'W' },
    { type: 'sample', label: 'after-resume', nowMs: startMs + 200 + gap },
    { type: 'join', label: 'fresh-binding', id: 'B' },
  ] };
  const { observed } = runInvestigation(record);
  const final = observed.checkpoints.at(-1);
  const expected = { tick: final.tick, actors: final.actors, resumedReceipt: observed.checkpoints[7].receipt };
  const inputs = { record, note: 'A disconnect/resume restores the same owner process and binding. B is a fresh join.' };
  let extra = '';
  if (transfer) {
    const restarted = Math.floor(n / 9) % 3 === 0;
    const deadlineMs = 7000 + Math.floor(n / 11) % 101;
    const nowMs = restarted ? 20 + n % 30 : deadlineMs + [-1, 0, 23][Math.floor(n / 13) % 3];
    inputs.reservation = { deadlineMs, nowMs, sameClockOrigin: !restarted, processedGameTicksDuringPause: 0, rule: 'Valid only while nowMs < deadlineMs, if both readings have the same origin.' };
    expected.reservationStatus = restarted ? 'unknown' : nowMs < deadlineMs ? 'valid' : 'expired';
    extra = ' Also return reservationStatus: valid, expired or unknown. A separate maintenance reservation uses the stated absolute owner-clock deadline, not the game’s processed-tick expiry; a restarted clock has no known relation to the saved deadline.';
  }
  return { inputs, expected, prompt: `Trace the complete record. At startMs there are no actors; processed tick, clock remainder and overruns are zero. Joins create actor-1, actor-2 in order, each at x=1000, lastSeq=0, expiresAt=0 and idle. Return JSON {tick,actors,resumedReceipt}; actors is the final ordered array of {id,connection,connected,lastSeq,expiresAt,x}. connected is a boolean; id and connection are strings. resumedReceipt is {status,tick,seq}; status is "admitted", "stale" or "offline". Other fields are numbers.${extra}`, explanation: `The offline attempt is not admitted. Resume retains the actor’s history, so sequence ${resumedSeq} is ${expected.resumedReceipt.status}; a fresh join adds actor-2 at x=1000. The final processed tick is ${final.tick}.${transfer ? ` For the separate reservation the result is ${expected.reservationStatus}: elapsed-deadline rules use a continuing clock origin, while processed game ticks alone cannot decide them.` : ''}` };
}

export function makeItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new TypeError('unknown item mode');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError('seed must be a non-negative safe integer');
  const valid = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
  if (!valid.includes(key)) throw new TypeError('unknown timing item key');
  const n = seed + (mode === 'completion' ? 149 : mode === 'mastery' ? 283 : 0);
  let item;
  let objectiveIds;
  if (key === 'clock') { item = clockCase(n); objectiveIds = ['timing.clock']; }
  if (key === 'receipt') { item = receiptCase(n); objectiveIds = ['timing.clock', 'timing.receipt']; }
  if (key === 'recovery' || key === 'transfer') { item = recoveryCase(n, key === 'transfer'); objectiveIds = ['timing.clock', 'timing.receipt', 'timing.recovery']; }
  if (mode === 'completion') {
    item.inputs.completedSteps = key === 'clock'
      ? [`The first sample has already been calculated: ${JSON.stringify(item.expected[0])}. Carry its remainder into the second sample and complete the ledger.`]
      : key === 'receipt'
        ? [`The sample before receipt has processed ${item.expected.receiptTick} ticks. The input arrives at that processed tick; now fill its expiry and subsequent movement.`]
        : ['The initial E input has moved the actor twice before disconnect: x=1500, lastSeq unchanged, expiry=4. Continue from that state; do not restart the actor.'];
  }
  return { id: `timing:${mode}:${key}:${seed}`, objectiveIds, ...item, prompt: `${mode === 'completion' ? 'Complete the checkpoint ledger from the supplied record. ' : ''}${item.prompt}`, format: { type: 'json' }, hints: mode === 'mastery' ? [] : ['Keep owner milliseconds, processed tick and actor state separate.', 'Carry only fractional milliseconds; retain actor state across resume, and admit only strictly newer sequences.', item.explanation], source };
}
