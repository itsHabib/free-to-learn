// The toolkit: the finished version of work/tas.mjs.
// Each region is one module's work. The lessons show these regions; the checks import the exports.
import { newState, step, hash, ADDR, RAM_SIZE, INPUTS, L, R, J, TILE, W } from '../game/core.mjs';

// region: movie
// One line per frame: | then L, R, J or a dot for each button, then |.
const BUTTONS = [['L', L], ['R', R], ['J', J]];

// region: read-movie
export function formatInput(input) {
  return '|' + BUTTONS.map(([ch, bit]) => (input & bit ? ch : '.')).join('') + '|';
}

export function parseInput(line, n) {
  if (!/^\|[L.][R.][J.]\|$/.test(line)) throw new Error(`line ${n}: expected something like |.R.| but found "${line}"`);
  return BUTTONS.reduce((input, [ch, bit], i) => (line[i + 1] === ch ? input | bit : input), 0);
}

export function readMovie(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.indexOf('inputs:');
  if (start < 0) throw new Error('a movie needs a line "inputs:" before its frames');
  const header = {};
  lines.slice(0, start).forEach((line) => {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2];
  });
  const inputs = [];
  lines.slice(start + 1).forEach((line, i) => {
    if (line.trim() === '') return;
    inputs.push(parseInput(line.trim(), start + 2 + i));
  });
  return { header, inputs };
}
// endregion: read-movie

// region: write-movie
export function writeMovie({ header, inputs }) {
  const head = Object.entries(header).map(([k, v]) => `${k}: ${v}`);
  return ['# Frame Perfect movie', ...head, 'inputs:', ...inputs.map(formatInput), ''].join('\n');
}
// endregion: write-movie

// region: play
export function play(level, inputs, version = '1.0') {
  const state = newState(level, version);
  let frame = null;
  for (let i = 0; i < inputs.length && frame === null; i++) {
    step(state, inputs[i]);
    if (state.ram[ADDR.DEAD]) break;
    if (state.ram[ADDR.DONE]) frame = i + 1;
  }
  return { finished: frame !== null, frame, dead: state.ram[ADDR.DEAD] === 1, hash: hash(state), state };
}
// endregion: play
// endregion: movie

// region: savestate
// A savestate is a copy of everything that changes. The level and the version never change, so the
// copy can share them; the RAM changes every frame, so it must be copied.
// region: save-load
export function save(state) {
  return { ram: state.ram.slice(), level: state.level, version: state.version };
}

export function load(saved) {
  return { ram: saved.ram.slice(), level: saved.level, version: saved.version };
}
// endregion: save-load

// region: session
// A TAS session: frame advance, savestates in numbered slots, and a rerecord count.
export class Session {
  constructor(level, version = '1.0') {
    this.state = newState(level, version);
    this.inputs = [];
    this.slots = new Map();
    this.rerecords = 0;
  }

  advance(input) {
    step(this.state, input);
    this.inputs.push(input);
  }

  saveSlot(n) {
    this.slots.set(n, { saved: save(this.state), inputs: this.inputs.slice() });
  }

  loadSlot(n) {
    const slot = this.slots.get(n);
    if (!slot) throw new Error(`slot ${n} is empty`);
    this.state = load(slot.saved);
    this.inputs = slot.inputs.slice(); // the movie as it was at the savestate; later frames are thrown away
    this.rerecords += 1;
  }
}
// endregion: session
// endregion: savestate

// region: desync
// region: first-divergence
// probe(k) is true when the two runs agree after k frames. They agree after 0 and disagree after n.
// Returns the first frame after which they disagree.
export function firstDivergence(probe, n) {
  let lo = 0, hi = n; // agree after lo, disagree after hi
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (probe(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}
// endregion: first-divergence

// region: diff-ram
export function diffRam(a, b) {
  const out = [];
  for (let i = 0; i < RAM_SIZE; i++) if (a.ram[i] !== b.ram[i]) out.push(i);
  return out;
}
// endregion: diff-ram
// endregion: desync

// region: watch
// region: peek
// Reads one value from the RAM. Two-byte values are stored low byte first; s16 values are signed.
export function peek(state, addr, type = 'u8') {
  const r = state.ram;
  if (type === 'u8') return r[addr];
  const v = r[addr] | (r[addr + 1] << 8);
  if (type === 'u16') return v;
  return v & 0x8000 ? v - 0x10000 : v;
}
// endregion: peek

// region: watch-table
// One row per frame, frame 0 (before any input) included: { frame, NAME: value, ... }.
export function watch(level, inputs, fields, version = '1.0') {
  const state = newState(level, version);
  const row = (frame) => Object.fromEntries([['frame', frame], ...fields.map((f) => [f.name, peek(state, f.addr, f.type)])]);
  const rows = [row(0)];
  inputs.forEach((input, i) => { step(state, input); rows.push(row(i + 1)); });
  return rows;
}
// endregion: watch-table
// endregion: watch

// region: model
// Kettle's motion in open space, worked out from the watch table: flat ground at the starting height,
// no walls, no ceiling, no belts. start is { x, y, vx } with Kettle standing still vertically.
// Returns one { x, y } per input, after that frame. It never calls step.
// region: predict-arc
export function predictArc(start, inputs) {
  let { x, y, vx } = start;
  let vy = 0, ground = true, held = false;
  const out = [];
  for (const input of inputs) {
    const dir = (input & R ? 1 : 0) - (input & L ? 1 : 0);
    const jump = (input & J) !== 0;
    if (ground && jump && !held) {
      vy = -72;
      if (Math.abs(vx) >= 32 && Math.sign(vx) === dir) vx += dir * 8;
    } else if (ground) {
      vx = groundSpeed(vx, dir);
    } else if (dir !== 0 && dir * vx < 24) {
      vx = dir * Math.min(dir * vx + 8, 24);
    }
    if (!jump && vy < -16) vy = -16; // letting go early cuts the rise
    vy = Math.min(vy + 8, 64);
    held = jump;
    x += vx;
    y += vy;
    ground = y > start.y; // level with the floor is still in the air: the game lands Kettle only below it
    if (ground) { y = start.y; vy = 0; }
    out.push({ x, y });
  }
  return out;
}
// endregion: predict-arc

// region: ground-speed
function groundSpeed(vx, dir) {
  if (Math.abs(vx) > 24) vx = Math.sign(vx) * 24;
  if (dir !== 0) return Math.max(-24, Math.min(24, vx + dir * 8));
  return Math.abs(vx) <= 8 ? 0 : vx - Math.sign(vx) * 8;
}
// endregion: ground-speed
// endregion: model

// region: key
// Two states with the same key must behave the same from here on, whatever inputs follow.
// The frame counter is left out (the search knows the depth) and so is the random state, which only
// a bell reads. With withRandom, the random state stays in until the bell has rung.
export function stateKey(state, withRandom = false) {
  const r = state.ram;
  let key = '';
  for (let i = 2; i < 24; i++) {
    const isRandom = i === ADDR.RNG || i === ADDR.RNG + 1;
    if (isRandom && !(withRandom && !r[ADDR.BELL])) continue;
    key += String.fromCharCode(r[i]);
  }
  return key;
}
// endregion: key

// region: brute
// Tries every input sequence of each length in turn and counts the frames it expands.
export function bruteForce(level, maxDepth, goal = finished) {
  let expanded = 0;
  const tryFrom = (state, depth) => {
    if (depth === 0) return null;
    expanded++;
    for (const input of INPUTS) {
      const next = step(load(state), input);
      if (next.ram[ADDR.DEAD]) continue;
      if (goal(next)) return [input];
      const rest = tryFrom(next, depth - 1);
      if (rest) return [input, ...rest];
    }
    return null;
  };
  for (let depth = 1; depth <= maxDepth; depth++) {
    const inputs = tryFrom(newState(level), depth);
    if (inputs) return { inputs, frames: depth, expanded };
  }
  return { inputs: null, frames: null, expanded };
}

export const finished = (state) => state.ram[ADDR.DONE] !== 0;
// endregion: brute

// region: search
// Best-first search over states. With no heuristic it expands states in order of depth (breadth-first),
// so the first finishing state is a shortest movie. heuristic(state) must never overestimate the frames
// still needed, or the movie found may not be the shortest.
// region: search-loop
export function search(level, opts = {}) {
  const { goal = finished, heuristic = () => 0, budget = Infinity, version = '1.0', withRandom = false, from = null } = opts;
  const root = from ? load(from) : newState(level, version);
  const nodes = [{ state: root, parent: -1, input: -1, depth: 0 }];
  const best = new Map([[stateKey(root, withRandom), 0]]);
  const queue = new BucketQueue();
  queue.push(heuristic(root), 0);
  let expanded = 0;
  while (queue.size > 0) {
    const id = queue.pop();
    const node = nodes[id];
    if (best.get(stateKey(node.state, withRandom)) < node.depth) continue; // a shorter way here was found later
    if (goal(node.state)) return { inputs: pathTo(nodes, id), frames: node.depth, expanded };
    if (expanded >= budget) return { inputs: null, frames: null, expanded, stopped: 'budget' };
    expanded++;
    for (const input of INPUTS) {
      const state = step(load(node.state), input);
      if (state.ram[ADDR.DEAD]) continue;
      const key = stateKey(state, withRandom), depth = node.depth + 1;
      if (best.has(key) && best.get(key) <= depth) continue;
      best.set(key, depth);
      nodes.push({ state, parent: id, input, depth });
      queue.push(depth + heuristic(state), nodes.length - 1);
    }
  }
  return { inputs: null, frames: null, expanded, stopped: 'exhausted' };
}

function pathTo(nodes, id) {
  const inputs = [];
  for (let n = nodes[id]; n.parent >= 0; n = nodes[n.parent]) inputs.push(n.input);
  return inputs.reverse();
}
// endregion: search-loop

// region: bucket-queue
// Lists of node ids by priority. A push below the current lowest moves the start back, so a heuristic
// whose estimate drops by more than one frame in a step cannot lose nodes.
class BucketQueue {
  constructor() { this.buckets = []; this.low = 0; this.size = 0; }

  // Frame counts are whole numbers, so a lower bound rounded up is still a lower bound: a fractional
  // heuristic gets the bucket of its next whole number.
  push(priority, id) {
    if (!Number.isFinite(priority) || priority < 0) throw new Error(`a priority must be a number of frames, 0 or more; got ${priority}`);
    priority = Math.ceil(priority);
    (this.buckets[priority] ??= []).push(id);
    if (priority < this.low) this.low = priority;
    this.size++;
  }

  pop() {
    while (!this.buckets[this.low]?.length) this.low++;
    this.size--;
    return this.buckets[this.low].pop();
  }
}
// endregion: bucket-queue

// region: count-reachable
// The number of distinct states first reached at each depth from 0 to maxDepth.
export function countReachable(level, maxDepth) {
  let frontier = [newState(level)];
  const seen = new Set([stateKey(frontier[0])]);
  const counts = [1];
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const state of frontier) for (const input of INPUTS) {
      const s = step(load(state), input);
      if (s.ram[ADDR.DEAD] || seen.has(stateKey(s))) continue;
      seen.add(stateKey(s));
      next.push(s);
    }
    counts.push(next.length);
    frontier = next;
  }
  return counts;
}
// endregion: count-reachable

// region: walking-bound
// The fewest frames to reach the flag's column at walking top speed: a lower bound wherever nothing
// moves Kettle faster than 24 sub-pixels a frame.
export function walkingBound(level) {
  const flagX = flagColumn(level) * TILE;
  return (state) => Math.ceil(Math.max(0, flagX - (peek(state, ADDR.X, 'u16') + W - 1)) / 24);
}

export function flagColumn(level) {
  for (let tx = 0; tx < level.w; tx++) for (let ty = 0; ty < level.h; ty++) if (level.tiles[ty][tx] === 'F') return tx;
  throw new Error('this level has no flag');
}
// endregion: walking-bound
// endregion: search

// region: minimise
// Clears one button press at a time and keeps the change when stillShows(inputs) is still true.
// Repeats until no single press can be cleared.
export function minimise(inputs, stillShows) {
  if (!stillShows(inputs)) throw new Error('the movie does not show the effect to begin with');
  let current = inputs.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < current.length; i++) for (const bit of [L, R, J]) {
      if (!(current[i] & bit)) continue;
      const trial = current.slice();
      trial[i] &= ~bit;
      if (!stillShows(trial)) continue;
      current = trial;
      changed = true;
    }
  }
  return current;
}
// endregion: minimise

// region: steer
// Puts k idle frames before plan, for k = 0, 1, 2, ..., and plays it. Returns the first k for which
// the bell has rung and chosen want, with the inputs that do it.
export function steer(level, plan, want, maxIdle = 30) {
  for (let idle = 0; idle <= maxIdle; idle++) {
    const inputs = [...new Array(idle).fill(0), ...plan];
    const { state } = play(level, inputs);
    if (state.ram[ADDR.BELL] && state.ram[ADDR.DROP] === want) return { idle, inputs };
  }
  return null;
}
// endregion: steer
