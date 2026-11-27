// Module 5: what the code says about a shot. The key handler steps the angle and
// the power and launches the shell; the frame function moves it and lands it.
// Each finding is a hypothesis the engine tests before it relies on it.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lessons 05 and 06 fill the regions below. A listing replaces everything
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
  for (const { cond, holds } of guard) {
    if (cond.op !== 'i32.ne' && cond.op !== 'i32.eq') continue;
    const [a, b] = cond.args;
    let k = null; // the constant the parameter is compared with
    if (a === P0 && isConst(b)) k = b.value;
    else if (b === P0 && isConst(a)) k = a.value;
    if (k === null) continue;
    // param0 == k holds, or param0 != k does not.
    const ne = cond.op === 'i32.ne';
    if ((ne && !holds) || (!ne && holds)) return k;
  }
  return null;
}
// endregion: code-of
// Stores in the key handler that put back a value plus or minus 1, kept within a
// bound. Each is { code, delta, value, bound, store }: value is the number as the
// game sees it (decoded, if it is stored scrambled), taken from the bound test.
// region: steppers
// The last comparison of a value with a constant in a guard:
// { value, bound }, or null.
function bounded(guard) {
  for (let i = guard.length - 1; i >= 0; i--) {
    let c = guard[i].cond;
    if (c.op === 'i32.eqz') c = c.args[0];
    if (!/\.(lt|gt|le|ge)(_s|_u)?$/.test(c.op)) continue;
    const [a, b] = c.args;
    if (isConst(b) && !isConst(a)) return { value: a, bound: b.value };
    if (isConst(a) && !isConst(b)) return { value: b, bound: a.value };
  }
  return null;
}

// An add of a constant 1 or -1, the step inside a stepper's value.
const isStep = (e) =>
  (e.op === 'i32.add' || e.op === 'f32.add') &&
  e.args.some((x) => isConst(x) && Math.abs(x.value) === 1);

export function steppers(keyFn) {
  const out = [];
  for (const st of keyFn.stores) {
    if (st.inLoop) continue;
    const code = codeOf(st.guard);
    const b = bounded(st.guard);
    if (code === null || !b) continue;
    const step = [...parts(st.value)].find(isStep);
    if (!step) continue;
    const delta = step.args.find(isConst).value;
    const { value, bound } = b;
    out.push({ code, delta, value, bound, store: st });
  }
  return out;
}
// endregion: steppers
// How a value is stored: { raw, key, op, float }. raw and key are loads; op is
// 'plain', 'xor' or 'add' (the stored word is the value plus the key). rawKey is
// the place the stepper writes, which tells raw from key in an XOR.
// region: decoding
export function decoding(value, rawKey) {
  let e = value;
  let float = false;
  if (e.op === 'f32.reinterpret_i32') {
    e = e.args[0];
    float = true;
  }
  const word = (x) => x.op === 'load' && x.type === 'i32.load';
  if (word(e)) return { raw: e, key: null, op: 'plain', float };
  const loads = e.args?.every(word) ? e.args : null;
  if (!loads) return null;
  if (e.op === 'i32.xor') {
    // The stepper writes the raw word; the other is the key.
    const isRaw = (x) => placeKey(x.addr, x.offset) === rawKey;
    const raw = loads.find(isRaw) ?? loads[1];
    return { raw, key: loads.find((x) => x !== raw), op: 'xor', float };
  }
  if (e.op === 'i32.sub') {
    return { raw: loads[0], key: loads[1], op: 'add', float };
  }
  return null;
}
// endregion: decoding
// The expression that decodes the word at raw's place the same way.
// region: decoder
export function decoder(d, raw) {
  const { addr, offset } = raw;
  const load = make({ op: 'load', type: 'i32.load', addr, offset });
  let e = load;
  if (d.op === 'xor') e = make({ op: 'i32.xor', args: [d.key, load] });
  if (d.op === 'add') e = make({ op: 'i32.sub', args: [load, d.key] });
  return d.float ? make({ op: 'f32.reinterpret_i32', args: [e] }) : e;
}
// endregion: decoder
// The launch: every store the key handler makes for the key whose stores use sin
// or cos. fields are the places those trigonometric stores write (the shell's
// position and speed); flying is the place set to 1 with them.
// region: launch-of
const isTrig = (x) => x.op === 'call' && /\.(sin|cos)$/.test(x.name);
const usesTrig = (e) => [...parts(e)].some(isTrig);

export function launchOf(keyFn) {
  const live = keyFn.stores.filter((st) => !st.inLoop);
  const trig = live.filter((st) => usesTrig(st.value));
  if (!trig.length) return null;
  // Every store made for the same key as the first one that uses trig.
  const code = codeOf(trig[0].guard);
  const stores = live.filter((st) => codeOf(st.guard) === code);
  const one = (e) => isConst(e) && e.value === 1;
  const isOne = (st) => st.type === 'i32.store' && one(st.value);
  const flag = stores.find(isOne);
  return {
    code,
    stores,
    trig,
    fields: trig.map((st) => placeKey(st.addr, st.offset)),
    flying: flag ? placeKey(flag.addr, flag.offset) : null,
    flyingStore: flag ?? null,
  };
}
// endregion: launch-of
// The angle is the stepped value inside the launch's sin and cos; the power is the
// other stepped value the launch uses.
// region: aim-values
export function aimValues(keyFn, launch) {
  const s = steppers(keyFn);
  // Everything inside the launch's calls to sin and cos.
  const inTrig = new Set();
  for (const st of launch.trig) {
    for (const e of parts(st.value)) {
      if (isTrig(e)) for (const x of parts(e)) inTrig.add(x);
    }
  }
  const angle = s.find((x) => inTrig.has(x.value));
  const all = launch.trig.flatMap((st) => [...parts(st.value)]);
  const used = new Set(all);
  const other = (x) => x.value !== angle?.value && used.has(x.value);
  const power = s.find(other);
  if (!angle || !power) return null;
  // Every key that steps the same value, with its step.
  const codes = (v) =>
    s.filter((x) => x.value === v.value).map((x) => [x.code, x.delta]);
  const aim = (x) => {
    return { value: x.value, raw: x.store, codes: codes(x) };
  };
  return { angle: aim(angle), power: aim(power) };
}
// endregion: aim-values
// The flight: the frame function's stores that decide the shell's fields and the
// flying flag, and the landing store, an f32 store made with the flag's reset.
// region: flight-of
export function flightOf(tickFn, launch) {
  const targets = [...launch.fields, launch.flying];
  const stores = slice(tickFn.stores, targets);
  const live = tickFn.stores.filter((st) => !st.inLoop);
  const key = (st) => placeKey(st.addr, st.offset);
  const isZero = (st) => isConst(st.value) && st.value.value === 0;
  const isReset = (st) => key(st) === launch.flying && isZero(st);
  const reset = live.find(isReset);
  if (!reset) return null;
  const sameList = (a, b) => a.every((x, i) => x === b[i]);
  const same = (a, b) => a.length === b.length && sameList(a, b);
  // The landing: an f32 store made with the reset, through the same
  // pointer, to a place the launch doesn't write.
  const landing = live.find(
    (st) =>
      st.type === 'f32.store' &&
      same(st.guard, reset.guard) &&
      !launch.fields.includes(key(st)) &&
      st.addr === reset.addr,
  );
  if (!landing) return null;
  const wind = windOf(launch, stores, landing);
  return {
    stores: [...stores, landing],
    landing,
    landingKey: key(landing),
    wind,
  };
}
// endregion: flight-of

// region: wind-of
// The wind: the factor, other than constants and the shell's own
// fields, that the shell's sideways speed gains each frame, or null.
function windOf(launch, stores, landing) {
  const key = (st) => placeKey(st.addr, st.offset);
  const has = (st, test) => [...parts(st.value)].some(test);
  const isCos = (e) => e.op === 'call' && /\.cos$/.test(e.name);
  const isConvert = (e) =>
    e.op === 'f32.convert_i32_s' || e.op === 'f32.convert_i32_u';
  // vx: the launch's float store of cos times a converted integer.
  const isVx = (st) =>
    st.type === 'f32.store' && has(st, isCos) && has(st, isConvert);
  const vx = launch.trig.find(isVx);
  const vxKey = vx ? key(vx) : null;
  const isStep = (st) => key(st) === vxKey && st !== landing;
  const vxStep = stores.find(isStep);
  if (!vxStep) return null;
  const ownField = (l) => launch.fields.includes(l.key);
  const outside = (e) => !isConst(e) && !loadsIn(e).some(ownField);
  let wind = null;
  for (const e of parts(vxStep.value)) {
    if (e.op !== 'f32.mul' || !e.args.some(isConst)) continue;
    const other = e.args.find((x) => !isConst(x));
    if (other && outside(other)) {
      wind = other;
      break;
    }
  }
  // Constant factors around the wind are not part of it.
  while (wind?.op === 'f32.mul' && wind.args.some(isConst)) {
    wind = wind.args.find((x) => !isConst(x));
  }
  return wind;
}
// endregion: wind-of
// Where a place is now: follow the pointers its address goes through. m is memory
// from overlay().
// region: resolve
// The calls the flight makes, answered: sin and cos, and the server's
// wind when one is given.
const trigCall = (wind) => (name, args) => {
  if (name.endsWith('.sin')) return Math.sin(args[0]);
  if (name.endsWith('.cos')) return Math.cos(args[0]);
  if (name.endsWith('server_wind')) {
    return wind === null ? null : Math.fround(wind);
  }
  return null;
};

export function resolve(m, addr) {
  if (addr.op === 'const') return addr.value;
  if (addr.op === 'load' && addr.type === 'i32.load') {
    const b = resolve(m, addr.addr); // the pointer's own address first
    return b === null ? null : m.load('i32.load', b + addr.offset);
  }
  return null;
}
// endregion: resolve
// The word the game would store for `value`, decoded the way d says.
// region: encode
const scratch = new DataView(new ArrayBuffer(4));

export function encode(m, d, value) {
  scratch.setFloat32(0, value, true);
  const word = d.float ? scratch.getInt32(0, true) : value | 0;
  if (d.op === 'plain') return word;
  const keyAt = resolve(m, d.key.addr);
  if (keyAt === null) return null;
  const key = m.load('i32.load', keyAt + d.key.offset);
  if (key === null) return null;
  return d.op === 'xor' ? word ^ key : (word + key) | 0;
}
// endregion: encode
// A simulator built from the launch and the flight: on a copy of the game's
// memory, set the barrel to the given angle and power (stored the way the game
// stores them), launch, and run the flight with the given wind until the flying
// flag is reset. With no wind given, the flight uses the wind in memory.
// Returns { x, frames } or null.
// region: simulator
export function simulator(launch, aim, flight) {
  const how = ({ value, raw }) =>
    decoding(value, placeKey(raw.addr, raw.offset));
  const dAngle = how(aim.angle);
  const dPower = how(aim.power);
  return function simulate(bytes, { angle, power, wind }) {
    const m = overlay(bytes);
    // Set the barrel the way the game stores the angle and the power.
    for (const [d, v] of [
      [dAngle, angle],
      [dPower, power],
    ]) {
      const at = resolve(m, d.raw.addr);
      const word = encode(m, d, v);
      if (at === null || word === null) return null;
      m.store('i32.store', at + d.raw.offset, word);
    }
    const call = trigCall(typeof wind === 'number' ? wind : null);
    // Launch, as the key handler does for the fire key.
    const key = new Map([[P0, launch.code]]);
    apply(launch.stores, m, { call, given: key });
    const given = new Map();
    if (typeof wind === 'number' && flight.wind) {
      given.set(flight.wind, Math.fround(wind));
    }
    const flag = launch.flyingStore;
    const land = flight.landing;
    const flagAt = resolve(m, flag.addr);
    const landAt = resolve(m, land.addr);
    if (flagAt === null || landAt === null) return null;
    // One frame at a time until the flying flag is reset.
    for (let frames = 1; frames <= 2000; frames++) {
      apply(flight.stores, m, { call, given });
      if (m.load('i32.load', flagAt + flag.offset) === 0) {
        const x = m.load('f32.load', landAt + land.offset);
        return Number.isFinite(x) ? { x, frames } : null;
      }
    }
    return null;
  };
}
// endregion: simulator
// The stored word the wind is decoded from, or null if the code never keeps one.
// region: wind-word
export function windWord(flight, d) {
  if (!flight.wind) return null;
  for (const e of parts(flight.wind)) {
    if (e.op !== 'f32.reinterpret_i32') continue;
    const inner = e.args[0];
    if (inner.op === 'load' && inner.type === 'i32.load') return inner;
    // A word decoded with the key: the side that isn't the key.
    const keyed = ['i32.xor', 'i32.sub'].includes(inner.op);
    if (keyed && d?.key && inner.args.includes(d.key)) {
      return inner.args.find((x) => x !== d.key);
    }
  }
  return null;
}
// endregion: wind-word
