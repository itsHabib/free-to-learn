// The checks' brute force for lessons 10 to 12: replay a recording once on YOUR
// machine, from tick 0, and keep what every instruction did. The checks compare
// your debugger's answers with scans over this trace.
import { createHash } from 'node:crypto';
import { readJson, program as loadNamed, countSteps } from './harness.mjs';
import { loadProgram } from '../public/program.mjs';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Answers imports from the recording in order.
export function answersFrom(program, recording) {
  let next = 0;
  const imports = {};
  for (const i of program.imports) imports[i.name] = () => recording.answers[next++].result;
  return imports;
}

// Run work() without its instructions counting towards your debugger's budget.
export function uncounted(counter, work) {
  const before = counter.count;
  try { return work(); } finally { counter.count = before; }
}

export function loadRecording(rel) {
  const recording = readJson(rel);
  return { recording, program: loadNamed(recording.program) };
}

// One pass: for instruction t (1-based) its function and position, and every write.
export function trace(Machine, program, recording) {
  const m = new Machine(program, answersFrom(program, recording));
  let cap = 1 << 20;
  let func = new Int32Array(cap), at = new Int32Array(cap), depth = new Int8Array(cap);
  const wTick = [], wAddress = [], wSize = [], wChanged = [], wMask = [];
  const callStart = [];
  let t = 0;
  for (const c of recording.calls) {
    callStart.push(t);
    m.begin(c.name, c.args);
    while (m.running) {
      const e = m.step();
      t = e.tick;
      if (t >= cap) { cap *= 2; const f = new Int32Array(cap); f.set(func); func = f; const a = new Int32Array(cap); a.set(at); at = a; const dd = new Int8Array(cap); dd.set(depth); depth = dd; }
      func[t] = e.func; at[t] = e.at; depth[t] = m.state.frames.length;
      for (const w of e.writes) { let mask = 0; w.before.forEach((b, k) => { if (b !== w.after[k]) mask |= 1 << k; }); wTick.push(t); wAddress.push(w.address); wSize.push(w.size); wChanged.push(mask !== 0); wMask.push(mask); }
    }
  }
  return { end: t, func, at, depth, callStart, writes: { tick: wTick, address: wAddress, size: wSize, changed: wChanged, mask: wMask } };
}

// Frames in progress at position p: depth[p] after instruction p (0 between calls and at 0).

// The next instruction at position p is instruction p + 1 (null at the end).
export const nextAt = (T, p) => (p < T.end ? { func: T.func[p + 1], at: T.at[p + 1] } : null);

// Which call position p belongs to: the call of instruction p + 1, or calls.length at the end.
export function callOf(T, p) {
  if (p >= T.end) return T.callStart.length;
  let lo = 0, hi = T.callStart.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T.callStart[mid] <= p) lo = mid; else hi = mid - 1; }
  // Several calls can start at the same tick only if a call runs no instruction; none does.
  return lo;
}

// Positions where each kind of stop fires, as the API defines them.
export function firesAt(T, stops, p) {
  const kinds = [];
  const n = nextAt(T, p);
  if (n) {
    if ((stops.breakpoints ?? []).some((b) => b.func === n.func && b.at === n.at)) kinds.push('breakpoint');
    if ((stops.functions ?? []).some((f) => f === n.func && n.at === 0)) kinds.push('function');
  }
  return kinds;
}
export function watchFires(T, watches, p) {
  // instruction p (position p is right after it) changed a watched byte
  if (p < 1 || !watches?.length) return false;
  const W = T.writes;
  let lo = 0, hi = W.tick.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (W.tick[mid] < p) lo = mid + 1; else hi = mid; }
  for (let k = lo; k < W.tick.length && W.tick[k] === p; k++) {
    if (!W.changed[k]) continue;
    // A watch fires only when a byte inside its range changed.
    for (const w of watches) for (let b = Math.max(w.address, W.address[k]); b < Math.min(w.address + (w.size ?? 1), W.address[k] + W.size[k]); b++) if (W.mask[k] & (1 << (b - W.address[k]))) return true;
  }
  return false;
}

export function scan(T, stops, from, direction) {
  const kindsAt = (p) => { const k = firesAt(T, stops, p); if (watchFires(T, stops.watches, p)) k.push('watchpoint'); return k; };
  if (direction > 0) { for (let p = from + 1; p <= T.end; p++) { const k = kindsAt(p); if (k.length) return { tick: p, kinds: k }; } return { tick: T.end, kinds: ['end'] }; }
  for (let p = from - 1; p >= 0; p--) { const k = kindsAt(p); if (k.length) return { tick: p, kinds: k }; }
  return { tick: 0, kinds: ['start'] };
}

// The last write touching byte `address` by an instruction with tick <= p.
export function lastWriteAt(T, program, address, p) {
  const W = T.writes;
  for (let k = W.tick.length - 1; k >= 0; k--) {
    if (W.tick[k] > p) continue;
    if (W.address[k] <= address && address < W.address[k] + W.size[k]) return { tick: W.tick[k], func: T.func[W.tick[k]], at: T.at[W.tick[k]], address: W.address[k], size: W.size[k] };
  }
  return null;
}

// What happened at position p, for failure messages: the instruction that ran last
// (with its writes, and which watched bytes it changed) and the one that runs next.
export function describeTick(T, p, watches = []) {
  if (p < 0 || p > T.end) return `position ${p} is outside the run`;
  const parts = [];
  if (p >= 1) {
    const W = T.writes;
    const writes = [];
    for (let k = 0; k < W.tick.length; k++) if (W.tick[k] === p) {
      const changed = [];
      for (let b = 0; b < W.size[k]; b++) if (W.mask[k] & (1 << b)) changed.push(W.address[k] + b);
      const inWatch = changed.filter((a) => watches.some((w) => a >= w.address && a < w.address + (w.size ?? 1)));
      writes.push(`${W.size[k]} bytes at ${W.address[k]}, ${changed.length ? `changing ${changed.join(' ')}` : 'changing nothing'}${watches.length ? (inWatch.length ? ' (inside a watch)' : ' (none inside a watch)') : ''}`);
    }
    parts.push(`instruction ${p} was (${T.func[p]}, ${T.at[p]})${writes.length ? `, which wrote ${writes.join('; ')}` : ', which wrote nothing'}`);
  }
  const n = nextAt(T, p);
  parts.push(n ? `the next is (${n.func}, ${n.at})` : 'nothing runs next');
  return parts.join('; ');
}

// The machine state at each requested position, from one replay (positions sorted).
export function statesAt(Machine, program, recording, positions) {
  const want = [...new Set(positions)].sort((a, b) => a - b);
  const out = new Map();
  const m = new Machine(program, answersFrom(program, recording));
  let k = 0;
  const take = () => { while (k < want.length && want[k] === m.state.tick) { out.set(want[k], structuredClone(m.state)); k++; } };
  for (const c of recording.calls) {
    take();
    if (k >= want.length) break;
    m.begin(c.name, c.args);
    while (m.running) { m.step(); if (m.running) take(); }
  }
  take();
  return out;
}

export { countSteps, loadProgram };
