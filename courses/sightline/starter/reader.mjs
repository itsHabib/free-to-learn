// Module 6: read the game's state through what the code says about it, check
// the reading against the screen, and aim when the exact wind is not on the client.
// Every function throws "not written yet" until you write it. API.md has the details.
import * as S from './scan.mjs';
import { parseStatus } from './scan.mjs';
import { search } from './learn.mjs';
import { parts, loadsIn, placeKey, evaluate, make, place } from './lift.mjs';
import { decoding, decoder } from './flight.mjs';
// The flag: the value the frame function subtracts from the landing before it
// compares the distance with a constant (the hit radius). Returns
// { value, radius, raws }: raws are loads of the places the flag may be stored at.
// Undo the decoding to reach the stored word; where the word was just written by
// this frame (a flag that moves), the place is the store's.
export function flagOf(tickFn, flight, key) {
  throw new Error('not written yet: flagOf in reader.mjs');
}
// What a reader is made of, from the hypotheses the engine has confirmed:
// expressions for angle, power, wind and flag. wind is null where the code takes it
// from the server. Evaluated against the game's memory, they give the state.
export function readerFrom(aim, flight, flagRaw) {
  throw new Error('not written yet: readerFrom in reader.mjs');
}
// The state now: { angle, power, wind, wind_arrows, target_x }. wind is null when
// the code takes it from the server; wind_arrows then comes from the status line.
export function readState(host, reader, lineAddr) {
  throw new Error('not written yet: readState in reader.mjs');
}
// A reader is right when it agrees with the screen, round after round. look() reads
// the state; it may throw. Each round costs a new round of the game.
export function checkReader(host, look, { lineAddr, rounds = 3, newRound = 'KeyN' }) {
  throw new Error('not written yet: checkReader in reader.mjs');
}
// Aim when only the arrow count is known. predict(angle, power, wind) gives
// { x, frames }. Plan for the middle of the band the arrows stand for, and take the
// first setting, lowest angle first, that lands within 2 paces of the flag: the
// shortest flights give the unknown part of the wind the least time to push.
export function aimBand(state, predict) {
  throw new Error('not written yet: aimBand in reader.mjs');
}
// The wind an arrow count can stand for: each arrow is 1.5 units, the count is
// rounded, and the wind itself stays between -5 and 5.
export function windBand(arrows) {
  throw new Error('not written yet: windBand in reader.mjs');
}
