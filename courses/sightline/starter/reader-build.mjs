// Module 6: read the game's state through what the code says about it, check
// the reading against the screen, and aim when the exact wind is not on the client.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 06 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import * as S from './scan.mjs';
import { parseStatus } from './scan.mjs';
import { search } from './learn.mjs';
import { parts, placeKey, evaluate, make } from './lift.mjs';
import { decoding, decoder } from './flight.mjs';

const isConst = (e) => e?.op === 'const';
// The flag: the value the frame function subtracts from the landing before it
// compares the distance with a constant (the hit radius). Returns
// { value, radius, raws }: raws are loads of the places the flag may be stored at.
// Undo the decoding to reach the stored word; where the word was just written by
// this frame (a flag that moves), the place is the store's.
// region: hit-test
function hitTest(cond, land) {
  throw new Error('not written yet: hitTest in reader.mjs');
}
// endregion: hit-test
// region: stored-word
function storedWord(value, key) {
  throw new Error('not written yet: storedWord in reader.mjs');
}
// endregion: stored-word
// region: places-of
function placesOf(word, tickFn) {
  throw new Error('not written yet: placesOf in reader.mjs');
}
// endregion: places-of
// region: flag-of
export function flagOf(tickFn, flight, key) {
  throw new Error('not written yet: flagOf in reader.mjs');
}
// endregion: flag-of
// What a reader is made of, from the hypotheses the engine has confirmed:
// expressions for angle, power, wind and flag. wind is null where the code takes it
// from the server. Evaluated against the game's memory, they give the state.
// region: reader-from
export function readerFrom(aim, flight, flagRaw) {
  throw new Error('not written yet: readerFrom in reader.mjs');
}
// endregion: reader-from
// The state now: { angle, power, wind, wind_arrows, target_x }. wind is null when
// the code takes it from the server; wind_arrows then comes from the status line.
// region: read-state
function memoryLoad(bytes) {
  throw new Error('not written yet: memoryLoad in reader.mjs');
}

export function readState(host, reader, lineAddr) {
  throw new Error('not written yet: readState in reader.mjs');
}
// endregion: read-state
// A reader is right when it agrees with the screen, round after round. look() reads
// the state; it may throw. Each round costs a new round of the game.
// region: compare-round
function compareRound(state, shown, line, seen) {
  throw new Error('not written yet: compareRound in reader.mjs');
}
// endregion: compare-round
// region: check-reader
export function checkReader(host, look, opts) {
  throw new Error('not written yet: checkReader in reader.mjs');
}
// endregion: check-reader
// The wind an arrow count can stand for: each arrow is 1.5 units, the count is
// rounded, and the wind itself stays between -5 and 5.
// region: wind-band
export function windBand(arrows) {
  throw new Error('not written yet: windBand in reader.mjs');
}
// endregion: wind-band
// Aim when only the arrow count is known. predict(angle, power, wind) gives
// { x, frames }. Plan for the middle of the band the arrows stand for, and take the
// first setting, lowest angle first, that lands within 2 paces of the flag: the
// shortest flights give the unknown part of the wind the least time to push.
// region: aim-band
export function aimBand(state, predict) {
  throw new Error('not written yet: aimBand in reader.mjs');
}
// endregion: aim-band
