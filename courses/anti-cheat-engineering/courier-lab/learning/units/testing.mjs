const source = { path: 'lab/order/LEARNER.md', anchor: 'from-an-observation-to-a-test' };

export const unit = {
  id: 'testing', title: 'M3 · Make a test discriminate', prerequisites: ['spatial', 'order'],
  intro: 'A request succeeds at HTTP level while the game grants cargo incorrectly. Construct an assertion plan that fails on the wrong state and still passes on a correct implementation.',
  difficulty: 'The hardest task separates the contract’s expected value, each implementation’s observed value, and the smallest set of assertions that distinguishes every target defect.',
  objectives: [
    { id: 'testing.observe', kind: 'procedure', text: 'Choose an authoritative state assertion that distinguishes a specified defect after its triggering action.', prerequisites: ['spatial.cooldown', 'order.admission'] },
    { id: 'testing.coverage', kind: 'procedure', text: 'Construct a minimal assertion plan covering every supplied defect trace.', prerequisites: ['testing.observe', 'order.coalescing', 'order.expiry'] },
    { id: 'testing.controls', kind: 'concept', text: 'Classify defect detection separately from a broken control or an unsuccessful test run.', prerequisites: ['testing.observe', 'testing.coverage'] },
  ],
  sections: [
    {
      id: 'observe', title: 'Assert the consequence, after it can happen', objectiveIds: ['testing.observe'],
      paragraphs: [
        'An assertion compares an observed value with a value required by the contract and fails when they differ. Arrange known state, perform the triggering action, observe the owner’s result, then assert it. HTTP 200 says the input was handled. It does not say a later interaction was legal. For a remote pickup, cargo must still be false after the interaction tick.',
        'A useful assertion has a time, a state field and an expected value. For example, assert actor.cargo equals false at tick 1 after a distant idle interaction. Reading before the tick cannot test that interaction. Checking status alone cannot distinguish two implementations that both return 200 but change cargo differently.',
      ],
      worked: { prompt: 'A courier is 1000 mm from the core. Correct and faulty servers both return HTTP 200 at tick 0. At tick 1 the correct actor has cargo false and the faulty actor has cargo true.', steps: ['The action is evaluated at tick 1, so observe after advancing one tick.', 'Both HTTP results match; status cannot distinguish them.', 'Compare actor.cargo with false. The correct server passes and the faulty one fails.'], answer: '{"tick":1,"path":"actor.cargo","expected":false}' },
      completion: { prompt: 'A loaded actor is far from the depot. Its score starts at 2. At the next tick the correct server keeps score 2; the faulty server awards score 3.', steps: ['Wait until the pending deposit has been evaluated.', 'Choose the authoritative score field.'], missing: 'Supply the tick, actor.score path and required expected score for an assertion.' }, source,
    },
    {
      id: 'coverage', title: 'Cover different defects with a small plan', objectiveIds: ['testing.coverage'],
      paragraphs: [
        'A deliberately changed implementation is a defect control, also called a mutant. A test detects it only when the correct implementation passes and the defect fails an assertion for the stated contract. One test can expose several defects; two nearly identical assertions may expose the same defect and leave another untouched.',
        'Build a coverage table: each row is an assertion and each column is a defect. Mark a column only when that assertion’s observed value differs from its expected value. Choose rows whose combined marked columns include every target defect. Then try removing a row: if all columns remain covered, the plan was not minimal. The generated tasks ask for the fewest assertions; an explicit tie rule makes equivalent minimal plans gradeable.',
      ],
      worked: { prompt: 'Assertion A catches early expiry and late expiry. B catches stale input. C catches only early expiry. What is the smallest plan for all three defects?', steps: ['A covers both expiry defects. C adds nothing once A is chosen.', 'B is the only assertion that catches stale input.', 'Choose A and B; neither alone covers every defect.'], answer: '["A","B"]' },
      completion: { prompt: 'A catches duplicate renewal. B catches read renewal. C catches both. The correct implementation passes every assertion.', steps: ['List the two required defect columns.', 'Check whether any one row covers both.'], missing: 'Choose the smallest set of assertion IDs.' }, source,
    },
    {
      id: 'controls', title: 'Distinguish detection from a broken experiment', objectiveIds: ['testing.controls'],
      paragraphs: [
        'A failing test alone proves little. First run the same test on a correct implementation. If the correct control fails, the setup or assertion is wrong for this contract. If the defect run crashes, times out, or cannot import its code, no observed contract mismatch has been established. Preserve that failure as an unsuccessful run, not a detected defect.',
        'A valid detection has two pieces: a passing correct control and a defect run that reaches the intended observation and fails a state assertion. If both pass, this test did not detect that defect. The guided tasks exercise assertion planning and evidence classification only. Your project still requires your own async HTTP scenario with real requests, owner-side advances and state assertions; a correct table answer is not that source artifact.',
      ],
      worked: { prompt: 'A correct control passes. Variant X reaches tick 5 and fails x == 2000 with actual 2250. Variant Y times out before its observation. Variant Z passes.', steps: ['X produced a contract mismatch after a passing control, so this test detects X.', 'Y produced no completed observation; investigate the timeout.', 'Z agrees with this test’s expectations, so the test does not detect Z.'], answer: '{"detected":["X"],"notDetected":["Z"],"inconclusive":["Y"]}' },
      completion: { prompt: 'The correct implementation itself fails the assertion. A defect also fails the same assertion.', steps: ['Check the correct control before crediting a defect result.'], missing: 'Decide whether the defect was validly detected, missed, or remains inconclusive.' }, source,
    },
  ],
  masterySlots: ['observation', 'minimal-plan', 'transfer'],
  support: {
    milestones: ['Write each assertion as observation time, path and contract value.', 'Check a coverage table for a missing defect and a redundant assertion.', 'Author learner-scenario.mjs in your order workspace, run the correct and defect controls, and inspect actual state assertion failures. The guided plan does not replace that file.'],
    hints: ['Look for a value whose correct and defect traces actually differ.', 'Cross out an assertion if the remaining ones still cover every required defect.', 'After an attempt, compare the worked coverage or control classification and retain the original plan.'], reference: 'lab/order/LEARNER.md',
  },
};

function observationCase(n) {
  const tick = 2 + n % 17;
  const score = Math.floor(n / 3) % 8;
  const type = n % 3;
  const path = ['actor.cargo', 'actor.score', 'actor.x'][type];
  const expected = [false, score, 1000 + 250 * (2 + Math.floor(n / 3) % 3)][type];
  const actual = [true, score + 1, expected + 250][type];
  const context = ['a remote pickup', 'a remote deposit', 'one movement step after expiry'][type];
  const correct = { tick, 'http.status': 200, [path]: expected };
  const defect = { tick, 'http.status': 200, [path]: actual };
  return { inputs: { action: context, correct, defect, allowedPaths: ['http.status', path] }, expected: { tick, path, expected }, prompt: 'Both traces completed the stated action. Construct the single assertion that passes the correct trace and fails the defect trace. Return JSON {tick,path,expected}. Use an allowed path with different observed values.', explanation: `Both HTTP statuses are 200, so that assertion would pass both versions. At tick ${tick}, ${path} must equal ${JSON.stringify(expected)}; the defect produced ${JSON.stringify(actual)}. This checks the consequence of ${context}, after it happened.` };
}

const maskSets = [
  [3, 6, 5, 1], // any pair among the first three covers all; tie rule is explicit
  [1, 2, 4, 3],
  [7, 1, 2, 4],
  [3, 4, 1, 2],
];

function minimalPlan(assertions, defects) {
  let best = null;
  for (let subset = 1; subset < 2 ** assertions.length; subset += 1) {
    const chosen = assertions.filter((_, index) => subset & 2 ** index);
    const covered = defects.every((defect) => chosen.some((item) => JSON.stringify(item.observed[defect]) !== JSON.stringify(item.expected)));
    if (!covered) continue;
    const ids = chosen.map((item) => item.id).sort();
    if (!best || ids.length < best.length || ids.length === best.length && ids.join(',') < best.join(',')) best = ids;
  }
  return best;
}

function coverageCase(n) {
  const defects = ['equal-seq-admitted', 'expiry-T+3', 'stale-interact'];
  const masks = maskSets[n % maskSets.length];
  const rotation = Math.floor(n / 4) % 4;
  const admittedAt = 5 + Math.floor(n / 7) % 20;
  const initialX = 1000 + Math.floor(n / 9) % 5 * 25;
  const measurements = [
    { fixture: 'duplicate', arrange: `Admit seq 10 E at tick ${admittedAt}; retry seq 10 at tick ${admittedAt + 2}.`, atTick: admittedAt + 2, path: 'actor.expiresAt', expected: admittedAt + 4, defectValue: admittedAt + 6 },
    { fixture: 'fourth-step', arrange: `Admit seq 10 E at tick ${admittedAt} from x=${initialX}; process four ticks on open floor.`, atTick: admittedAt + 4, path: 'actor.x', expected: initialX + 1000, defectValue: initialX + 750 },
    { fixture: 'stale-bit', arrange: 'Before a tick, admit seq 10 idle false, then send seq 9 idle true from an empty courier at its core.', atTick: admittedAt + 1, path: 'actor.cargo', expected: false, defectValue: true },
  ];
  const assertions = masks.map((mask, index) => {
    const id = String.fromCharCode(65 + (index + rotation) % 4);
    const checks = measurements.filter((_, bit) => mask & 2 ** bit);
    const expected = checks.map((check) => check.expected);
    return { id, checks: checks.map(({ fixture, path, atTick }) => ({ fixture, path, atTick })), expected, observed: { correct: expected, ...Object.fromEntries(defects.map((defect, bit) => [defect, checks.map((check) => check.fixture === measurements[bit].fixture ? check.defectValue : check.expected)])) } };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const expected = minimalPlan(assertions, defects);
  return { inputs: { defects, fixtures: measurements.map(({ defectValue, ...measurement }) => measurement), assertions, observationNote: 'Each candidate is one grouped equality assertion over the listed fixture observations in order. Every fixture is reset independently; all correct controls pass.' }, expected, prompt: 'Choose the fewest assertion IDs whose mismatches cover every defect column. Compare observed[defect] with expected as ordered arrays. If several smallest plans exist, choose the alphabetically earliest sorted ID list. Return a JSON array of IDs.', explanation: `The minimal plan is ${JSON.stringify(expected)}. The duplicate fixture exposes expiry renewal; the fourth-step fixture exposes early expiry; the stale-bit fixture exposes a wrongly staged pickup. Take the union of the differing columns. No smaller set covers all three. Equal-sized valid alternatives are resolved by the stated alphabetical rule, not by a claim that they are worse tests.` };
}

function controlsCase(n, transfer = false) {
  const names = transfer ? ['double-charge', 'old-revision', 'poll-writes'] : ['late-expiry', 'stale-admitted', 'read-renews'];
  const states = [
    { correct: 'pass', variant: 'assertion-fail', expected: 4, actual: 5 },
    { correct: 'pass', variant: 'pass', expected: 4, actual: 4 },
    { correct: 'pass', variant: 'timeout', expected: 4, actual: null },
    { correct: 'assertion-fail', variant: 'assertion-fail', expected: 4, actual: 5 },
    { correct: 'pass', variant: 'import-error', expected: 4, actual: null },
  ];
  const runs = names.map((id, index) => ({ id, ...states[(n + index * 2) % states.length], observationTick: 6 + Math.floor(n / 5) % 15, field: transfer ? ['account.charges', 'document.revision', 'document.revision'][index] : ['actor.x', 'actor.lastSeq', 'actor.expiresAt'][index] }));
  const expected = { detected: [], notDetected: [], inconclusive: [] };
  for (const run of runs) {
    if (run.correct !== 'pass' || !['pass', 'assertion-fail'].includes(run.variant)) { expected.inconclusive.push(run.id); continue; }
    if (run.variant === 'pass') { expected.notDetected.push(run.id); continue; }
    expected.detected.push(run.id);
  }
  for (const values of Object.values(expected)) values.sort();
  return { inputs: { context: transfer ? 'Reservation service: retrying a request must charge once, older document revisions must be ignored, and polling must not write. Each row uses a fresh fixture and a contract-specific state assertion.' : 'Each row reruns an isolated game scenario against a correct implementation and one defect.', runs }, expected, prompt: 'Classify the evidence. detected requires a passing correct control plus a completed variant assertion mismatch. notDetected means both pass. All failed correct controls and runs without a completed observation are inconclusive. Return JSON {detected,notDetected,inconclusive}, with alphabetically sorted ID arrays.', explanation: `Detected: ${expected.detected.join(', ') || 'none'}; not detected: ${expected.notDetected.join(', ') || 'none'}; inconclusive: ${expected.inconclusive.join(', ') || 'none'}. A timeout or import error is evidence of an unsuccessful run, not a demonstrated contract defect. A failing correct control invalidates the comparison even when the variant also fails.` };
}

function investigationCase(n) {
  const initialChargeCount = Math.floor(n / 7) % 4;
  const uniqueRequests = 1 + Math.floor(n / 6) % 3;
  const requestIds = Array.from({ length: uniqueRequests }, (_, index) => `reserve-${n % 97}-${index}`).flatMap((id) => [id, id]);
  const expectedChargeCount = initialChargeCount + uniqueRequests;
  const makeRun = () => ({ requestIds: [...requestIds], captureStatus: 'complete', processedRequestCount: requestIds.length, ledger: { source: 'owner', chargeCount: expectedChargeCount } });
  const inputs = {
    contract: 'This owned reservation service charges once for each distinct request ID. Retrying the same ID adds no charge. Start both implementations from the declared initial charge count. Compare owner ledger snapshots only after every request has been processed.',
    fixture: { initialChargeCount, requestIds },
    correctRun: makeRun(),
    candidateRun: makeRun(),
    actions: [
      { value: 'run-correct-control', meaning: 'Run the known-correct implementation on the declared fixture and capture its completed owner ledger.' },
      { value: 'repair-control', meaning: 'Diagnose the known-correct run or setup until it produces the contract value before comparing the candidate.' },
      { value: 'match-request-schedule', meaning: 'Rerun both implementations with exactly the declared request IDs and the same final processing boundary.' },
      { value: 'finish-candidate-observation', meaning: 'Resolve the interrupted capture and obtain the candidate owner ledger after every request is processed.' },
      { value: 'wait-for-worker', meaning: 'Allow the remaining queued requests to be processed, then capture the owner ledger.' },
      { value: 'read-owner-ledger', meaning: 'Replace the client estimate with a completed owner ledger observation.' },
      { value: 'increase-retries', meaning: 'Send one hundred additional copies of the current requests before checking anything else.' },
    ],
    reasons: [
      { value: 'control-absent', meaning: 'There is no correct-control result for this experiment.' },
      { value: 'control-disagrees', meaning: 'The known-correct run already disagrees with the declared contract.' },
      { value: 'different-inputs', meaning: 'The implementations received different request IDs, which can legitimately cause different charge counts.' },
      { value: 'no-completed-observation', meaning: 'The candidate run produced no completed state observation.' },
      { value: 'observation-too-early', meaning: 'The snapshot precedes processing of some requests whose effects the experiment is meant to test.' },
      { value: 'client-value-not-authoritative', meaning: 'A client estimate does not establish the owner ledger’s state.' },
      { value: 'insufficient-load', meaning: 'A higher retry volume alone is needed to make a conclusion valid.' },
    ],
  };
  const branch = n % 6;
  let nextAction;
  let reason;
  if (branch === 0) {
    inputs.correctRun = null;
    inputs.candidateRun.ledger.chargeCount += 1;
    nextAction = 'run-correct-control';
    reason = 'control-absent';
  }
  if (branch === 1) {
    inputs.correctRun.ledger.chargeCount += 1;
    inputs.candidateRun.ledger.chargeCount += 1;
    nextAction = 'repair-control';
    reason = 'control-disagrees';
  }
  if (branch === 2) {
    inputs.candidateRun.requestIds[1] = `different-${n}`;
    inputs.candidateRun.ledger.chargeCount += 1;
    nextAction = 'match-request-schedule';
    reason = 'different-inputs';
  }
  if (branch === 3) {
    inputs.candidateRun.captureStatus = 'timeout';
    inputs.candidateRun.ledger = null;
    nextAction = 'finish-candidate-observation';
    reason = 'no-completed-observation';
  }
  if (branch === 4) {
    inputs.candidateRun.processedRequestCount = 0;
    inputs.candidateRun.ledger.chargeCount = initialChargeCount;
    nextAction = 'wait-for-worker';
    reason = 'observation-too-early';
  }
  if (branch === 5) {
    inputs.candidateRun.ledger.source = 'client-estimate';
    inputs.candidateRun.ledger.chargeCount += 1;
    nextAction = 'read-owner-ledger';
    reason = 'client-value-not-authoritative';
  }
  const selectedReason = inputs.reasons.find((item) => item.value === reason).meaning;
  return { inputs, expected: { nextAction, reason, expectedChargeCount }, prompt: 'You must repair this experiment before judging the candidate’s retry behavior. Choose the single next action that addresses the unresolved evidence problem, and its reason, from the declared value labels. Also compute the final charge count required by the declared fixture, including its initial count. Return exactly JSON {nextAction,reason,expectedChargeCount}; nextAction and reason are label strings, expectedChargeCount is a number. A complete capture can still be too early if queued requests have not all been processed.', explanation: `The declared fixture has ${uniqueRequests} distinct request IDs, so it requires ${initialChargeCount} + ${uniqueRequests} = ${expectedChargeCount} total charges. ${selectedReason} The next action is ${nextAction}. Sending more retries does not repair that evidence gap; obtain a comparable, completed owner observation with a passing correct control before making a defect claim.` };
}

export function makeItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new TypeError('unknown item mode');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError('seed must be a non-negative safe integer');
  const valid = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
  if (!valid.includes(key)) throw new TypeError('unknown testing item key');
  const n = seed + (mode === 'completion' ? 139 : mode === 'mastery' ? 281 : 0);
  let item;
  let objectiveIds;
  if (key === 'observe' || key === 'observation') { item = observationCase(n); objectiveIds = ['testing.observe']; }
  if (key === 'coverage' || key === 'minimal-plan') { item = coverageCase(n); objectiveIds = ['testing.observe', 'testing.coverage']; }
  if (key === 'controls') { item = controlsCase(n); objectiveIds = ['testing.controls']; }
  if (key === 'transfer') { item = investigationCase(n); objectiveIds = ['testing.observe', 'testing.controls']; }
  if (mode === 'completion') {
    item.inputs.completedSteps = key === 'observe'
      ? ['The two HTTP statuses agree, so a status assertion cannot distinguish these implementations. Compare the remaining authoritative observation.']
      : key === 'coverage'
        ? [`For ${item.inputs.defects[0]}, the differing rows are ${item.inputs.assertions.filter((row) => JSON.stringify(row.observed[item.inputs.defects[0]]) !== JSON.stringify(row.expected)).map((row) => row.id).join(', ')}. Now cover the other columns with the fewest rows overall.`]
        : [`For the first run, check the correct-control result (${item.inputs.runs[0].correct}) before interpreting its variant result (${item.inputs.runs[0].variant}). Complete all three category arrays.`];
  }
  return { id: `testing:${mode}:${key}:${seed}`, objectiveIds, ...item, prompt: `${mode === 'completion' ? 'Complete the assertion or evidence plan using the supplied observations. ' : ''}${item.prompt}`, format: { type: 'json' }, hints: mode === 'mastery' ? [] : ['Start with the contract value and the completed observation.', 'A mismatch covers only its own defect column; check correct controls before crediting failures.', item.explanation], source };
}
