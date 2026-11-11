import { classify, evaluate } from './policy.mjs';

// Independent brute-force implementation: count each possible window directly.
export function classifyByWindows(signals, settings) {
  for (const endpoint of signals) {
    const count = signals.filter((signal) => signal.tick > endpoint.tick - settings.windowTicks
      && signal.tick <= endpoint.tick && signal.reason === 'range'
      && signal.distanceSquared > settings.minDistanceMm * settings.minDistanceMm).length;
    if (count >= settings.threshold) return true;
  }
  return false;
}

export function evaluateByGroups(cases, settings) {
  const decisions = cases.map(({ id, signals }) => ({ id, flagged: classifyByWindows(signals, settings) }));
  const observations = decisions.map((decision, index) => ({ ...decision, label: cases[index].label }));
  const count = (label, flagged) => observations.filter((item) => item.label === label && item.flagged === flagged).length;
  const tp = count(true, true);
  const fp = count(false, true);
  const tn = count(false, false);
  const fn = count(true, false);
  return {
    decisions,
    metrics: { total: observations.length, tp, fp, tn, fn,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      falsePositiveRate: fp + tn ? fp / (fp + tn) : null },
  };
}

export const correctPolicies = {
  'sliding-window': { classify, evaluate },
  'direct-windows-and-groups': { classify: classifyByWindows, evaluate: evaluateByGroups },
};

function withClassifier(replacement) {
  return { classify: replacement, evaluate(cases, settings) {
    // Reuse metric arithmetic, but force each replacement decision through a tiny surrogate signal set.
    const remapped = cases.map((item) => ({ ...item, signals: replacement(item.signals, settings)
      ? Array.from({ length: settings.threshold }, () => ({ tick: 1, reason: 'range', distanceSquared: Number.MAX_VALUE })) : [] }));
    return evaluate(remapped, settings);
  } };
}

export const wrongPolicies = {
  'count-observations-as-votes': { classify, evaluate(cases, settings) {
    const expanded = cases.flatMap((item) => Array.from({ length: Math.max(1, item.signals.length) }, () => item));
    return { ...evaluate(expanded, settings), decisions: evaluate(cases, settings).decisions };
  } },
  'include-cooldown': withClassifier((signals, settings) => classify(signals.map((signal) => ({ ...signal, reason: 'range' })), settings)),
  'include-left-window-edge': withClassifier((signals, settings) => classify(signals, { ...settings, windowTicks: settings.windowTicks + 1 })),
  'label-as-feature': { classify, evaluate(cases, settings) {
    return evaluate(cases.map((item) => ({ ...item, signals: item.label
      ? Array.from({ length: settings.threshold }, () => ({ tick: 1, reason: 'range', distanceSquared: Number.MAX_VALUE })) : [] })), settings);
  } },
  'divide-every-rate-by-total': { classify, evaluate(cases, settings) {
    const result = evaluate(cases, settings);
    const { total, tp, fp } = result.metrics;
    return { ...result, metrics: { ...result.metrics, precision: total ? tp / total : null,
      recall: total ? tp / total : null, falsePositiveRate: total ? fp / total : null } };
  } },
  'undefined-rate-is-zero': { classify, evaluate(cases, settings) {
    const result = evaluate(cases, settings);
    for (const name of ['precision', 'recall', 'falsePositiveRate']) result.metrics[name] ??= 0;
    return result;
  } },
  'only-check-final-window': withClassifier((signals, settings) => {
    const latest = signals.at(-1)?.tick ?? 0;
    return classify(signals.filter((signal) => signal.tick > latest - settings.windowTicks), settings);
  }),
  'ignore-window-expiry': withClassifier((signals, settings) => classify(signals, { ...settings, windowTicks: Number.MAX_SAFE_INTEGER })),
  'distance-edge-inclusive': withClassifier((signals, settings) => classify(signals.map((signal) => ({
    ...signal, distanceSquared: signal.distanceSquared === settings.minDistanceMm ** 2 ? signal.distanceSquared + 1 : signal.distanceSquared,
  })), settings)),
  'one-observation-per-tick': withClassifier((signals, settings) => classify(signals.filter((signal, index) => index === 0 || signal.tick !== signals[index - 1].tick), settings)),
  'reverse-case-order': { classify, evaluate(cases, settings) {
    const result = evaluate(cases, settings);
    return { ...result, decisions: [...result.decisions].reverse() };
  } },
};
