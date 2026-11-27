/* eslint-disable no-unused-vars -- windWord is module 06's, a stub here */
// Module 5: what the code says about a shot. The key handler steps the angle and
// the power and launches the shell; the frame function moves it and lands it.
// Each finding is a hypothesis the engine tests before it relies on it.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 05 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import {
  parts,
  loadsIn,
  placeKey,
  slice,
  overlay,
  apply,
  make,
} from './lift.mjs';

const isConst = (e) => e?.op === 'const';
const P0 = make({ op: 'param', index: 0 });
// The key code a guard requires of the handler's parameter, or null.
// region: code-of
export function codeOf(guard) {
  throw new Error('not written yet: codeOf in flight.mjs');
}
// endregion: code-of
// Stores in the key handler that put back a value plus or minus 1, kept within a
// bound. Each is { code, delta, value, bound, store }: value is the number as the
// game sees it (decoded, if it is stored scrambled), taken from the bound test.
// region: steppers
function bounded(guard) {
  throw new Error('not written yet: bounded in flight.mjs');
}

export function steppers(keyFn) {
  throw new Error('not written yet: steppers in flight.mjs');
}
// endregion: steppers
// How a value is stored: { raw, key, op, float }. raw and key are loads; op is
// 'plain', 'xor' or 'add' (the stored word is the value plus the key). rawKey is
// the place the stepper writes, which tells raw from key in an XOR.
// region: decoding
export function decoding(value, rawKey) {
  throw new Error('not written yet: decoding in flight.mjs');
}
// endregion: decoding
// The expression that decodes the word at raw's place the same way.
// region: decoder
export function decoder(d, raw) {
  throw new Error('not written yet: decoder in flight.mjs');
}
// endregion: decoder
// The launch: every store the key handler makes for the key whose stores use sin
// or cos. fields are the places those trigonometric stores write (the shell's
// position and speed); flying is the place set to 1 with them.
// region: launch-of
export function launchOf(keyFn) {
  throw new Error('not written yet: launchOf in flight.mjs');
}
// endregion: launch-of
// The angle is the stepped value inside the launch's sin and cos; the power is the
// other stepped value the launch uses.
// region: aim-values
export function aimValues(keyFn, launch) {
  throw new Error('not written yet: aimValues in flight.mjs');
}
// endregion: aim-values
// The flight: the frame function's stores that decide the shell's fields and the
// flying flag, and the landing store, an f32 store made with the flag's reset.
// region: flight-of
export function flightOf(tickFn, launch) {
  throw new Error('not written yet: flightOf in flight.mjs');
}
// endregion: flight-of

// region: wind-of
function windOf(launch, stores, landing) {
  throw new Error('not written yet: windOf in flight.mjs');
}
// endregion: wind-of
// Where a place is now: follow the pointers its address goes through. m is memory
// from overlay().
// region: resolve
export function resolve(m, addr) {
  throw new Error('not written yet: resolve in flight.mjs');
}
// endregion: resolve
// The word the game would store for `value`, decoded the way d says.
// region: encode
export function encode(m, d, value) {
  throw new Error('not written yet: encode in flight.mjs');
}
// endregion: encode
// A simulator built from the launch and the flight: on a copy of the game's
// memory, set the barrel to the given angle and power (stored the way the game
// stores them), launch, and run the flight with the given wind until the flying
// flag is reset. With no wind given, the flight uses the wind in memory.
// Returns { x, frames } or null.
// region: simulator
export function simulator(launch, aim, flight) {
  throw new Error('not written yet: simulator in flight.mjs');
}
// endregion: simulator
// The stored word the wind is decoded from, or null if the code never keeps one.
export function windWord(flight, d) {
  throw new Error('not written yet: windWord in flight.mjs');
}
