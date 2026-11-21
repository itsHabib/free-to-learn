// Unit 14, write route: detect/detector.mjs with the walked-through regions left to fill.
// Lesson 14 shows each region's code and says why it is there. Replace everything between
// a "// region: NAME" line and its "// endregion: NAME" line with that listing, in the
// lesson's order: robust-z, score, choose-threshold, count, evaluate, then precision-at.
// Keep the marker lines. The score the lesson shows uses one feature; the score you hand
// in is your own design (lesson 14, "Your score"), and you may replace that region freely.
import { features as sessionFeatures } from './features.mjs';

// region: robust-z
function robustZ(value, settings) {
  throw new Error('robustZ: not written yet');
}
// endregion: robust-z

// region: score
export function score(features, settings) {
  throw new Error('score: not written yet');
}
// endregion: score

// region: choose-threshold
export function chooseThreshold(legalScores, budget) {
  throw new Error('chooseThreshold: not written yet');
}
// endregion: choose-threshold

// region: count
export function count(decisions) {
  throw new Error('count: not written yet');
}
// endregion: count

// region: evaluate
export function evaluate(cases, settings) {
  throw new Error('evaluate: not written yet');
}
// endregion: evaluate

// region: precision-at
export function precisionAt(baseRate, recall, fpr) {
  throw new Error('precisionAt: not written yet');
}
// endregion: precision-at
