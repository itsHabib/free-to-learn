// Unit 10: run backwards. Your debugger's answers are compared with a brute-force
// replay of the same recording on your own machine (checks/trace.mjs), and its
// replay costs are counted on calls to your Machine's step().
import { fail, show, countSteps } from './harness.mjs';
import { trace, statesAt, scan, lastWriteAt, nextAt, callOf, uncounted, hash, loadRecording, describeTick } from './trace.mjs';

export const title = 'Run backwards';

const rng = (seed) => { let x = seed >>> 0 || 1; return (n) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x % n; }; };

async function setup({ cls }, fixture = 'checks/fixtures/10/lob-m1.json') {
  const Machine = await cls('machine.mjs', 'Machine');
  const Debugger = await cls('debugger.mjs', 'Debugger');
  const counter = countSteps(Machine);
  const { recording, program } = loadRecording(fixture);
  const T = uncounted(counter, () => trace(Machine, program, recording));
  counter.reset();
  const d = new Debugger(program, recording);
  const opened = counter.count;
  return { Machine, Debugger, counter, recording, program, T, d, opened, fixture };
}

const memoryOf = (d) => d.read(0, 131072);
function expectPosition(d, T, states, t, input) {
  if (d.tick !== t) fail({ checked: 'the debugger stands at the position it moved to', input, observed: `tick is ${d.tick}`, expected: `tick ${t}` });
  const w = d.where();
  const n = nextAt(T, t);
  const want = { tick: t, call: callOf(T, t), func: n ? n.func : null, at: n ? n.at : null };
  if (!w || w.tick !== want.tick || w.call !== want.call || w.func !== want.func || w.at !== want.at) fail({ checked: 'where() names the instruction that runs next', input, observed: `where() returned ${show(w)}`, expected: show(want) });
  const mine = hash(memoryOf(d)), theirs = hash(states.get(t).memory);
  if (mine !== theirs) {
    const a = memoryOf(d), b = states.get(t).memory;
    let k = 0; while (k < a.length && a[k] === b[k]) k++;
    fail({ checked: 'memory at this position equals a replay from tick 0', input, observed: `read(0, 131072) differs first at address ${k}: yours ${a[k]}`, expected: `${b[k]}, as replaying the recording from tick 0 to tick ${t} gives` });
  }
}

const positions = (T, seed, n) => { const r = rng(seed); const out = [0, T.end, T.callStart[40], T.callStart[41] + 17]; while (out.length < n) out.push(r(T.end + 1)); return out; };

export const cases = [
  {
    id: '10.seek', title: 'seek moves to any position, forward or back', timeLimitMs: 30000,
    requirement: 'After seek(t) the debugger stands at t, where() names the next instruction and memory equals a replay from tick 0.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env);
      const ps = positions(T, 101, 14);
      const states = uncounted(counter, () => statesAt(Machine, program, recording, ps));
      for (const t of ps) { const r = d.seek(t); if (r !== t) fail({ checked: 'seek returns the new position', input: `seek(${t})`, observed: `returned ${show(r)}`, expected: String(t) }); expectPosition(d, T, states, t, `seek(${t}) on ${env.fixture ?? 'checks/fixtures/10/lob-m1.json'}`); }
    },
  },
  {
    id: '10.step-back', title: 'step and stepBack move by n and stop at the ends', timeLimitMs: 30000,
    requirement: 'stepBack(n) moves back n instructions and step(n) forward n, stopping at 0 and at end.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env);
      const r = rng(7);
      const plan = [];
      for (let k = 0; k < 6; k++) { const p = 300 + r(T.end - 600); plan.push([p, 'stepBack', 1], [p, 'stepBack', 250], [p, 'step', 3]); }
      plan.push([5, 'stepBack', 9], [T.end - 4, 'step', 10]);
      const want = (p, how, n) => how === 'stepBack' ? Math.max(0, p - n) : Math.min(T.end, p + n);
      const states = uncounted(counter, () => statesAt(Machine, program, recording, plan.map(([p, how, n]) => want(p, how, n))));
      for (const [p, how, n] of plan) {
        d.seek(p);
        d[how](n);
        expectPosition(d, T, states, want(p, how, n), `seek(${p}) then ${how}(${n})`);
      }
    },
  },
  {
    id: '10.continue', title: 'continue finds the next stop', timeLimitMs: 40000,
    requirement: 'continue(stops) moves to the nearest later position where a breakpoint fires or a watched byte has just changed, or to end.',
    async run(env) {
      const { d, T } = await setup(env);
      const r = rng(13);
      for (let k = 0; k < 10; k++) {
        const p = r(T.end - 20000);
        const q = p + 1 + r(15000);
        const stops = k % 3 === 0 ? { breakpoints: [{ func: T.func[q + 1], at: T.at[q + 1] }] }
          : k % 3 === 1 ? { watches: [{ address: T.writes.address[T.writes.tick.findIndex((t) => t >= q)], size: 2 }] }
            : { breakpoints: [{ func: T.func[q + 1], at: T.at[q + 1] }], watches: [{ address: 999999 }] };
        const want = scan(T, stops, p, +1);
        d.seek(p);
        const got = d.continue(stops);
        if (!got || got.tick !== want.tick || d.tick !== want.tick || !want.kinds.includes(got.reason)) fail({ checked: 'continue stops at the nearest later stop', input: `seek(${p}), continue(${show(stops)})`, observed: `${show(got)}, tick ${d.tick}`, expected: `{ reason: ${want.kinds.join(' or ')}, tick: ${want.tick} }`, diff: `at your stop, ${describeTick(T, got?.tick ?? d.tick, stops.watches)}; at the required stop, ${describeTick(T, want.tick, stops.watches)}` });
      }
      // From a position where a breakpoint fires, continue finds the next time it fires.
      const p = T.callStart[200];
      const stops = { breakpoints: [{ func: T.func[p + 1], at: T.at[p + 1] }] };
      const want = scan(T, stops, p, +1);
      d.seek(p);
      const got = d.continue(stops);
      if (got.tick !== want.tick) fail({ checked: 'continue moves even when a stop fires where it starts', input: `seek(${p}) where a breakpoint fires, continue`, observed: `stopped at ${got.tick}`, expected: `${want.tick}, the next time it fires (part one's run stood still here; continue does not)` });
    },
  },
  {
    id: '10.continue-back', title: 'continueBack finds the previous stop', timeLimitMs: 40000,
    requirement: 'continueBack(stops) moves to the nearest earlier position where a stop fires, or to 0; it always moves.',
    async run(env) {
      const { d, T } = await setup(env);
      const r = rng(17);
      for (let k = 0; k < 10; k++) {
        const p = 20000 + r(T.end - 20000);
        const q = p - 1 - r(15000);
        const stops = k % 3 === 0 ? { breakpoints: [{ func: T.func[q + 1], at: T.at[q + 1] }] }
          : k % 3 === 1 ? { watches: [{ address: T.writes.address[T.writes.tick.findIndex((t) => t >= q)], size: 1 }] }
            : { breakpoints: [{ func: T.func[q + 1], at: T.at[q + 1] }, { func: T.func[p + 1], at: T.at[p + 1] }] };
        const want = scan(T, stops, p, -1);
        d.seek(p);
        const got = d.continueBack(stops);
        if (!got || got.tick !== want.tick || d.tick !== want.tick || !want.kinds.includes(got.reason)) fail({ checked: 'continueBack stops at the nearest earlier stop', input: `seek(${p}), continueBack(${show(stops)})`, observed: `${show(got)}, tick ${d.tick}`, expected: `{ reason: ${want.kinds.join(' or ')}, tick: ${want.tick} }`, diff: `at your stop, ${describeTick(T, got?.tick ?? d.tick, stops.watches)}; at the required stop, ${describeTick(T, want.tick, stops.watches)}` });
      }
      // From a position where a breakpoint fires, continueBack finds the time before, not this one.
      const p = T.callStart[300];
      const stops = { breakpoints: [{ func: T.func[p + 1], at: T.at[p + 1] }] };
      const want = scan(T, stops, p, -1);
      d.seek(p);
      const got = d.continueBack(stops);
      if (got.tick !== want.tick) fail({ checked: 'continueBack moves even when a stop fires where it starts', input: `seek(${p}) where a breakpoint fires, continueBack`, observed: `stopped at ${got.tick}`, expected: `${want.tick}, the previous time it fires` });
    },
  },
  {
    id: '10.last-write', title: 'lastWrite names the last write of a byte', timeLimitMs: 40000,
    requirement: 'lastWrite(address) returns the latest write at or before here that touched the byte, changed or not, and does not move.',
    async run(env) {
      const { d, T, program } = await setup(env);
      const r = rng(23);
      const W = T.writes;
      for (let k = 0; k < 12; k++) {
        const p = r(T.end);
        const address = k === 11 ? 120000 : W.address[r(W.address.length)] + (k % 4 === 3 ? 1 : 0);
        const want = lastWriteAt(T, program, address, p);
        d.seek(p);
        const got = d.lastWrite(address);
        const same = want === null ? got === null : got && ['tick', 'func', 'at', 'address', 'size'].every((f) => got[f] === want[f]);
        if (!same) fail({ checked: 'lastWrite returns the last write that touched the byte', input: `seek(${p}), lastWrite(${address})`, observed: show(got), expected: show(want) });
        if (d.tick !== p) fail({ checked: 'lastWrite does not move the debugger', input: `seek(${p}), lastWrite(${address})`, observed: `tick ${d.tick} afterwards`, expected: `tick ${p}` });
      }
      // Standing right after a write: "at or before here" includes that write.
      for (let k = 0; k < 4; k++) {
        const j = r(W.tick.length);
        const p = W.tick[j], address = W.address[j];
        const want = lastWriteAt(T, program, address, p);
        d.seek(p);
        const got = d.lastWrite(address);
        if (!got || got.tick !== want.tick || got.address !== want.address) fail({ checked: 'lastWrite includes the write the debugger stands right after', input: `seek(${p}), right after a write to ${address}; lastWrite(${address})`, observed: show(got), expected: `${show(want)}: at or before the current position includes position ${p} itself` });
      }
    },
  },
  {
    id: '10.state', title: 'state() is a detached copy of the whole machine state', timeLimitMs: 30000,
    requirement: 'state() returns a structuredClone of the machine state at the current position; between calls it has no frames.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env);
      const inside = T.callStart[60] + 300, between = T.callStart[61];
      const states = uncounted(counter, () => statesAt(Machine, program, recording, [inside, between]));
      for (const [p, label] of [[inside, 'inside a call'], [between, 'between calls']]) {
        d.seek(p);
        const s = d.state();
        if (!s || !(s.memory instanceof Uint8Array)) fail({ checked: 'state() returns the machine state', input: `seek(${p}) ${label}`, observed: show(s, 120), expected: 'an object with memory (a Uint8Array), frames, tick and the rest of your machine\'s state' });
        if (hash(s.memory) !== hash(states.get(p).memory)) fail({ checked: 'state().memory is the memory at this position', input: `seek(${p}) ${label}`, observed: 'a different memory', expected: 'the memory a replay from tick 0 gives' });
        const frames = (s.frames ?? []).map((f) => [f.func, f.at]), want = states.get(p).frames.map((f) => [f.func, f.at]);
        if (JSON.stringify(frames) !== JSON.stringify(want)) fail({ checked: 'state().frames are the frames at this position', input: `seek(${p}) ${label}`, observed: show(frames), expected: show(want) });
        s.memory[0] ^= 255;
        if (d.read(0, 1)[0] === s.memory[0]) fail({ checked: 'state() is a copy', input: `seek(${p}), change state().memory[0]`, observed: 'the debugger\'s memory changed too', expected: 'a detached copy' });
      }
    },
  },
  {
    id: '10.page-sharing', title: 'snapshots share the pages that did not change', timeLimitMs: 40000,
    requirement: 'Each snapshot\'s pages laid end to end are the memory at its tick; an unchanged page is the same object as in the previous snapshot, so all snapshots together hold under a quarter of what full copies would.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env);
      d.seek(T.end);
      const snaps = d.snapshots;
      if (!Array.isArray(snaps) || snaps.length < 2) fail({ checked: 'the debugger keeps snapshots', input: 'after seek(end)', observed: `snapshots is ${show(snaps, 80)}`, expected: 'an array of { tick, pages }, one every few thousand instructions' });
      const distinct = new Set();
      for (const s of snaps) {
        if (!Number.isInteger(s.tick) || !Array.isArray(s.pages) || !s.pages.every((p) => p instanceof Uint8Array)) fail({ checked: 'a snapshot is { tick, pages }', input: 'after seek(end)', observed: show(s, 120), expected: '{ tick, pages: [Uint8Array, ...] }' });
        const length = s.pages.reduce((n, p) => n + p.length, 0);
        if (length !== 131072) fail({ checked: 'a snapshot\'s pages cover all of memory', input: `snapshot at tick ${s.tick}`, observed: `${length} bytes`, expected: '131072 bytes' });
        for (const p of s.pages) distinct.add(p);
      }
      const held = [...distinct].reduce((n, p) => n + p.byteLength, 0);
      const full = snaps.length * 131072;
      if (held > full / 4) fail({ checked: 'snapshots share unchanged pages', input: `${snaps.length} snapshots after seek(end)`, observed: `they hold ${held} bytes in ${distinct.size} distinct pages`, expected: `at most ${full / 4} bytes, a quarter of ${snaps.length} full copies. An unchanged page must be the same Uint8Array object as in the previous snapshot, and pages must be 16 KiB or smaller (yours are ${snaps[0].pages[0].byteLength} bytes): a game frame writes only a few small pages` });
      const sample = snaps.filter((_, k) => k % Math.max(1, Math.floor(snaps.length / 20)) === 0);
      const states = uncounted(counter, () => statesAt(Machine, program, recording, sample.map((s) => s.tick)));
      for (const s of sample) {
        const whole = new Uint8Array(131072);
        let o = 0; for (const p of s.pages) { whole.set(p, o); o += p.length; }
        if (hash(whole) !== hash(states.get(s.tick).memory)) fail({ checked: 'a snapshot\'s pages are the memory at its tick', input: `snapshot at tick ${s.tick}`, observed: 'its pages differ from the memory at that tick', expected: 'the memory a replay from tick 0 gives (did a replay write into a page a snapshot holds?)' });
      }
    },
  },
  {
    id: '10.budget', title: 'backward questions near the end replay a few thousand instructions, not the run', timeLimitMs: 40000,
    requirement: 'Opening the debugger may replay the run about twice; each backward question afterwards stays within its budget.',
    async run(env) {
      const { d, T, opened, counter } = await setup(env);
      if (opened > 2 * T.end + 20000) fail({ checked: 'opening the debugger replays the run at most about twice', input: `new Debugger on a run of ${T.end} instructions`, observed: `${opened} instructions`, expected: `at most ${2 * T.end + 20000}` });
      const near = T.end - 3000;
      d.seek(near);
      // To stand at position `near` your machine must have run at least `near`
      // instructions through step(); fewer means it ran some uncounted.
      if (counter.count < near) fail({ checked: 'every instruction your debugger replays runs through your Machine\'s step()', input: `new Debugger, then seek(${near})`, observed: `${counter.count} instructions counted through Machine.step()`, expected: `at least ${near}: the debugger cannot stand at position ${near} without running that many instructions (API.md, machine.mjs: every instruction goes through step())` });
      const b = d.read(78112, 4);
      const g = new DataView(b.buffer, b.byteOffset, 4).getInt32(0, true);
      const questions = [
        ['stepBack(1)', () => d.stepBack(1)],
        ['stepBack(1)', () => d.stepBack(1)],
        ['stepBack(600)', () => d.stepBack(600)],
        // Function stops are lesson 12's; a breakpoint at update_hud's instruction 0 stops at the same places.
        ['continueBack to update_hud\'s first instruction', () => d.continueBack({ breakpoints: [{ func: 6, at: 0 }] })],
        ['continueBack to update_hud\'s first instruction', () => d.continueBack({ breakpoints: [{ func: 6, at: 0 }] })],
        [`lastWrite(${g + 72}), the frame counter`, () => d.lastWrite(g + 72)],
        [`continueBack watching the frame counter at ${g + 72}`, () => d.continueBack({ watches: [{ address: g + 72, size: 4 }] })],
        ['continueBack to game_tick\'s first instruction', () => d.continueBack({ breakpoints: [{ func: 8, at: 0 }] })],
        [`lastWrite(${g + 76}), the cloud's position, rewritten every frame`, () => d.lastWrite(g + 76)],
        ['stepBack(1) after a long backward search', () => d.stepBack(1)],
      ];
      d.seek(near);
      for (const [label, ask] of questions) {
        const before = counter.count;
        const from = d.tick;
        ask();
        const cost = counter.count - before;
        if (cost > BUDGET_PER_QUESTION) fail({ checked: 'a backward question near the end replays a few thousand instructions', input: `at tick ${from} of ${T.end}, ${label}`, observed: `${cost} instructions replayed (it stopped at tick ${d.tick})`, expected: `at most ${BUDGET_PER_QUESTION}; replaying from tick 0 would cost about ${from}` });
      }
    },
  },
  {
    id: '10.lob2', title: 'the same answers on Lob II', timeLimitMs: 40000,
    requirement: 'seek, stepBack, lastWrite and continueBack agree with a replay from tick 0 on a Lob II recording.',
    async run(env) {
      const { d, T, Machine, program, recording, counter } = await setup(env, 'checks/fixtures/10/lob2-m1.json');
      const r = rng(31);
      const ps = [r(T.end), r(T.end), T.end - 1];
      const states = uncounted(counter, () => statesAt(Machine, program, recording, [...ps, ...ps.map((p) => Math.max(0, p - 1))]));
      for (const p of ps) {
        d.seek(p); expectPosition(d, T, states, p, `Lob II: seek(${p})`);
        d.stepBack(1); expectPosition(d, T, states, Math.max(0, p - 1), `Lob II: seek(${p}), stepBack(1)`);
        const address = T.writes.address[r(T.writes.address.length)];
        d.seek(p);
        const want = lastWriteAt(T, program, address, p), got = d.lastWrite(address);
        if (!(want === null ? got === null : got && got.tick === want.tick && got.address === want.address)) fail({ checked: 'lastWrite on Lob II', input: `seek(${p}), lastWrite(${address})`, observed: show(got), expected: show(want) });
        const stops = { breakpoints: [{ func: T.func[p - 500], at: T.at[p - 500] }] };
        const back = scan(T, stops, p, -1), got2 = d.continueBack(stops);
        if (got2.tick !== back.tick) fail({ checked: 'continueBack on Lob II', input: `seek(${p}), continueBack(${show(stops)})`, observed: show(got2), expected: `tick ${back.tick}` });
      }
    },
  },
];

// Budget per backward question near the end of a run of 654,610 instructions. The
// reference (a snapshot every 1,000 instructions) needs at most 1,872 for any of these
// questions; 20,000 leaves room for snapshots up to several thousand instructions
// apart and is still about a thirtieth of a replay from tick 0, over 640,000 here.
const BUDGET_PER_QUESTION = 20000;
