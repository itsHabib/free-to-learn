// The game, loaded in Node, and the only six calls an engine may make on it.
// Course code uses makeGame, which also returns the game's own view of itself
// (`truth`) so checks can compare your findings with what the game knows.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The game runs here and only here. This file keeps its own reference to WebAssembly,
// taken when it loads: the check worker removes the global before it loads any work file.
const WA = globalThis.WebAssembly;

const here = dirname(fileURLToPath(import.meta.url));
export const KEYS = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 3, ArrowDown: 4, Space: 5, KeyN: 6 };
export const MODES = { normal: 0, server: 1, moving: 2, scrambled: 4, flag: 8 };
export const WIDTH = 960, HEIGHT = 540, GROUND = 500;

// The lab's recorder. "node lab.mjs watch" sets a tap to record every game made
// while it runs; nothing else uses it, and an engine never sees it.
let tap = null;
export function setTap(t) { tap = t; }

const bytesCache = new Map();
export function gameBytes(game = 'lob') {
  if (!bytesCache.has(game)) bytesCache.set(game, new Uint8Array(readFileSync(join(here, 'game', `${game}.wasm`))));
  return bytesCache.get(game);
}

// Lob II names its drawing functions without saying what they draw.
const GETTERS = {
  lob: { target: 'r_target_x', angle: 'r_angle', power: 'r_power', line: 'r_line_ptr', msg: 'r_msg_ptr', flying: 'r_flying', impact: 'r_impact_x', level: 'r_wind_level' },
  lob2: { target: 'g3', angle: 'g0', power: 'g1', line: 'g6', msg: 'g7', flying: 'g4', impact: 'g5', level: 'g2' },
};

function xorshift(seed) {
  let x = (seed ^ 0x5bd1e995) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

export function makeGame({ game = 'lob', mode = 0, seed = 1 } = {}) {
  const bytes = gameBytes(game);
  const rand = xorshift(seed);
  const server = { wind: 0 };
  const env = {
    sin: Math.sin, cos: Math.cos,
    server_wind: () => server.wind,
    server_round: () => { server.wind = -5 + rand() * 10; return Math.max(-3, Math.min(3, Math.round(server.wind / 1.5))); },
  };
  const { exports: x } = new WA.Instance(new WA.Module(bytes), { env });
  x.game_init(seed >>> 0, mode);
  const g = GETTERS[game];
  const view = () => new DataView(x.memory.buffer);
  const cstr = (ptr) => {
    const m = new Uint8Array(x.memory.buffer);
    let s = '';
    while (m[ptr] && s.length < 300) s += String.fromCharCode(m[ptr++]);
    return s;
  };
  let rec = null;
  const host = Object.freeze({
    binary: () => bytes.slice(),
    memory: () => { if (rec) tap.read?.(rec); return new Uint8Array(x.memory.buffer); },
    write(addr, type, value) {
      if (type === 'f32') view().setFloat32(addr, value, true);
      else if (type === 'i32') view().setInt32(addr, value, true);
      else throw new Error(`write needs type 'f32' or 'i32', not ${type}`);
      if (rec) tap.write?.(rec, addr);
    },
    press(key) {
      if (!(key in KEYS)) throw new Error(`unknown key ${key}; keys are ${Object.keys(KEYS).join(', ')}`);
      x.game_key(KEYS[key]);
      if (rec) tap.press?.(rec, key);
    },
    tick(frames = 1) { for (let i = 0; i < frames; i++) { x.game_tick(); if (rec) tap.frame?.(rec); } },
    screen: () => render(x[g.target]()),
  });
  const truth = {
    exports: x,
    targetX: () => x[g.target](),
    angle: () => x[g.angle](),
    power: () => x[g.power](),
    flying: () => x[g.flying]() !== 0,
    impactX: () => x[g.impact](),
    windLevel: () => x[g.level](),
    serverWind: () => server.wind,
    line: () => cstr(x[g.line]()),
    message: () => cstr(x[g.msg]()),
    lineAddr: () => x[g.line](),
    msgAddr: () => x[g.msg](),
    // Lob only: where its state struct is now. Lob II keeps that to itself.
    stateBase: () => (game === 'lob' ? x.r_state() : null),
  };
  if (tap) rec = tap.start({ game, mode, seed, truth });
  return { host, truth };
}

export function makeHost(opts) {
  return makeGame(opts).host;
}

// A plain frame: sky, ground, and the flag. Only the flag's cloth is red.
function render(targetX) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    const [r, g, b] = y < GROUND ? [214, 235, 255] : [239, 231, 212];
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const tx = Math.round(targetX);
  for (let y = GROUND - 48; y < GROUND; y++) paint(data, tx, y, [71, 85, 105]);
  for (let y = GROUND - 48; y < GROUND - 35; y++) for (let x = tx + 1; x <= tx + 20; x++) paint(data, x, y, [229, 72, 77]);
  return { width: WIDTH, height: HEIGHT, data };
}

function paint(data, x, y, [r, g, b]) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b;
}
