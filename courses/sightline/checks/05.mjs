import { fail, expectSame, show, CONTROLS, envWith, gameIdOf, playOn, sayScore, ruleFor, kitBy, levelNo } from './harness.mjs';
import { makeGame, gameBytes } from '../host.mjs';
import { referee } from '../levels.mjs';

export const title = 'Lift the code';
const L = 'lesson 05';

// Where an address expression points, in the checker's own words: [N] for a fixed
// address, *[N]+16 for field 16 of the struct whose address is kept at N.
function where(addr, offset = 0) {
  if (!addr || typeof addr !== 'object') return '?';
  if (addr.op === 'const') return `[${addr.value + offset}]`;
  if (addr.op === 'load') return `*${where(addr.addr, addr.offset)}+${offset}`;
  return `(computed)+${offset}`;
}
const storeAt = (st) => where(st.addr, st.offset);
const realStores = (f) => (f?.stores ?? []).filter((st) => !st.inLoop);

// Memory as the evaluator reads it, from the game as it is now.
function liveEnv(host, extra = {}) {
  const bytes = host.memory();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const load = (type, a) => {
    if (a < 0 || a + 4 > bytes.byteLength) return null;
    if (type === 'i32.load') return view.getInt32(a, true);
    if (type === 'f32.load') return view.getFloat32(a, true);
    if (type === 'i32.load8_u') return bytes[a];
    return null;
  };
  return { load, call: (name, args) => (name.endsWith('.sin') ? Math.sin(args[0]) : name.endsWith('.cos') ? Math.cos(args[0]) : null), memo: new Map(), ...extra };
}

// Three tiny functions, assembled here byte by byte in a module shaped like Lob's (an import of
// env.sin, one memory, exports), for lift to try before it meets a whole game function:
//   a: [100]+4 = param0 + 1                          (a straight line)
//   b: [400]   = the word at [400] + 1               (a load, as a stepper makes)
//   c: block; br_if 0 when param0 == 0; [300] = 5; end; [304] = 9
// In c the store to 300 runs only when param0 is not 0, and the store to 304 after the
// block runs on every path, since br_if 0 only takes its path to the same block's end.
const leb = (n) => { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; };
const sleb = (n) => { const out = []; for (;;) { const b = n & 0x7f; n >>= 7; if ((n === 0 && !(b & 0x40)) || (n === -1 && (b & 0x40))) { out.push(b); return out; } out.push(b | 0x80); } };
const section = (id, bytes) => [id, ...leb(bytes.length), ...bytes];
const named = (text) => [...leb(text.length), ...[...text].map((c) => c.charCodeAt(0))];
const TINY = {
  a: [0x41, ...sleb(100), 0x20, 0x00, 0x41, ...sleb(1), 0x6a, 0x36, 0x02, 0x04, 0x0b],
  b: [0x41, ...sleb(400), 0x41, ...sleb(400), 0x28, 0x02, 0x00, 0x41, ...sleb(1), 0x6a, 0x36, 0x02, 0x00, 0x0b],
  c: [0x02, 0x40, 0x20, 0x00, 0x45, 0x0d, 0x00, 0x41, ...sleb(300), 0x41, ...sleb(5), 0x36, 0x02, 0x00, 0x0b,
      0x41, ...sleb(304), 0x41, ...sleb(9), 0x36, 0x02, 0x00, 0x0b],
};
function tinyModule() {
  const names = Object.keys(TINY);
  const body = (code) => { const b = [0x00, ...code]; return [...leb(b.length), ...b]; };
  return Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, [0x02, 0x60, 0x01, 0x7d, 0x01, 0x7d, 0x60, 0x01, 0x7f, 0x00]),
    ...section(2, [0x01, ...named('env'), ...named('sin'), 0x00, 0x00]),
    ...section(3, [names.length, ...names.map(() => 0x01)]),
    ...section(5, [0x01, 0x00, 0x01]),
    ...section(7, [names.length, ...names.flatMap((n, i) => [...named(n), 0x00, i + 1])]),
    ...section(10, [names.length, ...names.flatMap((n) => body(TINY[n]))])]);
}
// The checker's own reading of an expression, enough for the tiny functions: a constant,
// param0, i32.add, i32.eqz and an i32 load from a memory that holds 41 at 400.
function value(e, p0) {
  if (!e || typeof e !== 'object') return undefined;
  if (e.op === 'const') return e.value;
  if (e.op === 'param') return e.index === 0 ? p0 : undefined;
  if (e.op === 'load') { const a = value(e.addr, p0); return a === undefined ? undefined : a + (e.offset ?? 0) === 400 ? 41 : 0; }
  const [x, y] = (e.args ?? []).map((a) => value(a, p0));
  if (e.op === 'i32.add') return x === undefined || y === undefined ? undefined : (x + y) | 0;
  if (e.op === 'i32.eqz') return x === undefined ? undefined : x === 0 ? 1 : 0;
  return undefined;
}

async function lifted(fn, game = 'lob', mode = 0, seed = 1) {
  const parseModule = await fn('wasm.mjs', 'parseModule');
  const liftAll = await fn('lift.mjs', 'liftAll');
  const g = makeGame({ game, mode, seed });
  const all = liftAll(parseModule(g.host.binary()));
  if (!(all instanceof Map) || !all.get('game_key') || !all.get('game_tick')) fail({ checked: `liftAll on ${game}.wasm`, observed: all instanceof Map ? `a Map with ${[...all.keys()].slice(0, 6).join(', ')}` : show(all, 80), expected: 'a Map from each defined function\'s name to what lift returns, with game_key and game_tick among them' });
  return { ...g, all, key: all.get('game_key'), tick: all.get('game_tick') };
}

const setBarrel = (host, truth, angle, power) => {
  while (Math.round(truth.angle()) !== angle) host.press(truth.angle() < angle ? 'ArrowRight' : 'ArrowLeft');
  while (truth.power() !== power) host.press(truth.power() < power ? 'ArrowUp' : 'ArrowDown');
};
const fireReal = (host, truth) => { host.press('Space'); let f = 0; while (truth.flying()) { host.tick(1); f++; } return { x: truth.impactX(), frames: f }; };

export const cases = [
  {
    id: '05-lift', title: 'lift turns game_key into its 13 stores, each with its value, its guard and its instruction',
    requirement: 'lift(mod, index) returns { name, stores, returns, calls }. Each store is { addr, offset, type, value, guard, at }: at is the index of its store instruction in decode(mod, index). On Lob, game_key makes 13 stores outside loops; the angle steppers store at *[78112]+0 under guards that test the key code (param 0) against 1 and 2.',
    reread: `${L}, lifting a function`,
    async run({ fn }) {
      const decode = await fn('wasm.mjs', 'decode');
      const parseModule = await fn('wasm.mjs', 'parseModule');
      const lift = await fn('lift.mjs', 'lift');
      // First three tiny functions, each compared store by store, so a slip shows on a body of
      // a few instructions before it shows on game_key's hundreds.
      let tiny;
      try { tiny = parseModule(tinyModule()); } catch (e) { if (String(e?.message).includes('not written yet')) throw e; fail({ checked: 'parseModule on a tiny module shaped like Lob (an import, one memory, three exported functions)', observed: `it threw: ${String(e?.message ?? e).split('\n')[0]}`, expected: 'a module whose exports name the functions a, b and c' }); }
      const want = {
        a: [{ at: 4, addr: 100, offset: 4, value: [[3, 4], [0, 1]], guard: 'none', text: '[100]+4 = param0 + 1' }],
        b: [{ at: 5, addr: 400, offset: 0, value: [[0, 42]], guard: 'none', text: '[400] = the word at [400] + 1 (41 + 1 here)' }],
        c: [{ at: 6, addr: 300, offset: 0, value: [[0, 5]], guard: 'param0 is not 0', text: '[300] = 5, when param0 is not 0' },
            { at: 10, addr: 304, offset: 0, value: [[0, 9]], guard: 'none', text: '[304] = 9, on every path' }],
      };
      for (const [name, stores] of Object.entries(want)) {
        const index = tiny?.exports?.find((e) => e.name === name)?.index;
        if (!Number.isInteger(index)) fail({ checked: 'the exports parseModule reads from the tiny module', observed: show(tiny?.exports), expected: 'a, b and c, as functions 1, 2 and 3 after the one import' });
        const got = realStores(lift(tiny, index));
        const body = `tiny function ${name}: ${stores.map((x) => x.text).join('; ')}`;
        if (got.length !== stores.length) fail({ checked: `stores lifted from ${body}`, observed: `${got.length}: ${show(got.map(storeAt))}`, expected: `${stores.length}` });
        stores.forEach((w, k) => {
          const st = got[k];
          const differs = (what, observed, expected) => fail({ checked: `store ${k + 1} of ${body}`, observed: `${what}: ${show(observed)}`, expected: `${what}: ${expected}` });
          if (st.at !== w.at) differs('at', st.at, `${w.at}, the index of its store instruction in decode(mod, index)`);
          if (st.addr?.op !== 'const' || st.addr.value !== w.addr || (st.offset ?? 0) !== w.offset) differs('where it writes', storeAt(st), `[${w.addr + w.offset}], the address ${w.addr} with offset ${w.offset}`);
          for (const [p0, v] of w.value) if (value(st.value, p0) !== v) differs(`its value with param0 ${p0}`, value(st.value, p0) ?? st.value, String(v));
          const conds = st.guard ?? [];
          if (w.guard === 'none' && conds.length) differs('its guard', conds.map((g) => ({ cond: g.cond?.op, holds: g.holds })), 'none: it runs on every path');
          if (w.guard === 'param0 is not 0' && !(conds.length === 1 && value(conds[0].cond, 0) === 1 && value(conds[0].cond, 3) === 0 && conds[0].holds === false)) differs('its guard', conds.map((g) => ({ cond: g.cond?.op, holds: g.holds })), 'one condition, (param0 == 0) not holding: br_if 0 leaves the block when param0 is 0');
        });
      }
      const mod = parseModule(gameBytes('lob'));
      const idx = mod.exports.find((e) => e.name === 'game_key').index;
      const r = lift(mod, idx);
      const stores = realStores(r);
      if (stores.length !== 13) fail({ checked: 'stores lifted from game_key on Lob', observed: `${stores.length}: ${show(stores.map(storeAt), 300)}`, expected: '13 stores outside loops' });
      const ins = decode(mod, idx);
      const bad = stores.find((st) => !Number.isInteger(st.at) || !String(ins[st.at]?.op).includes('store'));
      if (bad) fail({ checked: 'the `at` of each store', observed: `a store to ${storeAt(bad)} with at ${show(bad.at)}, which is ${show(ins[bad.at]?.op)}`, expected: 'the index of its store instruction in decode(mod, index)' });
      const angle = stores.filter((st) => storeAt(st) === '*[78112]+0');
      if (angle.length !== 2) fail({ checked: 'stores to the angle\'s word, *[78112]+0', observed: `${angle.length}`, expected: '2: one for each angle key' });
      const codes = angle.map((st) => st.guard.flatMap((g) => (g.cond?.op === 'i32.ne' || g.cond?.op === 'i32.eq' ? (g.cond.args ?? []).filter((x) => x.op === 'const').map((x) => x.value) : [])));
      if (!codes.some((c) => c.includes(1)) || !codes.some((c) => c.includes(2))) fail({ checked: 'the guards of the two angle stores', observed: show(codes), expected: 'one tests param 0 against 1 and the other against 2: each step runs only for its key code' });
      if (!Array.isArray(r.calls) || !r.calls.some((c) => /sin$/.test(c.call?.name ?? c.name ?? ''))) fail({ checked: 'the calls game_key makes', observed: show((r.calls ?? []).map((c) => c.call?.name ?? c.name), 120), expected: 'a list that includes env.sin and env.cos, each as { call, guard }' });
    },
  },
  {
    id: '05-guards', title: 'code after a block that some paths left early runs only on the paths that arrived',
    requirement: 'In Lob\'s game_tick the flag\'s speed is negated only when the flag would pass 420 or 900. The guard of that store must say so: it holds when the flag would pass an end and not otherwise.',
    reread: `${L}, lifting a function`,
    async run({ fn }) {
      const holds = await fn('lift.mjs', 'holds');
      const { tick } = await lifted(fn, 'lob', 8, 3);
      const neg = realStores(tick).find((st) => storeAt(st) === '*[78112]+96' && st.value?.op === 'f32.neg');
      if (!neg) fail({ checked: 'the store that negates the flag\'s speed, *[78112]+96 = neg(...)', observed: show(realStores(tick).map(storeAt), 300), expected: 'one store to *[78112]+96 whose value is f32.neg of the old speed' });
      // A memory where only the fields the guard reads are set: mode 8, key 0, the flag at x, speed 60.
      const env = (x) => {
        const words = new Map([[1000 + 84, 8], [1000 + 92, 0]]);
        const f = new DataView(new ArrayBuffer(4));
        const fl = (v) => { f.setFloat32(0, v, true); return f.getInt32(0, true); };
        words.set(1000 + 16, fl(x)); words.set(1000 + 96, fl(60));
        return { load: (type, a) => (a === 78112 ? 1000 : !words.has(a) ? 0 : type === 'f32.load' ? (f.setInt32(0, words.get(a), true), f.getFloat32(0, true)) : words.get(a)), call: () => null, memo: new Map() };
      };
      const got = [600, 899.5, 419.5].map((x) => holds(neg.guard, env(x)));
      expectSame(got, [false, true, false], { checked: 'the negating store\'s guard with the flag at 600, 899.5 and 419.5 moving at 60 paces a second', input: 'at 899.5 the next frame passes 900; at 419.5 it moves away from 420', what: 'whether it holds' });
    },
  },
  {
    id: '05-forward', title: 'a load sees the stores made before it on its path',
    requirement: 'A load of a place after a store to it on the same path is the stored value; after a store that may not have run it is a phi. In game_key the launch reads the power after the power keys\' stores, so with the code for power up given, its speed uses the power plus 1.',
    reread: `${L}, lifting a function`,
    async run({ fn }) {
      const evaluate = await fn('lift.mjs', 'evaluate');
      const parts = await fn('lift.mjs', 'parts');
      const make = await fn('lift.mjs', 'make');
      const { key, host, truth } = await lifted(fn, 'lob', 0, 5);
      const vx = realStores(key).find((st) => storeAt(st) === '*[78112]+48');
      if (!vx) fail({ checked: 'the launch\'s store to *[78112]+48', observed: show(realStores(key).map(storeAt), 300), expected: 'a store there' });
      if (![...parts(vx.value)].some((e) => e.op === 'phi')) fail({ checked: 'the value the launch stores at *[78112]+48', observed: 'it has no phi', expected: 'a phi: the power it reads may just have been changed by a power key\'s store, or not' });
      const P0 = make({ op: 'param', index: 0 });
      setBarrel(host, truth, 40, 70);
      const atCode = (code) => evaluate(vx.value, liveEnv(host, { given: new Map([[P0, code]]) }));
      const a = (40 * Math.PI) / 180;
      const want = (p) => Math.fround(Math.fround(p * 6) * Math.fround(Math.cos(Math.fround(Math.fround(40) * 0.0174532924))));
      const got = [atCode(5), atCode(3)];
      if (!(Math.abs(got[0] - want(70)) < 1e-3) || !(Math.abs(got[1] - want(71)) < 1e-3)) fail({ checked: 'the speed expression evaluated with key code 5 and with key code 3 given for param 0', input: 'angle 40, power 70 in memory', observed: show(got), expected: `${want(70).toFixed(3)} for code 5, and ${want(71).toFixed(3)} for code 3: the power key's store comes first on that path` });
      void a;
    },
  },
  {
    id: '05-evaluate', title: 'evaluate does the game\'s arithmetic',
    requirement: 'evaluate(e, env) rounds every f32 result to 32 bits, wraps i32 results, compares and shifts unsigned where the instruction says so, reinterprets bits both ways, takes the first phi path whose conditions hold, looks in env.given before anything else, and gives null when anything it needs is unknown.',
    reread: `${L}, evaluating`,
    async run({ fn }) {
      const evaluate = await fn('lift.mjs', 'evaluate');
      const make = await fn('lift.mjs', 'make');
      const constant = await fn('lift.mjs', 'constant');
      const op = (name, ...args) => make({ op: name, args });
      const f = (v) => constant('f32', Math.fround(v)), i = (v) => constant('i32', v);
      const env = { load: (type, a) => (a === 100 ? (type === 'f32.load' ? 2.5 : 1075838976) : null), call: (name, args) => (name === 'env.sin' ? Math.sin(args[0]) : null), memo: new Map() };
      const ev = (e, extra = {}) => evaluate(e, { ...env, memo: new Map(), ...extra });
      const load = (type, a) => make({ op: 'load', type, addr: constant('i32', a), offset: 0 });
      const rows = [
        ['f32.add of 0.1 and 0.2', ev(op('f32.add', f(0.1), f(0.2))), Math.fround(Math.fround(0.1) + Math.fround(0.2))],
        ['f32.mul of 1/60 and 300', ev(op('f32.mul', f(1 / 60), f(300))), Math.fround(Math.fround(1 / 60) * 300)],
        ['i32.add of 2147483647 and 1', ev(op('i32.add', i(2147483647), i(1))), -2147483648],
        ['i32.mul of 65536 and 65536', ev(op('i32.mul', i(65536), i(65536))), 0],
        ['i32.lt_u of -1 and 1', ev(op('i32.lt_u', i(-1), i(1))), 0],
        ['i32.lt_s of -1 and 1', ev(op('i32.lt_s', i(-1), i(1))), 1],
        ['i32.shr_u of -1 by 28', ev(op('i32.shr_u', i(-1), i(28))), 15],
        ['i32.shl of 1 by 33', ev(op('i32.shl', i(1), i(33))), 2],
        ['i32.rem_u of -1 and 180', ev(op('i32.rem_u', i(-1), i(180))), 4294967295 % 180],
        ['f32.reinterpret_i32 of 0x42380000', ev(op('f32.reinterpret_i32', i(0x42380000))), 46],
        ['i32.reinterpret_f32 of 46', ev(op('i32.reinterpret_f32', f(46))), 0x42380000],
        ['f32.convert_i32_u of -1', ev(op('f32.convert_i32_u', i(-1))), 4294967296],
        ['i32.trunc_sat_f32_s of 12.7', ev(op('i32.trunc_sat_f32_s', f(12.7))), 12],
        ['the f32 load at 100', ev(load('f32.load', 100)), 2.5],
        ['f32.add of an unknown load and 1', ev(op('f32.add', load('f32.load', 200), f(1))), null],
        ['sin of 0.5, demoted', ev(op('f32.demote_f64', make({ op: 'call', name: 'env.sin', args: [constant('f64', 0.5)] }))), Math.fround(Math.sin(0.5))],
        ['select of 7 and 9 on 0', ev(make({ op: 'select', args: [i(7), i(9), i(0)] })), 9],
      ];
      for (const [what, got, want] of rows) if (!Object.is(got, want) && !(typeof got === 'number' && typeof want === 'number' && got === want)) fail({ checked: `evaluate: ${what}`, observed: show(got), expected: show(want) });
      const P = make({ op: 'param', index: 0 });
      const phi = make({ op: 'phi', paths: [{ when: [{ cond: op('i32.eq', P, i(1)), holds: true }], value: i(10) }, { when: [{ cond: op('i32.eq', P, i(2)), holds: true }], value: i(20) }, { when: [], value: i(30) }] });
      expectSame([1, 2, 7].map((p) => ev(phi, { given: new Map([[P, p]]) })), [10, 20, 30], { checked: 'a phi with param 0 given as 1, 2 and 7', what: 'values' });
      const blind = make({ op: 'phi', paths: [{ when: [{ cond: load('i32.load', 200), holds: true }], value: i(10) }, { when: [], value: i(30) }] });
      expectSame(ev(blind), null, { checked: 'a phi whose first path depends on an unknown word', input: 'paths: [200] holds -> 10; otherwise -> 30; nothing is known at 200', what: 'value' });
      const big = op('f32.add', load('f32.load', 100), f(1));
      expectSame(ev(big, { given: new Map([[big, 99]]) }), 99, { checked: 'an expression given a value of its own', what: 'value' });
      expectSame(ev(make({ op: 'param', index: 0 })), null, { checked: 'a parameter with nothing given', what: 'value' });
    },
  },
  {
    id: '05-apply', title: 'apply works out every value first, then writes the stores whose guards hold, in order, and never touches the game',
    requirement: 'overlay(bytes) reads through to bytes and keeps writes in a map; apply(stores, m, { call, given }) evaluates every store\'s address and value from memory as it was before the first, then writes in order those whose guards hold, and returns how many it wrote.',
    reread: `${L}, evaluating`,
    async run({ fn }) {
      const overlay = await fn('lift.mjs', 'overlay');
      const apply = await fn('lift.mjs', 'apply');
      const make = await fn('lift.mjs', 'make');
      const constant = await fn('lift.mjs', 'constant');
      const bytes = new Uint8Array(64);
      const dv = new DataView(bytes.buffer);
      dv.setInt32(8, 5, true); dv.setInt32(12, 7, true);
      const at = (a) => constant('i32', a), ld = (a) => make({ op: 'load', type: 'i32.load', addr: at(a), offset: 0 });
      const add = (x, y) => make({ op: 'i32.add', args: [x, y] });
      const stores = [
        { addr: at(30), offset: 0, type: 'i32.store8', value: constant('i32', 7), guard: [] },
        { addr: at(8), offset: 0, type: 'i32.store', value: ld(12), guard: [] },
        { addr: at(12), offset: 0, type: 'i32.store', value: add(ld(8), constant('i32', 100)), guard: [] },
        { addr: at(16), offset: 0, type: 'i32.store', value: constant('i32', 1), guard: [{ cond: ld(20), holds: true }] },
        { addr: at(0), offset: 24, type: 'i32.store', value: constant('i32', 9), guard: [{ cond: ld(20), holds: false }] },
      ];
      const m = overlay(bytes);
      const n = apply(stores, m);
      expectSame([m.load('i32.load', 8), m.load('i32.load', 12), m.load('i32.load', 16), m.load('i32.load', 24), n], [7, 105, 0, 9, 3], { checked: 'apply on five stores', input: 'word 8 = 5 and word 12 = 7; a byte store at 30; store 8 = [12]; store 12 = [8] + 100; store 16 = 1 when [20]; store 24 = 9 when not [20]', what: '[word 8, word 12, word 16, word 24, stores written]: the overlay keeps words, so the byte store is neither written nor counted' });
      expectSame([dv.getInt32(8, true), dv.getInt32(12, true), dv.getInt32(24, true)], [5, 7, 0], { checked: 'the bytes passed to overlay after apply', what: 'words 8, 12 and 24' });
    },
  },
  {
    id: '05-xrefs', title: 'cross-references: who reads and who writes each place',
    requirement: 'xrefs(lifted) maps each place to { addr, offset, reads (a Set of function names), writes (the stores) }; a store at a computed address is left out. On Lob, *[78112]+20 is read by game_key and written by nothing; *[78112]+36 is written by game_key and game_tick.',
    reread: `${L}, the passes`,
    async run({ fn }) {
      const xrefs = await fn('lift.mjs', 'xrefs');
      const { all } = await lifted(fn);
      const refs = xrefs(all);
      if (!(refs instanceof Map)) fail({ checked: 'what xrefs returns', observed: show(refs, 80), expected: 'a Map' });
      const byPlace = new Map([...refs.values()].map((p) => [where(p.addr, p.offset), p]));
      const cannon = byPlace.get('*[78112]+20'), flying = byPlace.get('*[78112]+36');
      if (!cannon || !(cannon.reads instanceof Set) || !cannon.reads.has('game_key') || cannon.writes.length) fail({ checked: 'the cross-references of *[78112]+20', observed: cannon ? `read by ${show([...(cannon.reads ?? [])])}, written by ${show(cannon.writes.map((w) => w.fn))}` : 'no entry', expected: 'read by game_key; written by nothing: it is set once, when the game starts, through an address computed from the seed' });
      const writers = new Set((flying?.writes ?? []).map((w) => w.fn));
      if (!writers.has('game_key') || !writers.has('game_tick')) fail({ checked: 'the writers of *[78112]+36', observed: show([...writers]), expected: 'game_key (it fires) and game_tick (it lands)' });
      const angle = byPlace.get('*[78112]+0');
      if (!angle?.reads?.has('r_angle')) fail({ checked: 'the readers of *[78112]+0', observed: show([...(angle?.reads ?? [])]), expected: 'r_angle among them: what a function leaves on the stack at its end is a return, and xrefs reads returns too' });
    },
  },
  {
    id: '05-slice', title: 'a slice holds the stores that decide a set of places, and grows until nothing is added',
    requirement: 'slice(stores, keys) keeps the stores to the places named by placeKey, then the stores to every place their values and guards read, until nothing is added. On Lob\'s game_tick, the slice for the shell\'s four fields and the flying flag is 5 stores; the slice for the flag\'s word is 6.',
    reread: `${L}, the passes`,
    async run({ fn }) {
      const slice = await fn('lift.mjs', 'slice');
      const placeKey = await fn('lift.mjs', 'placeKey');
      const { tick } = await lifted(fn);
      const keyOf = (text) => { const st = realStores(tick).find((s) => storeAt(s) === text); return st ? placeKey(st.addr, st.offset) : `missing ${text}`; };
      const shell = slice(tick.stores, ['*[78112]+40', '*[78112]+44', '*[78112]+48', '*[78112]+52', '*[78112]+36'].map(keyOf));
      expectSame(shell.map(storeAt).sort(), ['*[78112]+36', '*[78112]+40', '*[78112]+44', '*[78112]+48', '*[78112]+52'], { checked: 'the slice of game_tick for the shell\'s fields and the flying flag', what: 'places stored, sorted' });
      const flag = slice(tick.stores, [keyOf('*[78112]+16')]);
      expectSame(flag.map(storeAt).sort(), ['*[78112]+100', '*[78112]+100', '*[78112]+16', '*[78112]+80', '*[78112]+96', '*[78112]+96'], { checked: 'the slice of game_tick for the flag\'s word', input: 'it reads the speed, the timer and the random generator\'s state, and their stores read them again', what: 'places stored, sorted' });
    },
  },
  {
    id: '05-steppers', title: 'steppers: values the key handler puts back plus or minus 1 within a bound',
    requirement: 'steppers(keyFn) returns { code, delta, value, bound, store } for each store under a key-code test that writes a value plus or minus 1 and is guarded by a comparison with a constant; value is the compared expression (decoded), so on Lob II, where the power store is just the stored word plus 1, it is still the decoded power.',
    reread: `${L}, recognising shapes`,
    async run({ fn }) {
      const steppers = await fn('flight.mjs', 'steppers');
      const evaluate = await fn('lift.mjs', 'evaluate');
      for (const [game, mode] of [['lob', 0], ['lob', 6]]) {
        const { key, host, truth } = await lifted(fn, game, mode, 3);
        const s = steppers(key);
        expectSame((s ?? []).map((x) => [x.code, x.delta]).sort(), [[1, -1], [2, 1], [3, 1], [4, -1]], { checked: `steppers on ${game}'s game_key`, what: '[code, delta] pairs, sorted' });
        host.press('ArrowRight'); host.press('ArrowUp');
        const now = (code) => evaluate(s.find((x) => x.code === code).value, liveEnv(host));
        if (!(Math.abs(now(2) - truth.angle()) < 1e-6) || now(3) !== truth.power()) fail({ checked: `the steppers' values evaluated on live memory (${game}, build ${mode})`, observed: `angle ${now(2)}, power ${now(3)}`, expected: `angle ${truth.angle()}, power ${truth.power()}: the value is the number as the game sees it` });
        const bounds = s.map((x) => [x.code, x.bound]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        expectSame(bounds, [5, 85, 99, 11], { checked: `the bounds of ${game}'s steppers, by key code`, what: 'bounds' });
      }
      // A build may store power + 1 as just the stored word plus 1: the value is the bound test's.
      const make = await fn('lift.mjs', 'make');
      const k = (v) => make({ op: 'const', type: 'i32', value: v });
      const ld = (off) => make({ op: 'load', type: 'i32.load', addr: k(5000), offset: off });
      const decoded = make({ op: 'i32.sub', args: [ld(4), ld(8)] });
      // Its guard first says the key is not 1 (param0 != 1 holds), then that it is 3.
      const P0 = make({ op: 'param', index: 0 });
      const made = { stores: [{ addr: k(5000), offset: 4, type: 'i32.store', value: make({ op: 'i32.add', args: [ld(4), k(1)] }), guard: [{ cond: make({ op: 'i32.ne', args: [P0, k(1)] }), holds: true }, { cond: make({ op: 'i32.ne', args: [P0, k(3)] }), holds: false }, { cond: make({ op: 'i32.gt_s', args: [decoded, k(99)] }), holds: false }], at: 0 }], returns: [], calls: [] };
      const got = steppers(made);
      if (got?.length !== 1 || got[0].code !== 3 || got[0].delta !== 1 || got[0].value !== decoded || got[0].bound !== 99) fail({ checked: 'steppers on a made-up store of word + 1, guarded by "key is not 1", "key is 3" and the decoded value, the word at +4 less the word at +8, above 99 not holding', observed: show(got?.map((x) => ({ code: x.code, delta: x.delta, bound: x.bound, valueIsBoundTest: x.value === decoded }))), expected: '[{ code: 3, delta: 1, bound: 99, value: the expression the bound test compares }]' });
    },
  },
  {
    id: '05-decoding', title: 'decoding tells how a value is stored: plain, XOR with a key, or a key added',
    requirement: 'decoding(value, rawKey) returns { raw, key, op, float }: op is plain, xor or add; raw is the load of the stored word (told from the key by its place, rawKey); decoder(d, raw) builds the same decoding for another word; encode(m, d, value) gives the word the game would store.',
    reread: `${L}, recognising shapes`,
    async run({ fn }) {
      const steppers = await fn('flight.mjs', 'steppers');
      const decoding = await fn('flight.mjs', 'decoding');
      const decoder = await fn('flight.mjs', 'decoder');
      const placeKey = await fn('lift.mjs', 'placeKey');
      const evaluate = await fn('lift.mjs', 'evaluate');
      const make = await fn('lift.mjs', 'make');
      const want = { lob: 'xor' };
      for (const game of ['lob']) {
        const { key, host, truth } = await lifted(fn, game, 6, 4);
        const a = steppers(key).find((x) => x.code === 2);
        const d = decoding(a.value, placeKey(a.store.addr, a.store.offset));
        if (d?.op !== want[game] || d.float !== true || placeKey(d.raw?.addr, d.raw?.offset) !== placeKey(a.store.addr, a.store.offset)) fail({ checked: `decoding of ${game}'s angle`, observed: show(d && { op: d.op, float: d.float, raw: where(d.raw?.addr, d.raw?.offset), key: d.key && where(d.key.addr, d.key.offset) }), expected: `op ${want[game]}, float true, raw the word the stepper stores to (${storeAt(a.store)})` });
        const p = steppers(key).find((x) => x.code === 3);
        const dp = decoding(p.value, placeKey(p.store.addr, p.store.offset));
        const rebuilt = decoder(d.float ? { ...d, float: false } : d, dp.raw);
        if (evaluate(rebuilt, liveEnv(host)) !== truth.power()) fail({ checked: `decoder rebuilding ${game}'s power from the angle's decoding`, observed: show(evaluate(rebuilt, liveEnv(host))), expected: `${truth.power()}` });
      }
      const word = make({ op: 'load', type: 'i32.load', addr: make({ op: 'const', type: 'i32', value: 400 }), offset: 0 });
      const plain = decoding(make({ op: 'f32.reinterpret_i32', args: [word] }), 'x');
      if (plain?.op !== 'plain' || plain.raw !== word || plain.key !== null) fail({ checked: 'decoding of a value stored as it is', observed: show(plain && { op: plain.op, key: plain.key }), expected: '{ op: "plain", raw: the load, key: null }' });
      const keyWord = make({ op: 'load', type: 'i32.load', addr: make({ op: 'const', type: 'i32', value: 400 }), offset: 8 });
      // An XOR whose key was made first, so it may come first among the operands: the
      // raw word is the one at the place the stepper stores to.
      const keyFirst = make({ op: 'load', type: 'i32.load', addr: make({ op: 'const', type: 'i32', value: 600 }), offset: 0 });
      const rawSecond = make({ op: 'load', type: 'i32.load', addr: make({ op: 'const', type: 'i32', value: 600 }), offset: 12 });
      const xored = decoding(make({ op: 'i32.xor', args: [rawSecond, keyFirst] }), placeKey(rawSecond.addr, rawSecond.offset));
      if (xored?.op !== 'xor' || xored.raw !== rawSecond || xored.key !== keyFirst || xored.float !== false) fail({ checked: 'decoding of a whole number XORed with a key, raw word at offset 12 of [600]', observed: show(xored && { op: xored.op, float: xored.float, raw: where(xored.raw?.addr, xored.raw?.offset), key: where(xored.key?.addr, xored.key?.offset) }), expected: '{ op: "xor", float: false, raw: [600]+12, key: [600]+0 }: rawKey names the stored word' });
      const added = decoding(make({ op: 'f32.reinterpret_i32', args: [make({ op: 'i32.sub', args: [word, keyWord] })] }), placeKey(word.addr, word.offset));
      if (added?.op !== 'add' || added.raw !== word || added.key !== keyWord || added.float !== true) fail({ checked: 'decoding of a float stored with a key added (word - key, read as a float)', observed: show(added && { op: added.op, float: added.float, rawIsWord: added.raw === word, keyIsKey: added.key === keyWord }), expected: '{ op: "add", float: true, raw: the word, key: the key }' });
      // encode is decoding run backwards: the word the game would store for a value.
      const encode = await fn('flight.mjs', 'encode');
      const overlay = await fn('lift.mjs', 'overlay');
      const mem = new Uint8Array(1024);
      new DataView(mem.buffer).setInt32(408, 1000, true);
      const scratch = new DataView(new ArrayBuffer(4));
      scratch.setFloat32(0, 45, true);
      const bits45 = scratch.getInt32(0, true);
      const words = [encode(overlay(mem), { ...added, float: false }, 60), encode(overlay(mem), added, 45), encode(overlay(mem), { op: 'xor', raw: word, key: keyWord, float: false }, 60), encode(overlay(mem), { op: 'plain', raw: word, key: null, float: false }, 60)];
      expectSame(words, [1060, (bits45 + 1000) | 0, 60 ^ 1000, 60], { checked: 'encode with the key word 1000: 60 added, 45.0 added as a float, 60 XORed, 60 plain', what: 'words' });
    },
  },
  {
    id: '05-launch', title: 'the launch: the stores the fire key makes, found by their sin and cos',
    requirement: 'launchOf(keyFn) returns { code, stores, trig, fields, flying, flyingStore }: code is the key code of the stores that use sin or cos, stores every store under that code, trig those four, fields their place keys, and flyingStore the store of 1 made with them. aimValues(keyFn, launch) gives the angle (the stepped value inside sin and cos) and the power.',
    reread: `${L}, recognising shapes`,
    async run({ fn }) {
      const launchOf = await fn('flight.mjs', 'launchOf');
      const aimValues = await fn('flight.mjs', 'aimValues');
      const evaluate = await fn('lift.mjs', 'evaluate');
      const { key } = await lifted(fn, 'lob');
      const l = launchOf(key);
      if (l?.code !== 5 || l.trig?.length !== 4 || l.stores?.length !== 9) fail({ checked: 'launchOf on Lob', observed: show(l && { code: l.code, trig: l.trig?.length, stores: l.stores?.length }), expected: '{ code: 5, trig: 4 stores, stores: 9 }' });
      expectSame(l.trig.map(storeAt).sort(), ['*[78112]+40', '*[78112]+44', '*[78112]+48', '*[78112]+52'], { checked: 'the places the launch\'s sin and cos stores write', what: 'places' });
      if (storeAt(l.flyingStore ?? {}) !== '*[78112]+36') fail({ checked: 'the flying flag', observed: storeAt(l.flyingStore ?? {}), expected: '*[78112]+36, set to 1 with the launch' });
      const g2 = await lifted(fn, 'lob', 6, 2);
      const l2 = launchOf(g2.key);
      const aim = aimValues(g2.key, l2);
      g2.host.press('ArrowRight');
      if (!aim || !(Math.abs(evaluate(aim.angle.value, liveEnv(g2.host)) - g2.truth.angle()) < 1e-6) || evaluate(aim.power.value, liveEnv(g2.host)) !== g2.truth.power()) fail({ checked: 'aimValues on Lob build 6 (values scrambled), evaluated on live memory', observed: aim ? `angle ${evaluate(aim.angle.value, liveEnv(g2.host))}, power ${evaluate(aim.power.value, liveEnv(g2.host))}` : show(aim), expected: `angle ${g2.truth.angle()}, power ${g2.truth.power()}` });
    },
  },
  {
    id: '05-flight', title: 'the flight: six stores of game_tick, the landing, and the wind',
    requirement: 'flightOf(tickFn, launch) returns { stores, landing, landingKey, wind }: the slice for the launch\'s fields and the flying flag, plus the landing (the float store made under the same guard as the flag\'s reset); wind is what the sideways speed gains each frame, before the constant.',
    reread: `${L}, recognising shapes`,
    async run({ fn }) {
      const launchOf = await fn('flight.mjs', 'launchOf');
      const flightOf = await fn('flight.mjs', 'flightOf');
      const evaluate = await fn('lift.mjs', 'evaluate');
      for (const [game, mode] of [['lob', 0], ['lob', 6]]) {
        const { key, tick, host, truth } = await lifted(fn, game, mode, 6);
        const f = flightOf(tick, launchOf(key));
        if (f?.stores?.length !== 6 || !f.landing) fail({ checked: `flightOf on ${game}`, observed: show(f && { stores: f.stores?.length, landing: f.landing && storeAt(f.landing) }), expected: '6 stores, the last being the landing' });
        setBarrel(host, truth, 45, 60);
        fireReal(host, truth);
        const m = host.memory(), dv = new DataView(m.buffer, m.byteOffset);
        const base = evaluate(f.landing.addr, liveEnv(host));
        const landed = dv.getFloat32(base + f.landing.offset, true);
        if (!(Math.abs(landed - truth.impactX()) < 1e-4)) fail({ checked: `the landing's place on ${game}, read after a real shot`, observed: `${landed}`, expected: `${truth.impactX()}, where the shell landed` });
        const line = truth.line().match(/WIND ([-+][\d.]+)/);
        const w = evaluate(f.wind, liveEnv(host));
        if (!line || !(Math.abs(w - Number(line[1])) <= 0.051)) fail({ checked: `the wind expression on ${game}, evaluated on live memory`, observed: show(w), expected: `within 0.05 of the status line's ${line?.[1]}` });
      }
    },
  },
  {
    id: '05-simulate', title: 'the simulator lands where the game lands, after the same number of frames',
    requirement: 'simulator(launch, aim, flight) returns simulate(bytes, { angle, power, wind }): on a copy of memory it stores the barrel the way the game stores it, runs the launch, then the flight a frame at a time until the flying flag is reset, and returns { x, frames }. With no wind given it uses the wind in memory. It writes nothing to the game.',
    reread: `${L}, the simulator`,
    timeLimitMs: 20000,
    async run({ fn }) {
      const launchOf = await fn('flight.mjs', 'launchOf');
      const aimValues = await fn('flight.mjs', 'aimValues');
      const flightOf = await fn('flight.mjs', 'flightOf');
      const simulator = await fn('flight.mjs', 'simulator');
      for (const [game, mode] of [['lob', 0], ['lob', 7], ['lob', 14]]) {
        const { key, tick, host, truth } = await lifted(fn, game, mode, 12);
        const launch = launchOf(key), simulate = simulator(launch, aimValues(key, launch), flightOf(tick, launch));
        for (const [angle, power] of [[30, 70], [62, 88], [17, 45], [80, 100]]) {
          host.press('KeyN'); host.tick(2);
          setBarrel(host, truth, 45, 60);
          const before = host.memory().slice();
          const wind = mode & 1 ? truth.serverWind() : undefined;
          const s = simulate(host.memory(), { angle, power, wind });
          if (!before.every((b, i) => b === host.memory()[i])) fail({ checked: 'what simulate wrote to the game', observed: 'the game\'s memory changed', expected: 'nothing: writes go to the copy' });
          setBarrel(host, truth, angle, power);
          const real = fireReal(host, truth);
          if (!s || s.x !== real.x || s.frames !== real.frames) fail({ checked: `simulate on ${game}, build ${mode}, at angle ${angle}, power ${power}${wind !== undefined ? `, with the server's wind ${wind.toFixed(3)} given` : ''}`, input: 'simulated with the barrel at 45 and 60, a setting the game was not set to', observed: show(s), expected: `{ x: ${real.x}, frames: ${real.frames} }, exactly` });
        }
      }
      // The wind given is the wind the flight uses, even on a build that keeps it in memory.
      {
        const { key, tick, host, truth } = await lifted(fn, 'lob', 0, 15);
        const launch = launchOf(key), simulate = simulator(launch, aimValues(key, launch), flightOf(tick, launch));
        const bytes = host.memory().slice();
        new DataView(bytes.buffer).setFloat32(truth.stateBase() + 8, 3.25, true);
        const given = simulate(host.memory(), { angle: 40, power: 80, wind: 3.25 }), stored = simulate(bytes, { angle: 40, power: 80 });
        if (!given || !stored || given.x !== stored.x || given.frames !== stored.frames) fail({ checked: 'simulate with wind 3.25 given, against simulate on memory that holds wind 3.25', input: 'Lob build 0, where the wind is kept in memory', observed: `${show(given)} with the wind given, ${show(stored)} with it in memory`, expected: 'the same landing: the wind given replaces the one in memory' });
      }
      // A struct can be reached through more than one pointer: resolve follows them all.
      const resolve = await fn('flight.mjs', 'resolve');
      const overlay = await fn('lift.mjs', 'overlay');
      const make = await fn('lift.mjs', 'make');
      const bytes = new Uint8Array(256), dv = new DataView(bytes.buffer);
      dv.setInt32(16, 64, true); dv.setInt32(68, 128, true);
      const chain = make({ op: 'load', type: 'i32.load', addr: make({ op: 'load', type: 'i32.load', addr: make({ op: 'const', type: 'i32', value: 0 }), offset: 16 }), offset: 4 });
      const got = resolve(overlay(bytes), chain);
      if (got !== 128) fail({ checked: 'resolve on a pointer chain: [16] holds 64, and [64 + 4] holds 128', observed: show(got), expected: '128: follow every pointer the address goes through' });
    },
  },
  {
    id: '05-physics', title: 'learnPhysics confirms the physics with check shots, and refutes it when it is wrong',
    requirement: 'learnPhysics fires 3 check shots, each simulated from memory just before it leaves, and installs kit.physics = { game, says } only if every one lands within a pace of its simulation after the same number of frames. When the code read is not the game being played (a file with another gravity), the check shots disagree and kit.physics is null.',
    reread: `${L}, every finding is a hypothesis`,
    timeLimitMs: 30000,
    async run({ fn }) {
      const learnPhysics = await fn('engine.mjs', 'learnPhysics');
      const findValues = await fn('find.mjs', 'findValues');
      const setup = async (game, seed, bytes = null) => {
        const ref = referee({ game, mode: 0, seed });
        const host = bytes ? { ...ref.host, binary: () => bytes.slice() } : ref.host;
        const f = await findValues(ref.host, CONTROLS);
        const kit = { game: gameIdOf(game), controls: { ...CONTROLS }, statusLine: f.statusLine, message: f.message, found: f };
        return { ref, host, kit };
      };
      const ok = await setup('lob', 31);
      await learnPhysics(ok.host, ok.kit, envWith(ruleFor({ heuristic: () => 0 })));
      const fired = ok.ref.seen.shots;
      if (!ok.kit.physics || ok.kit.physics.game !== gameIdOf('lob') || typeof ok.kit.physics.says !== 'string') fail({ checked: 'kit.physics after learnPhysics on Lob', observed: show(ok.kit.physics), expected: '{ game: the gameId, says: what the code says about a shot, in words }' });
      if (fired < 3 || fired > 6) fail({ checked: 'check shots fired', observed: `${fired}`, expected: '3, and one more for each that hits (a hit gives no distance)' });
      // Lob played, but the file shown has the per-frame gravity step changed from
      // -5.00000048 to -6: the physics read is not this game's.
      const patched = gameBytes('lob').slice();
      const at = patched.findIndex((b, i) => b === 0x43 && patched[i + 1] === 0x01 && patched[i + 2] === 0x00 && patched[i + 3] === 0xa0 && patched[i + 4] === 0xc0);
      new DataView(patched.buffer).setFloat32(at + 1, -6, true);
      const wrong = await setup('lob', 31, patched);
      await learnPhysics(wrong.host, wrong.kit, envWith(ruleFor({ heuristic: () => 0 })));
      if (wrong.kit.physics) fail({ checked: 'kit.physics when the file read has another gravity than the game played', observed: show(wrong.kit.physics), expected: 'null: the check shots land far from that file\'s simulation' });
    },
  },
  {
    id: '05-level-2', title: 'level 2 passes within its budget',
    requirement: 'From the kit level 1 leaves, playLevel passes level 2 (9 of the last 10 shots within 3 paces) without going over 24 rounds and 16 shots.',
    reread: `${L}, level 2`,
    timeLimitMs: 60000,
    async run({ load }) {
      const engine = await load('engine.mjs');
      const kit = await kitBy(engine, 1);
      const r = await playOn(engine, 2, kit, ruleFor(engine));
      if (!r.pass) fail({ checked: 'level 2 from the kit level 1 left', observed: sayScore(r), expected: '9 of the last 10 shots within 3 paces, within the budget' });
      if (!kit.physics) fail({ checked: 'the kit after level 2', observed: 'no physics in it', expected: 'kit.physics: a fit is not exact enough for a target 3 paces wide' });
    },
  },
];
