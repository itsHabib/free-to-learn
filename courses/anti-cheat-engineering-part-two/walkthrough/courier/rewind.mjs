// Unit 15, write route: courier/rewind.mjs with the walked-through regions left to fill.
// Lesson 15 shows each region's code and says why it is there. Replace everything between
// a "// region: NAME" line and its "// endregion: NAME" line with that listing, in the
// lesson's order: position-at, measure-rtt, judge-interact, tally, then pick-window. Keep
// the marker lines. API.md, unit 15, has the exact rules. The two numbers below are
// public/courier.mjs's TICK_MS and RTT_SAMPLES.

const TICK_MS = 50;
const RTT_SAMPLES = 20;

// region: position-at
export function positionAt(history, tick) {
  throw new Error('positionAt: not written yet');
}
// endregion: position-at

// region: measure-rtt
export function measureRtt(samples) {
  throw new Error('measureRtt: not written yet');
}
// endregion: measure-rtt

// region: judge-interact
export function judgeInteract(args) {
  throw new Error('judgeInteract: not written yet');
}
// endregion: judge-interact

// region: tally
export function tally(outcomes) {
  throw new Error('tally: not written yet');
}
// endregion: tally

// region: pick-window
export function pickWindow(rows, budget) {
  throw new Error('pickWindow: not written yet');
}
// endregion: pick-window
