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
// The hit test inside one condition: an f32.le or f32.lt against a
// constant whose left side subtracts something from the landing.
function hitTest(cond, land) {
  for (const e of parts(cond)) {
    if (!/^f32\.(le|lt)$/.test(e.op) || !isConst(e.args[1])) continue;
    const isSub = (x) => x.op === 'f32.sub' && x.args[0] === land;
    const sub = [...parts(e.args[0])].find(isSub);
    if (sub) return { value: sub.args[1], radius: e.args[1].value };
  }
  return null;
}
// endregion: hit-test
// region: stored-word
// The stored word behind the flag's value: take off the reinterpret,
// then the key, XORed in or added.
function storedWord(value, key) {
  const asFloat = value.op === 'f32.reinterpret_i32';
  const word = asFloat ? value.args[0] : value;
  if (word.op === 'i32.xor' && word.args.includes(key)) {
    return word.args.find((x) => x !== key);
  }
  const minusKey = word.op === 'i32.sub' && word.args[1] === key;
  if (minusKey) return word.args[0];
  return word;
}
// endregion: stored-word
// region: places-of
// The places a word can come from, as loads, each once. A phi gives one
// per path. A value the frame function stored gives the store's place.
function placesOf(word, tickFn) {
  const raws = new Map();
  const add = (v) => {
    if (v.op === 'load' && v.type === 'i32.load') {
      raws.set(placeKey(v.addr, v.offset), v);
      return;
    }
    const atLoadOrConst = (x) => ['load', 'const'].includes(x.addr.op);
    const writes = (x) => x.value === v && atLoadOrConst(x);
    const w = tickFn.stores.find((x) => !x.inLoop && writes(x));
    if (!w) return;
    const { addr, offset } = w;
    const load = make({ op: 'load', type: 'i32.load', addr, offset });
    raws.set(placeKey(addr, offset), load);
  };
  if (word.op === 'phi') word.paths.forEach((p) => add(p.value));
  else add(word);
  return [...raws.values()];
}
// endregion: places-of
// region: flag-of
export function flagOf(tickFn, flight, key) {
  const land = flight.landing.value;
  for (const st of tickFn.stores) {
    for (const g of st.guard) {
      const hit = hitTest(g.cond, land);
      if (!hit) continue;
      const word = storedWord(hit.value, key);
      const raws = placesOf(word, tickFn);
      return { value: hit.value, radius: hit.radius, raws };
    }
  }
  return null;
}
// endregion: flag-of
// What a reader is made of, from the hypotheses the engine has confirmed:
// expressions for angle, power, wind and flag. wind is null where the code takes it
// from the server. Evaluated against the game's memory, they give the state.
// region: reader-from
export function readerFrom(aim, flight, flagRaw) {
  const { raw } = aim.angle;
  const d = decoding(aim.angle.value, placeKey(raw.addr, raw.offset));
  // The flag is a float, whatever the angle's decoding says.
  const flag = decoder({ ...d, float: true }, flagRaw);
  const { angle, power } = aim;
  const wind = flight.wind;
  return { angle: angle.value, power: power.value, wind, flag };
}
// endregion: reader-from
// The state now: { angle, power, wind, wind_arrows, target_x }. wind is null when
// the code takes it from the server; wind_arrows then comes from the status line.
// region: read-state
// Reads of the game's memory as evaluate asks for them; null outside.
function memoryLoad(bytes) {
  const { buffer, byteOffset, byteLength } = bytes;
  const view = new DataView(buffer, byteOffset, byteLength);
  return (type, a) => {
    if (a < 0 || a + 4 > bytes.byteLength) return null;
    if (type === 'i32.load') return view.getInt32(a, true);
    if (type === 'f32.load') return view.getFloat32(a, true);
    if (type === 'i32.load8_u') return bytes[a];
    return null;
  };
}

export function readState(host, reader, lineAddr) {
  const bytes = host.memory();
  // No server to ask: every import's call is unknown.
  const call = () => null;
  const env = { load: memoryLoad(bytes), call, memo: new Map() };
  const value = (e) => (e ? evaluate(e, env) : null);
  const wind = value(reader.wind);
  const noLine = lineAddr === null || lineAddr === undefined;
  const line = noLine ? '' : S.readCString(bytes, lineAddr);
  return {
    angle: value(reader.angle),
    power: value(reader.power),
    wind,
    wind_arrows: wind === null ? parseStatus(line).wind_arrows : null,
    target_x: value(reader.flag),
  };
}
// endregion: read-state
// A reader is right when it agrees with the screen, round after round. look() reads
// the state; it may throw. Each round costs a new round of the game.
// region: compare-round
// What one round's state gets wrong against the status line and the
// flag's cloth on the screen, each as a sentence.
function compareRound(state, shown, line, seen) {
  const issues = [];
  const shows = 'but the screen shows';
  if (shown.angle === null || shown.power === null) {
    const none = 'shows no angle and power to compare with';
    issues.push(`the status line "${line}" ${none}`);
  } else {
    const a = `angle ${state.angle} ${shows} ${shown.angle}`;
    const p = `power ${state.power} ${shows} ${shown.power}`;
    if (!(Math.abs(state.angle - shown.angle) <= 0.5)) issues.push(a);
    if (Math.round(state.power) !== shown.power) issues.push(p);
  }
  const w = `wind ${state.wind} ${shows}`;
  const isNumber = typeof state.wind === 'number';
  const near = isNumber && Math.abs(state.wind - shown.wind) <= 0.051;
  if (shown.wind !== null && !near) issues.push(`${w} ${shown.wind}`);
  const madeUp = state.wind !== null && state.wind !== undefined;
  if (shown.wind_arrows !== null && madeUp) {
    const why = 'the exact wind is not on the client';
    issues.push(`${w} only arrows: ${why}`);
  }
  if (seen && !(Math.abs(state.target_x - seen.x) <= 12)) {
    const at = Number(state.target_x).toFixed(1);
    const cloth = seen.x.toFixed(0);
    issues.push(`the flag at ${at} ${shows} it near ${cloth}`);
  }
  return issues;
}
// endregion: compare-round
// region: check-reader
export function checkReader(host, look, opts) {
  const { lineAddr, rounds = 3, newRound = 'KeyN' } = opts;
  const rows = [];
  const problems = [];
  for (let r = 1; r <= rounds; r++) {
    host.press(newRound);
    host.tick(2); // time to draw the status line
    let state = null;
    try {
      state = look();
    } catch (error) {
      const why = String(error?.message ?? error);
      problems.push(`round ${r}: the reader failed: ${why}`);
    }
    if (!state || typeof state !== 'object') break;
    const line = S.readCString(host.memory(), lineAddr);
    const shown = parseStatus(line);
    const seen = S.findRed(host.screen());
    const issues = compareRound(state, shown, line, seen);
    const flagPixel = seen ? seen.x : null;
    rows.push({ round: r, state, shown, flagPixel, issues });
    problems.push(...issues.map((i) => `round ${r}: ${i}`));
  }
  const ok = problems.length === 0 && rows.length === rounds;
  return { ok, rows, problems };
}
// endregion: check-reader
// The wind an arrow count can stand for: each arrow is 1.5 units, the count is
// rounded, and the wind itself stays between -5 and 5.
// region: wind-band
export function windBand(arrows) {
  const lowest = Math.max(-5, 1.5 * (arrows - 0.5));
  const highest = Math.min(5, 1.5 * (arrows + 0.5));
  return [lowest, highest];
}
// endregion: wind-band
// Aim when only the arrow count is known. predict(angle, power, wind) gives
// { x, frames }. Plan for the middle of the band the arrows stand for, and take the
// first setting, lowest angle first, that lands within 2 paces of the flag: the
// shortest flights give the unknown part of the wind the least time to push.
// region: aim-band
export function aimBand(state, predict) {
  const [lo, hi] = windBand(state.wind_arrows ?? 0);
  const middle = (lo + hi) / 2;
  const at = () => state.target_x; // a flag that stands still
  const shot = (angle, power) => predict(angle, power, middle);
  return search(shot, at, { enough: 2, order: 'low' });
}
// endregion: aim-band
