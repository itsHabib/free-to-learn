// Lob, loaded in Node. makeLob gives one game: its WebAssembly instance, the host's
// wind server (in mode 9 the exact wind lives here, never in the game's memory), the
// values the official client draws, and the hidden values it does not draw.
// The server runs one of these per player; clients may run their own copy too
// (the official client ships the game file, so anyone can).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FLAG } from './rules.mjs';

// Kept from load time, so later changes to the global cannot change the game.
const WA = globalThis.WebAssembly;

export const LOB_SHA256 = '91b6c2f7fc15f18214628f2b2ddc068ca6347cd8d14115dfcdf9d0e75e03541a';

// Where each field of Lob's Game struct sits, in bytes from the address r_state()
// returns. Every field is 4 bytes. They come from the struct in Lob's source (which the
// course does not ship) and API.md lists them. `type` says how to read the 4 bytes.
// angle, power, wind and targetX are stored XORed with `key`; the key is 0 in mode 9.
export const GAME_FIELDS = {
  angle:     { at: 0,   type: 'f32', keyed: true }, // degrees, 5..85
  power:     { at: 4,   type: 'i32', keyed: true }, // 10..100
  wind:      { at: 8,   type: 'f32', keyed: true }, // 0 with server wind: the exact wind is the host's
  windLevel: { at: 12,  type: 'i32' },              // -3..3, the arrows
  targetX:   { at: 16,  type: 'f32', keyed: true }, // the flag's x
  cannonX:   { at: 20,  type: 'f32' },
  round:     { at: 24,  type: 'i32' },
  score:     { at: 28,  type: 'i32' },
  shots:     { at: 32,  type: 'i32' },
  flying:    { at: 36,  type: 'i32' },
  px:        { at: 40,  type: 'f32' },              // the shell
  py:        { at: 44,  type: 'f32' },
  vx:        { at: 48,  type: 'f32' },
  vy:        { at: 52,  type: 'f32' },
  impactX:   { at: 56,  type: 'f32' },
  impactAge: { at: 60,  type: 'i32' },              // frames since the landing, -1 when none this round
  result:    { at: 64,  type: 'i32' },              // 0 none, 1 hit, 2 short, 3 long
  missBy:    { at: 68,  type: 'i32' },
  frame:     { at: 72,  type: 'i32' },
  cloud:     { at: 76,  type: 'f32' },
  rng:       { at: 80,  type: 'u32' },              // the game's xorshift state: it picks every flag and speed
  mode:      { at: 84,  type: 'i32' },
  trailN:    { at: 88,  type: 'i32' },              // trail points recorded this shot; the ring keeps the last 64
  key:       { at: 92,  type: 'u32' },
  flagSpeed: { at: 96,  type: 'f32' },              // paces per second, -140..140
  flagTimer: { at: 100, type: 'i32' },              // frames until the flag picks a new speed
};
export const TRAIL_AT = 104;  // the trail ring: 64 (x, y) f32 pairs after the fields above
export const TRAIL_MAX = 64;

// The hidden things the course tests: values the game holds that the official client
// never draws (or draws only to the nearest pace).
export const HIDDEN = Object.freeze([
  'wind', 'flagSpeed', 'flagTimer', 'rng',
  'flagFraction', 'shellFraction', 'trailFraction', 'impactFraction', 'cloudFraction',
  'shellVelocity',
]);

const bytes = readFileSync(new URL('../game/lob.wasm', import.meta.url));
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== LOB_SHA256) {
  throw new Error(`game/lob.wasm is not the pinned Lob build (sha256 ${digest}, expected ${LOB_SHA256}). Restore the course's copy.`);
}
const lobModule = new WA.Module(bytes);

// The host's wind server, as Sightline's host runs it: a xorshift seeded from the game
// seed draws a new wind (-5..5) when the game starts a round and returns its arrow level;
// the game asks for the exact wind on every frame the shell flies.
function createWindServer(seed) {
  return { state: ((seed ^ 0x5bd1e995) >>> 0) || 1, wind: 0 };
}
function nextUnit(server) {
  let x = server.state;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  server.state = x;
  return x / 4294967296;
}

function instantiate(windServer) {
  const env = {
    sin: Math.sin,
    cos: Math.cos,
    server_wind: () => windServer.wind,
    server_round: () => {
      windServer.wind = -5 + nextUnit(windServer) * 10;
      return Math.max(-3, Math.min(3, Math.round(windServer.wind / 1.5)));
    },
  };
  return new WA.Instance(lobModule, { env }).exports;
}

// One game. `seed` picks every flag, speed and wind; `mode` is Lob's defence mode (9 here).
export function makeLob({ seed = 1, mode = 9 } = {}) {
  const windServer = createWindServer(seed);
  const exports = instantiate(windServer);
  exports.game_init(seed >>> 0, mode);
  return handle(exports, windServer);
}

function handle(x, windServer) {
  let data = new DataView(x.memory.buffer);
  const view = () => (data.buffer === x.memory.buffer ? data : (data = new DataView(x.memory.buffer)));

  function read(name) {
    const f = GAME_FIELDS[name];
    const addr = x.r_state() + f.at;
    let bits = view().getUint32(addr, true);
    if (f.keyed) bits = (bits ^ view().getUint32(x.r_state() + GAME_FIELDS.key.at, true)) >>> 0;
    if (f.type === 'u32') return bits;
    if (f.type === 'i32') return bits | 0;
    return f32OfBits(bits);
  }
  function write(name, value) {
    const f = GAME_FIELDS[name];
    const addr = x.r_state() + f.at;
    let bits;
    if (f.type === 'f32') bits = bitsOfF32(value);
    else bits = value >>> 0;
    if (f.keyed) bits = (bits ^ view().getUint32(x.r_state() + GAME_FIELDS.key.at, true)) >>> 0;
    view().setUint32(addr, bits, true);
  }
  function cstr(ptr) {
    const m = new Uint8Array(x.memory.buffer);
    let s = '';
    while (m[ptr] && s.length < 400) s += String.fromCharCode(m[ptr++]);
    return s;
  }
  function trail() {
    const n = x.r_trail_n(), head = x.r_trail_head(), ptr = x.r_trail_ptr();
    const points = [];
    for (let j = 0; j < n; j++) {
      const i = (head - n + j) % TRAIL_MAX;
      points.push([view().getFloat32(ptr + 8 * i, true), view().getFloat32(ptr + 8 * i + 4, true)]);
    }
    return points;
  }
  function setTrailPoint(j, xy) {
    const n = x.r_trail_n(), head = x.r_trail_head(), ptr = x.r_trail_ptr();
    const i = (head - n + j) % TRAIL_MAX;
    view().setFloat32(ptr + 8 * i, xy[0], true);
    view().setFloat32(ptr + 8 * i + 4, xy[1], true);
  }

  const game = {
    exports: x,
    memory: () => new Uint8Array(x.memory.buffer),
    key: (code) => x.game_key(code),
    tick(frames = 1) { for (let i = 0; i < frames; i++) x.game_tick(); },

    // What the official client draws (each to the nearest pace where it is a position).
    angle: () => x.r_angle(),
    power: () => x.r_power(),
    windLevel: () => x.r_wind_level(),
    round: () => read('round'),
    score: () => read('score'),
    shots: () => read('shots'),
    flying: () => x.r_flying() !== 0,
    targetX: () => x.r_target_x(),
    shell: () => (x.r_flying() ? { x: x.r_px(), y: x.r_py() } : null),
    trail,
    impact: () => { const age = x.r_impact_age(); return age < 0 ? null : { x: x.r_impact_x(), age }; },
    cloud: () => x.r_cloud(),
    line: () => cstr(x.r_line_ptr()),
    message: () => cstr(x.r_msg_ptr()),

    // What it never draws.
    serverWind: () => windServer.wind,
    flagSpeed: () => read('flagSpeed'),
    flagTimer: () => read('flagTimer'),
    rng: () => read('rng'),
    velocity: () => ({ vx: read('vx'), vy: read('vy') }),
    frame: () => read('frame'),

    // Any Game field by name (GAME_FIELDS), decoded; and a raw write, for a local copy.
    read,
    write,
    fields() {
      const out = {};
      for (const name of Object.keys(GAME_FIELDS)) out[name] = read(name);
      return out;
    },

    // An independent game in the identical state: the same memory and the same wind server.
    clone() {
      const copyServer = { ...windServer };
      const copy = handle(instantiate(copyServer), copyServer);
      new Uint8Array(copy.exports.memory.buffer).set(new Uint8Array(x.memory.buffer));
      return copy;
    },

    hidden: HIDDEN,
    // Change one hidden thing without changing anything drawn now. k (1..3) picks a
    // variant. Returns false, changing nothing, when the thing is absent.
    setHidden(name, k = 1) {
      const step = FRACTIONS[(k - 1) % FRACTIONS.length];
      switch (name) {
        case 'wind': {
          const [lo, hi] = windBand(x.r_wind_level());
          let w = lo + ((hi - lo) * k) / 4;
          if (w === windServer.wind) w += (hi - lo) / 8;
          windServer.wind = w;
          return true;
        }
        case 'flagSpeed': {
          let v = FLAG_SPEEDS[(k - 1) % FLAG_SPEEDS.length];
          if (Math.fround(v) === read('flagSpeed')) v = -v;
          write('flagSpeed', v);
          return true;
        }
        case 'flagTimer':
          write('flagTimer', ((read('flagTimer') - 1 + 97 * k) % 299 + 299) % 299 + 1);
          return true;
        case 'rng':
          write('rng', ((read('rng') ^ Math.imul(0x9e3779b9, k)) >>> 0) || 1);
          return true;
        case 'flagFraction':
          return moveInsidePixel(read, write, 'targetX', step, FLAG.min, FLAG.max);
        case 'shellFraction': {
          if (!x.r_flying()) return false;
          const movedX = moveInsidePixel(read, write, 'px', step);
          const movedY = moveInsidePixel(read, write, 'py', step);
          return movedX || movedY;
        }
        case 'trailFraction': {
          const points = trail();
          let changed = false;
          points.forEach((p, j) => {
            const moved = [insidePixel(p[0], step) ?? p[0], insidePixel(p[1], step) ?? p[1]];
            if (moved[0] !== p[0] || moved[1] !== p[1]) changed = true;
            setTrailPoint(j, moved);
          });
          return changed;
        }
        case 'impactFraction':
          if (x.r_impact_age() < 0) return false;
          return moveInsidePixel(read, write, 'impactX', step);
        case 'cloudFraction':
          return moveInsidePixel(read, write, 'cloud', step);
        case 'shellVelocity':
          if (!x.r_flying()) return false;
          write('vx', read('vx') + 7.5 * k);
          write('vy', read('vy') - 5 * k);
          return true;
        default:
          throw new Error(`setHidden: unknown hidden thing ${name}; the names are ${HIDDEN.join(', ')}`);
      }
    },
  };
  return game;
}

const FRACTIONS = [0.125, 0.25, 0.375];
const FLAG_SPEEDS = [-120.5, 33.25, 97.75];

// The exact winds that show the same arrows: the host's level is Math.round(wind / 1.5),
// limited to -3..3, and the wind itself is -5..5.
function windBand(level) {
  if (level >= 3) return [3.75, 5];
  if (level <= -3) return [-5, -3.75];
  return [1.5 * level - 0.75, 1.5 * level + 0.75];
}

// Another f32 that rounds to the same whole pace: the pixel plus (or minus) a fraction,
// kept inside [min, max]. Null when neither differs from the value.
function insidePixel(value, fraction, min = -Infinity, max = Infinity) {
  const pixel = Math.round(value);
  for (const moved of [pixel + fraction, pixel - fraction]) {
    if (moved >= min && moved <= max && Math.fround(moved) !== value) return moved;
  }
  return null;
}
function moveInsidePixel(read, write, name, fraction, min, max) {
  const moved = insidePixel(read(name), fraction, min, max);
  if (moved === null) return false;
  write(name, moved);
  return true;
}

const scratch = new DataView(new ArrayBuffer(4));
function f32OfBits(bits) { scratch.setUint32(0, bits, true); return scratch.getFloat32(0, true); }
function bitsOfF32(value) { scratch.setFloat32(0, value, true); return scratch.getUint32(0, true); }

// A private game used as a firing range. fly(angle, power, wind) fires one shell from the
// cannon with that exact wind and returns where it lands and how many frames it flew.
// A landing depends only on angle, power and wind: nothing else in the game touches the
// shell. (The range runs mode 1, server wind without the moving flag, so the physics is
// mode 9's and nothing else moves.)
export function createFlightLab() {
  const windServer = createWindServer(1);
  const x = instantiate(windServer);
  x.game_init(1, 1);
  const data = new DataView(x.memory.buffer);
  const base = x.r_state();
  return {
    fly(angle, power, wind) {
      windServer.wind = wind;
      data.setFloat32(base + GAME_FIELDS.angle.at, angle, true);
      data.setInt32(base + GAME_FIELDS.power.at, power, true);
      data.setInt32(base + GAME_FIELDS.flying.at, 0, true);
      x.game_key(5);
      let frames = 0;
      while (x.r_flying() && frames < 10000) { x.game_tick(); frames++; }
      return { x: x.r_impact_x(), frames };
    },
  };
}
