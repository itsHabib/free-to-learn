import { isDeepStrictEqual } from 'node:util';

const settings = { threshold: 3, windowTicks: 20, minDistanceMm: 500 };
const range = (tick, distanceSquared = 1_000_000) => ({ tick, reason: 'range', distanceSquared });
const burst = [range(1), range(2), range(3)];
const clone = (value) => JSON.parse(JSON.stringify(value));

function classification(name, signals, expected, section, overrides = {}) {
  return { name, method: 'classify', args: [signals, { ...settings, ...overrides }], expected, section };
}

function evaluation(name, cases, metrics, section) {
  return { name, method: 'evaluate', args: [cases, { ...settings }], section, expected: {
    decisions: cases.map(({ id }, index) => ({ id, flagged: metrics.flags[index] })),
    metrics: Object.fromEntries(Object.entries(metrics).filter(([key]) => key !== 'flags')),
  } };
}

/** Small behavioral cases, separate from the synthetic corpus used to explore thresholds. */
export function cases() {
  const mixed = [
    { id: 'positive-a', label: true, signals: burst },
    { id: 'negative-many-observations', label: false, signals: [...burst, range(4), range(5), range(6)] },
    { id: 'miss-a', label: true, signals: [] },
    { id: 'negative-quiet-a', label: false, signals: [] },
    { id: 'positive-b', label: true, signals: burst },
    { id: 'miss-b', label: true, signals: [range(1)] },
    { id: 'negative-quiet-b', label: false, signals: [] },
    { id: 'miss-c', label: true, signals: [] },
  ];
  return [
    classification('empty signals do not flag', [], false, 'eligible-observations'),
    classification('three distant range denials flag', burst, true, 'eligible-observations'),
    classification('cooldown re-presses do not count', burst.map((signal) => ({ ...signal, reason: 'cooldown' })), false, 'eligible-observations'),
    classification('range at the minimum distance does not count', burst.map((signal) => ({ ...signal, distanceSquared: 250_000 })), false, 'eligible-observations'),
    classification('near-boundary denials do not accumulate', [range(1, 62_501), range(2, 249_999), range(3, 250_000), range(4)], false, 'eligible-observations'),
    classification('the left window edge is excluded', [range(1), range(11)], false, 'window-boundaries', { threshold: 2, windowTicks: 10 }),
    classification('one tick inside the window counts', [range(1), range(10)], true, 'window-boundaries', { threshold: 2, windowTicks: 10 }),
    classification('an earlier qualifying burst remains a flag after quiet time', [...burst, { tick: 100, reason: 'cooldown', distanceSquared: 1_000_000 }], true, 'window-boundaries'),
    classification('lifetime total is not a window total', [range(1), range(22), range(43)], false, 'window-boundaries'),
    classification('expire every old observation, not only one', [range(1), range(2), range(21), range(22)], false, 'window-boundaries'),
    classification('equal-tick observations count separately in validated policy input', [range(5), range(5)], true, 'window-boundaries', { threshold: 2 }),
    classification('zero minimum still uses strict distance', [range(1, 0), range(2, 0), range(3, 0)], false, 'eligible-observations', { minDistanceMm: 0 }),
    classification('a positive distance qualifies with zero minimum', [range(1, 1)], true, 'eligible-observations', { threshold: 1, minDistanceMm: 0 }),
    evaluation('one case gets one vote and rates use their own denominators', mixed,
      { total: 8, tp: 2, fp: 1, tn: 2, fn: 3, precision: 2 / 3, recall: 2 / 5, falsePositiveRate: 1 / 3,
        flags: [true, true, false, false, true, false, false, false] }, 'one-case-one-vote'),
    evaluation('identical signals keep the same decision when the label changes', [
      { id: 'same-negative', label: false, signals: burst }, { id: 'same-positive', label: true, signals: burst },
    ], { total: 2, tp: 1, fp: 1, tn: 0, fn: 0, precision: 1 / 2, recall: 1, falsePositiveRate: 1,
      flags: [true, true] }, 'labels-are-not-features'),
    evaluation('many observations still count as one negative case', [{ id: 'one-negative', label: false, signals: [...burst, range(4), range(5), range(6)] }],
      { total: 1, tp: 0, fp: 1, tn: 0, fn: 0, precision: 0, recall: null, falsePositiveRate: 1, flags: [true] }, 'one-case-one-vote'),
    evaluation('no positives and no predictions leave precision and recall undefined', [{ id: 'quiet-negative', label: false, signals: [] }],
      { total: 1, tp: 0, fp: 0, tn: 1, fn: 0, precision: null, recall: null, falsePositiveRate: 0, flags: [false] }, 'counts-and-rates'),
    evaluation('no negative cases leave false-positive rate undefined', [{ id: 'quiet-positive', label: true, signals: [] }],
      { total: 1, tp: 0, fp: 0, tn: 0, fn: 1, precision: null, recall: 0, falsePositiveRate: null, flags: [false] }, 'counts-and-rates'),
    evaluation('an empty case set has zero counts and undefined rates', [],
      { total: 0, tp: 0, fp: 0, tn: 0, fn: 0, precision: null, recall: null, falsePositiveRate: null, flags: [] }, 'counts-and-rates'),
  ].map(clone);
}

function evidence(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (item === undefined) return { type: 'undefined' };
      if (typeof item === 'number' && !Number.isFinite(item)) return { type: 'number', value: String(item) };
      if (['bigint', 'function', 'symbol'].includes(typeof item)) return { type: typeof item, value: String(item) };
      return item;
    }));
  } catch {
    return { type: 'non-JSON result' };
  }
}

/** Owner-side assessment. Preserve expected/actual/input and a targeted repair pointer. */
export async function assess(candidate) {
  const missing = ['classify', 'evaluate'].filter((name) => typeof candidate?.[name] !== 'function');
  if (missing.length > 0) return { passed: false, criteria: missing.map((name) => ({
    name: `export ${name}`, passed: false, error: {
      message: `Export ${name} as declared in the contract.`, expected: 'function', actual: typeof candidate?.[name],
      source: 'LEARNER.md#the-contract',
    },
  })) };
  const criteria = [];
  for (const item of cases()) {
    let actual;
    const args = clone(item.args);
    try { actual = await candidate[item.method](...args); }
    catch (error) { actual = { threw: String(error?.message ?? error) }; }
    const changedInput = !isDeepStrictEqual(args, item.args);
    const passed = isDeepStrictEqual(actual, item.expected) && !changedInput;
    const criterion = { name: item.name, passed };
    if (!passed) criterion.error = {
      message: changedInput ? `Preserve the supplied inputs while evaluating: ${item.name}.` : `The result violates this requirement: ${item.name}.`,
      input: evidence(item.args), expected: item.expected,
      actual: changedInput ? { result: evidence(actual), inputAfter: evidence(args) } : evidence(actual),
      source: `LEARNER.md#${item.section}`,
    };
    criteria.push(criterion);
  }
  return { passed: criteria.every((item) => item.passed), criteria };
}
