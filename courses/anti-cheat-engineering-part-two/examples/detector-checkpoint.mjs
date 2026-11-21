// Unit 14, end-of-unit checkpoint: detect/detector.mjs, as lesson 14 walks through it.
// Its score is the lesson's worked example and uses one feature, hitRate. It shows the
// shape of a score; it is not a detector to hand in. Which features your score uses, and
// how it combines them, is your own design (lesson 14, "Your score").
import { features as sessionFeatures } from './features-checkpoint.mjs';

// region: robust-z
function robustZ(value, { transform, direction, median, scale, cap }) {
  if (value === null || value === undefined) return 0;
  const x = transform === 'log' ? Math.log1p(value) : value;
  const z = (direction * (x - median)) / scale;
  return Math.min(cap, Math.max(-cap, z));
}
// endregion: robust-z

// region: score
export function score(features, settings) {
  return robustZ(features.hitRate, settings.features.hitRate);
}
// endregion: score

// region: choose-threshold
export function chooseThreshold(legalScores, budget) {
  const sorted = [...legalScores].sort((a, b) => a - b);
  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    if (i > 0 && sorted[i] === sorted[i - 1]) continue;
    if ((n - i) / n <= budget) return sorted[i];
  }
  return Infinity;
}
// endregion: choose-threshold

// region: count
export function count(decisions) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const { label, flagged } of decisions) {
    if (label === 'cheat') {
      if (flagged) tp++;
      else fn++;
    } else if (flagged) fp++;
    else tn++;
  }
  return {
    total: decisions.length,
    tp,
    fp,
    tn,
    fn,
    recall: tp + fn ? tp / (tp + fn) : null,
    falsePositiveRate: fp + tn ? fp / (fp + tn) : null,
    precision: tp + fp ? tp / (tp + fp) : null,
  };
}
// endregion: count

// region: evaluate
export function evaluate(cases, settings) {
  return count(
    cases.map((c) => ({
      label: c.label,
      flagged: score(sessionFeatures(c), settings) >= settings.threshold,
    })),
  );
}
// endregion: evaluate

// region: precision-at
export function precisionAt(baseRate, recall, fpr) {
  const denominator = baseRate * recall + (1 - baseRate) * fpr;
  return denominator === 0 ? null : (baseRate * recall) / denominator;
}
// endregion: precision-at
