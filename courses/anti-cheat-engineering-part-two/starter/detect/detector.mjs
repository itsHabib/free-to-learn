// Unit 14: score sessions, choose a threshold, and count what a frozen detector does.
import { features as sessionFeatures } from './features.mjs';

// score(features, settings): a number for one session; higher means more suspicious. The
// rule is yours. It may use only the features and your settings (detect/settings.json),
// and must give the same number for the same inputs.
export function score(features, settings) {
  throw new Error('score: not written yet');
}

// chooseThreshold(legalScores, budget): the smallest t among the scores such that
// count(score >= t) / n <= budget, or Infinity when no score qualifies.
export function chooseThreshold(legalScores, budget) {
  throw new Error('chooseThreshold: not written yet');
}

// count(decisions): decisions is one { label, flagged } per session, label 'cheat' (a
// positive) or 'legal' (a negative). Returns { total, tp, fp, tn, fn, recall,
// falsePositiveRate, precision }; a rate whose denominator is 0 is null.
export function count(decisions) {
  throw new Error('count: not written yet');
}

// evaluate(cases, settings): one decision per case, flagged when its score is >=
// settings.threshold, counted with count().
export function evaluate(cases, settings) {
  throw new Error('evaluate: not written yet');
}

// precisionAt(baseRate, recall, fpr): the precision when a fraction baseRate of sessions
// are cheats: b * r / (b * r + (1 - b) * f), or null when that denominator is 0.
export function precisionAt(baseRate, recall, fpr) {
  throw new Error('precisionAt: not written yet');
}
