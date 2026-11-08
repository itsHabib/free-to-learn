// Sources: teaching-repair/interface.md (base bf923c11) and evaluation/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'evaluation/LEARNER.md', anchor });
export const unit = {
  id: 'evaluation', title: 'M7 · Count what a detector can support', prerequisites: ['telemetry'],
  objectives: [
    { id: 'evaluation.window', kind: 'procedure', text: 'Classify an ordered signal list with strict distance and time-window boundaries.', prerequisites: ['telemetry.sequence'] },
    { id: 'evaluation.metrics', kind: 'procedure', text: 'Count each case once and calculate defined or null rates.', prerequisites: ['evaluation.window'] },
    { id: 'evaluation.claim', kind: 'concept', text: 'Identify feedback reuse and observational limits in an evaluation claim.', prerequisites: ['evaluation.metrics', 'telemetry.claim'] },
  ],
  sections: [
    { id: 'window', title: 'Choose observations before counting a window', objectiveIds: ['evaluation.window'],
      paragraphs: [
        'A signal is one denied interaction reconstructed from server state. It is eligible only when its reason is range and its squared distance is strictly greater than minDistanceMm squared. A distant cooldown refusal is still ineligible; a denial exactly at the minimum is ineligible too.',
        'For a latest tick t, count eligible observations in (t-windowTicks, t]. The old edge is excluded and the latest tick is included. If any such window reaches threshold, flag the case. A quiet tail does not undo an earlier burst, and two supplied observations at the same tick count twice.',
      ],
      worked: { prompt: 'Minimum distance is 100 mm, threshold is 2 and the window is 4 ticks. Eligible range denials occur at ticks 6 and 9.', steps: ['Both squared distances must exceed 10000 mm².', 'The window ending at 9 is (5,9], so both 6 and 9 are inside.', 'Two observations meet threshold 2. A later cooldown does not undo this window.'], answer: 'Flagged. If the first eligible tick were 5, that pair would miss the threshold.' },
      completion: { prompt: 'Threshold is 2 and windowTicks is 5. Eligible ticks are 10 and 15.', steps: ['The window ending at 15 has old edge 10.', 'The old edge is excluded.'], missing: 'Supply the count in that window and whether the case flags.' }, source: source('window-boundaries') },
    { id: 'metrics', title: 'Give each case one vote', objectiveIds: ['evaluation.metrics'],
      paragraphs: [
        'A case is one run, even when it contains many signals. Compare its Boolean flag with its Boolean label once. Flagged-positive is a true positive; flagged-negative is a false positive; unflagged-negative is a true negative; unflagged-positive is a false negative.',
        'Precision is tp/(tp+fp), recall is tp/(tp+fn), and falsePositiveRate is fp/(fp+tn). Return null when the denominator is zero. Null means this corpus supplied no denominator for the question; it is not a measured zero or a perfect rate.',
      ],
      worked: { prompt: 'Four runs produce flagged-positive, unflagged-positive, flagged-negative and unflagged-negative. The first has twenty signals.', steps: ['Count one run in each cell: tp=1, fn=1, fp=1, tn=1; total=4.', 'Precision uses the two flagged cases: 1/2.', 'Recall uses the two positive cases and false-positive rate uses the two negative cases: each is 1/2.'], answer: 'Twenty signals still contribute one true-positive case. All three rates are 0.5.' },
      completion: { prompt: 'The only run is a quiet negative case and it is unflagged.', steps: ['total=1, tn=1; tp=fp=fn=0.', 'No cases are flagged, so the precision denominator is zero.'], missing: 'Supply precision, recall and falsePositiveRate.' }, source: source('counts-and-rates') },
    { id: 'claim', title: 'Keep the result within its evidence', objectiveIds: ['evaluation.claim'],
      paragraphs: [
        'Compute predictions from signals before reading labels. A label describes the scripted violation being evaluated; it is not a feature. If a manual script and an automated script provide identical legal signals, this detector must give them the same result. A lack of denials cannot identify who or what sent the legal commands.',
        'Use exploration cases to choose settings, then commit source, settings and corpus before evaluation. If evaluation feedback leads you to change those choices, preserve the first report and call the next run a revision. These synthetic cases measure this selected workload, not population prevalence or a probability that a real player cheats.',
      ],
      worked: { prompt: 'An evaluator sees that window 8 misses an evaluation burst, changes to window 20, then runs the same cases again.', steps: ['The first report exposed information about evaluation cases.', 'The new setting was chosen using that information.', 'Preserve both reports and label the new one a revision, even if it scores better.'], answer: 'The second run is a revision informed by evaluation feedback, not a fresh independent evaluation.' },
      completion: { prompt: 'Two cases have identical signals and settings but different declaredAutomation metadata.', steps: ['The classifier receives only signals and settings.', 'Its input is identical for both cases.'], missing: 'Supply whether their flags may differ and whether those signals identify automation.' }, source: source('exploration-and-evaluation') },
  ],
  masterySlots: ['boundary', 'counts', 'transfer'],
  support: {
    milestones: ['Trace eligibility and an open-left window.', 'Reconcile total with tp+fp+tn+fn and name every rate denominator.', 'Implement classify/evaluate, commit settings, then interpret the separate evaluation report.'],
    hints: ['Separate eligibility, the time window and the case-level decision.', 'List cases in four cells before dividing; keep an absent denominator null.', 'After a committed attempt, use the sibling report to distinguish a correction from an independent evaluation.'], reference: 'evaluation/LEARNER.md',
  },
};

function hashSeed(seed) { let n = 2166136261; for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0; return n; }
function classify(signals, settings) {
  const eligible = signals.filter((s) => s.reason === 'range' && s.distanceSquared > settings.minDistanceMm ** 2);
  return eligible.some(({ tick }) => eligible.filter((s) => s.tick > tick - settings.windowTicks && s.tick <= tick).length >= settings.threshold);
}
function signalCase(n) {
  const minDistanceMm = 100 + n % 50;
  const windowTicks = 3 + n % 7;
  const latest = 20 + n % 50;
  const variant = n % 5;
  const signal = (tick, reason = 'range', distanceSquared = (minDistanceMm + 1) ** 2) => ({ tick, reason, distanceSquared });
  const signals = [signal(latest - windowTicks + (variant === 0 ? 0 : 1)), signal(latest)];
  if (variant === 2) signals[0].distanceSquared = minDistanceMm ** 2;
  if (variant === 3) signals[0].reason = 'cooldown';
  if (variant === 4) { signals[0].tick = latest; signals.push(signal(latest + 40, 'cooldown')); }
  return { signals, settings: { threshold: 2, windowTicks, minDistanceMm } };
}
function countCases(cases, settings) {
  const metrics = { total: cases.length, tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const c of cases) metrics[classify(c.signals, settings) ? (c.label ? 'tp' : 'fp') : (c.label ? 'fn' : 'tn')] += 1;
  const rate = (x, y) => y === 0 ? null : x / y;
  return { ...metrics, precision: rate(metrics.tp, metrics.tp + metrics.fp), recall: rate(metrics.tp, metrics.tp + metrics.fn), falsePositiveRate: rate(metrics.fp, metrics.fp + metrics.tn) };
}
function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown evaluation item mode');
  const section = mode === 'mastery' ? { boundary: 'window', counts: 'metrics', transfer: 'claim' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown evaluation item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `evaluation:${mode}:${key}:${seed}`, objectiveIds: [`evaluation.${section}`], format: { type: 'json' }, source: source(section === 'window' ? 'window-boundaries' : section === 'metrics' ? 'counts-and-rates' : 'exploration-and-evaluation') };
  if (section === 'window') {
    const inputs = signalCase(n);
    const expected = { flagged: classify(inputs.signals, inputs.settings) };
    return { ...base, inputs, expected, prompt: 'Return {flagged} for this case. Only range denials strictly beyond minDistanceMm count. Any open-left, closed-right window (t-windowTicks,t] reaching threshold flags the case. Each listed observation counts, including equal-tick entries.',
      explanation: `The result is ${JSON.stringify(expected)}. Square the minimum before comparing distanceSquared; equality is ineligible. Exclude a tick exactly at the old time edge and ignore cooldown entries. Check every eligible ending tick, so a later quiet period cannot erase an earlier qualifying burst.`,
      hints: ['Filter reasons and squared distances before counting.', 'For each eligible ending tick, exclude observations at or before t-windowTicks.', `Applying both strict edges yields ${JSON.stringify(expected)}.`] };
  }
  if (section === 'metrics') {
    const settings = { threshold: 2, windowTicks: 5, minDistanceMm: 10 };
    const cases = Array.from({ length: mode === 'completion' ? 2 + n % 5 : n % 7 }, (_, i) => ({ id: `run-${i}`, label: (n >>> i) % 2 === 1, signals: (n + i) % 3 === 0 ? [] : Array.from({ length: 2 + (i % 3) }, (_, j) => ({ tick: 10 + j, reason: 'range', distanceSquared: 121 })) }));
    const expected = countCases(cases, settings);
    return { ...base, inputs: { cases, settings }, expected, prompt: 'Classify each run using the stated rule, then return exactly {total,tp,fp,tn,fn,precision,recall,falsePositiveRate}. Give each run one vote. Use a JSON number for a defined rate and null for a zero denominator; fractions here terminate or repeat as ordinary division results.',
      explanation: `The case-level totals and rates are ${JSON.stringify(expected)}. The total is the number of runs, not signals. Precision divides flagged positives by all flags; recall divides them by positive labels; falsePositiveRate divides false flags by negative labels. An empty denominator gives null.`,
      hints: ['Classify each case before consulting its label.', 'Make four counts, check that they sum to total, then calculate each denominator.', `The reconciled metric object is ${JSON.stringify(expected)}.`] };
  }
  const twin = signalCase(n);
  const inputs = { domain: 'rejected document edits', evaluationFeedbackSeen: n % 2 === 0, changedSettingsUsingThatFeedback: n % 2 === 0, committedBeforeFirstEvaluation: true, twinSignals: twin.signals, settings: twin.settings, differentAutomationMetadata: true };
  const expected = { report: inputs.evaluationFeedbackSeen ? 'revision' : 'first-committed-evaluation', twinFlagged: classify(twin.signals, twin.settings), twinFlagsMustMatch: true, automationIdentifiable: false };
  return { ...base, inputs, expected, prompt: 'An edit-review service applies the same range-signal classifier and supplied settings to two runs with identical signals. It commits settings before its first evaluation. The supplied booleans say whether it later changed settings using evaluation feedback. Return {report,twinFlagged,twinFlagsMustMatch,automationIdentifiable}, choosing report first-committed-evaluation or revision. Compute their common flag and decide what the evidence permits, not which script you suspect.',
    explanation: `The warranted report is ${JSON.stringify(expected)}. ${inputs.evaluationFeedbackSeen ? 'The later settings use exposed evaluation results, so the later report must retain that revision history.' : 'The initial committed settings precede evaluation feedback.'} Identical classifier inputs require identical flags; automation metadata is not an input and these signals cannot identify automation.`,
    hints: ['Ask whether evaluation information influenced the setting being reported.', 'Compare the classifier’s actual inputs for the two runs.', `The bounded interpretation is ${JSON.stringify(expected)}.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const minimum = x.settings.minDistanceMm ** 2;
    const eligible = (signals) => signals.filter((s) => s.reason === 'range' && s.distanceSquared > minimum).map((s) => s.tick);
    const first = x.cases?.[0];
    const firstFlag = first ? classify(first.signals, x.settings) : null;
    const cell = firstFlag ? (first.label ? 'tp' : 'fp') : first?.label ? 'fn' : 'tn';
    const steps = args.key === 'window'
      ? [`The squared minimum is ${minimum} mm². Filtering only reason and strict distance leaves eligible ticks ${JSON.stringify(eligible(x.signals))}. Complete the open-left window count.`]
      : args.key === 'metrics'
        ? [`The first case ${first.id} has flagged=${firstFlag} and label=${first.label}, so it contributes one ${cell}. Complete the other ${x.cases.length - 1} cases, then calculate the rates.`]
        : [`Both runs receive ${x.twinSignals.length} signals and the same settings. After applying the squared minimum ${minimum} mm², both have eligible ticks ${JSON.stringify(eligible(x.twinSignals))}. Complete the shared window result and decide what the report can claim.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from the partial calculation in inputs.completedSteps. ${item.prompt}` };
  }
  return item;
}
