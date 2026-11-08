/** Flag a case when any open-left, closed-right window has enough eligible denials. */
export function classify(signals, settings) {
  const minimumSquared = settings.minDistanceMm ** 2;
  const ticks = [];
  let first = 0;
  for (const signal of signals) {
    if (signal.reason !== 'range' || signal.distanceSquared <= minimumSquared) continue;
    ticks.push(signal.tick);
    while (ticks[first] <= signal.tick - settings.windowTicks) first += 1;
    if (ticks.length - first >= settings.threshold) return true;
  }
  return false;
}

/** Each case gets one prediction. Labels are consulted only to score predictions. */
export function evaluate(cases, settings) {
  const decisions = cases.map(({ id, signals }) => ({ id, flagged: classify(signals, settings) }));
  const metrics = { total: cases.length, tp: 0, fp: 0, tn: 0, fn: 0 };
  for (let index = 0; index < cases.length; index += 1) {
    const { label } = cases[index];
    const { flagged } = decisions[index];
    if (flagged) {
      metrics[label ? 'tp' : 'fp'] += 1;
      continue;
    }
    metrics[label ? 'fn' : 'tn'] += 1;
  }
  const rate = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;
  return { decisions, metrics: {
    ...metrics,
    precision: rate(metrics.tp, metrics.tp + metrics.fp),
    recall: rate(metrics.tp, metrics.tp + metrics.fn),
    falsePositiveRate: rate(metrics.fp, metrics.fp + metrics.tn),
  } };
}
