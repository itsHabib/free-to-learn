import { fail, expectSame, show, CONTROLS, observed, scripted, envWith } from './harness.mjs';
import { makeGame } from '../host.mjs';

export const title = 'Pin the values';
const L = 'lesson 02';

function slots(values) {
  const buf = new ArrayBuffer(values.length * 4), dv = new DataView(buf);
  values.forEach(([type, v], i) => (type === 'f32' ? dv.setFloat32(i * 4, v, true) : dv.setInt32(i * 4, v, true)));
  return new Uint8Array(buf);
}
const all = (n) => Uint32Array.from({ length: n }, (_, i) => i);

// The game seen through a view that adds a second copy of the flag at one-eighth
// scale, the way a minimap keeps one. It moves in step with the flag, so only the
// slope of the line against the screen tells the two apart. The copy sits in free
// memory near the top that a fresh game leaves zero, and the real game never sees it.
function withMinimap(host, truth) {
  const fresh = host.memory();
  let at = -1;
  for (let a = fresh.length - 16; a > fresh.length / 2; a -= 4) if (fresh.subarray(a, a + 16).every((x) => x === 0)) { at = a + 4; break; }
  if (at < 0) throw new Error('no free memory for the minimap copy');
  return {
    binary: () => host.binary(),
    memory: () => { const m = host.memory().slice(); new DataView(m.buffer).setFloat32(at, truth.targetX() / 8 + 3, true); return m; },
    write: (addr, type, value) => host.write(addr, type, value),
    press: (key) => host.press(key),
    tick: (n) => host.tick(n),
    screen: () => host.screen(),
    minimapAt: at,
  };
}
// The game seen through a view that keeps the wind and the flag at two other addresses,
// in free memory near the top, and leaves a constant where Lob keeps them (+8 and +16 from
// the angle). A search that measures finds them at their new places; one that assumes Lob's
// layout reports the old ones.
function withMovedFields(host, truth) {
  const fresh = host.memory();
  let at = -1;
  for (let a = fresh.length - 64; a > fresh.length / 2; a -= 4) if (fresh.subarray(a, a + 24).every((x) => x === 0)) { at = a + 4; break; }
  if (at < 0) throw new Error('no free memory for the moved fields');
  const base = truth.stateBase(), windAt = at, flagAt = at + 12;
  return {
    binary: () => host.binary(),
    memory: () => {
      const real = host.memory(), m = real.slice();
      const r = new DataView(real.buffer, real.byteOffset, real.byteLength), v = new DataView(m.buffer);
      v.setFloat32(windAt, r.getFloat32(base + 8, true), true);
      v.setFloat32(flagAt, r.getFloat32(base + 16, true), true);
      v.setFloat32(base + 8, 99.5, true);
      v.setFloat32(base + 16, 640.25, true);
      return m;
    },
    write: (addr, type, value) => host.write(addr, type, value),
    press: (key) => host.press(key),
    tick: (n) => host.tick(n),
    screen: () => host.screen(),
    windAt, flagAt,
  };
}
const asList = (c) => ({ f32: c?.f32 ? Array.from(c.f32) : c?.f32, i32: c?.i32 ? Array.from(c.i32) : c?.i32 });

export const cases = [
  {
    id: '02-views', title: 'viewsOf, allSlots, count and list',
    requirement: 'viewsOf gives the same bytes as 32-bit floats and as signed integers; allSlots numbers every 4-byte slot; count adds both types; list gives { type, slot, addr }, floats first.',
    reread: `${L}, slots and candidates`,
    async run({ fn }) {
      const viewsOf = await fn('scan.mjs', 'viewsOf'), allSlots = await fn('scan.mjs', 'allSlots');
      const count = await fn('scan.mjs', 'count'), list = await fn('scan.mjs', 'list');
      const bytes = slots([['f32', 45], ['i32', -7], ['f32', 2.5]]);
      const v = viewsOf(bytes);
      expectSame([v.f32[0], v.i32[1], v.f32[2], v.f32.length], [45, -7, 2.5, 3], { checked: 'viewsOf on three slots', input: 'float 45, integer -7, float 2.5', what: '[f32[0], i32[1], f32[2], length]' });
      expectSame(Array.from(allSlots(bytes)), [0, 1, 2], { checked: 'allSlots on 12 bytes', what: 'slots' });
      const c = { f32: Uint32Array.from([2]), i32: Uint32Array.from([0, 1]) };
      expectSame(count(c), 3, { checked: 'count of one float and two integer candidates', what: 'count' });
      expectSame(count({ f32: null, i32: null }), 0, { checked: 'count of nothing scanned', what: 'count' });
      expectSame(list(c), [{ type: 'f32', slot: 2, addr: 8 }, { type: 'i32', slot: 0, addr: 0 }, { type: 'i32', slot: 1, addr: 4 }], { checked: 'list', what: 'candidates' });
    },
  },
  {
    id: '02-filters', title: 'filterDelta, filterUnchanged and filterChanged narrow candidates',
    requirement: 'filterDelta keeps a float slot that rose by delta within 0.001 and an integer slot that rose by exactly delta; filterUnchanged keeps slots whose 32 bits did not change (the same NaN stays; 0 to -0 goes); filterChanged keeps the others.',
    reread: `${L}, filtering by change`,
    async run({ fn }) {
      const filterDelta = await fn('scan.mjs', 'filterDelta');
      const before = slots([['i32', 0], ['f32', 45], ['i32', 7], ['i32', 120], ['i32', 45], ['f32', 1.5]]);
      const after = slots([['i32', 0], ['f32', 46], ['i32', 7], ['i32', 122], ['i32', 46], ['f32', 2.25]]);
      const r = filterDelta({ f32: all(6), i32: all(6) }, before, after, 1);
      expectSame(asList(r), { f32: [1], i32: [4] }, { checked: 'filterDelta with delta 1', input: 'slot 1 float 45 to 46, slot 3 integer 120 to 122, slot 4 integer 45 to 46, slot 5 float 1.5 to 2.25', what: 'candidates' });
      const filterUnchanged = await fn('scan.mjs', 'filterUnchanged');
      const b0 = new Uint8Array(12), a0 = new Uint8Array(12);
      const b = new DataView(b0.buffer), a = new DataView(a0.buffer);
      b.setUint32(0, 0x7fc00001, true); a.setUint32(0, 0x7fc00001, true);
      b.setFloat32(4, 0, true); a.setFloat32(4, -0, true);
      b.setInt32(8, 9, true); a.setInt32(8, 9, true);
      const u = filterUnchanged({ f32: all(3), i32: null }, b0, a0);
      expectSame(asList(u), { f32: [0, 2], i32: null }, { checked: 'filterUnchanged on a NaN, a zero that became -0, and a 9', input: 'slot 0 the same NaN bits, slot 1 0 to -0, slot 2 9 to 9', what: 'candidates' });
      const filterChanged = await fn('scan.mjs', 'filterChanged');
      const ch = filterChanged({ f32: all(3), i32: all(3) }, b0, a0);
      expectSame(asList(ch), { f32: [1], i32: [1] }, { checked: 'filterChanged on the same three slots', what: 'candidates' });
    },
  },
  {
    id: '02-near', title: 'scanNear and filterNear keep float slots within a tolerance',
    requirement: 'scanNear(bytes, value, tol) gives every float slot within tol of value; filterNear keeps only those among the candidates, and sets i32 to null.',
    reread: `${L}, the wind and the flag`,
    async run({ fn }) {
      const scanNear = await fn('scan.mjs', 'scanNear'), filterNear = await fn('scan.mjs', 'filterNear');
      const bytes = slots([['f32', 2.31], ['f32', 2.4], ['i32', 2], ['f32', 2.26], ['f32', -2.3]]);
      expectSame(Array.from(scanNear(bytes, 2.3, 0.051)), [0, 3], { checked: 'scanNear for 2.3 within 0.051', input: 'floats 2.31, 2.4, the integer 2, 2.26, -2.3', what: 'slots' });
      expectSame(asList(filterNear({ f32: Uint32Array.from([1, 3, 4]), i32: Uint32Array.from([2]) }, bytes, 2.3, 0.051)), { f32: [3], i32: null }, { checked: 'filterNear among slots 1, 3 and 4', what: 'candidates' });
    },
  },
  {
    id: '02-line', title: 'lineFit gives the slope, the intercept and the worst residual',
    requirement: 'lineFit(xs, ys) is the least-squares line y = slope x + intercept, with the largest distance of any point from it.',
    reread: `${L}, the wind and the flag`,
    async run({ fn }) {
      const lineFit = await fn('scan.mjs', 'lineFit');
      const f = lineFit([500, 600, 700, 800], [1003, 1203, 1403, 1603]);
      if (!(Math.abs(f?.slope - 2) < 1e-9 && Math.abs(f?.intercept - 3) < 1e-6 && f?.worst < 1e-6)) fail({ checked: 'lineFit on four points on y = 2x + 3', observed: show(f), expected: '{ slope: 2, intercept: 3, worst: 0 }' });
      const g = lineFit([0, 1, 2, 3], [0, 1, 4, 1]);
      if (!(Math.abs(g?.slope - 0.6) < 1e-9 && Math.abs(g?.intercept - 0.6) < 1e-9 && Math.abs(g?.worst - 2.2) < 1e-9)) fail({ checked: 'lineFit on (0,0), (1,1), (2,4), (3,1)', observed: show(g), expected: '{ slope: 0.6, intercept: 0.6, worst: 2.2 }' });
      const flat = lineFit([500, 600, 700, 800], [1e-5, 1.1e-5, 0.9e-5, 1.2e-5]);
      if (!(Math.abs(flat.slope) < 0.001)) fail({ checked: 'lineFit on a value that barely moves', observed: show(flat), expected: 'a slope near 0, which the slope bound then rejects' });
    },
  },
  {
    id: '02-red', title: 'findRed finds the flag\'s cloth on the screen',
    requirement: 'findRed(screen) gives { x, pixels }: the middle of the strongly red pixels\' columns and how many there are, or null when there are none.',
    reread: `${L}, the wind and the flag`,
    async run({ fn }) {
      const findRed = await fn('scan.mjs', 'findRed');
      for (const seed of [3, 17]) {
        const { host, truth } = makeGame({ mode: 0, seed });
        const r = findRed(host.screen());
        const want = Math.round(truth.targetX()) + 10.5;
        if (!r || Math.abs(r.x - want) > 0.01 || r.pixels !== 260) fail({ checked: `findRed on the screen of a fresh game (seed ${seed})`, observed: show(r), expected: `{ x: ${want}, pixels: 260 }: the cloth is 20 columns by 13 rows to the right of the pole` });
      }
      const blank = { width: 4, height: 2, data: new Uint8ClampedArray(32).fill(200) };
      expectSame(findRed(blank), null, { checked: 'findRed on a screen with no red', what: 'result' });
    },
  },
  {
    id: '02-menu', title: 'the menu only offers experiments that can narrow something',
    requirement: 'Presses while a value has 0 or more than 2 candidates, a write-test with one or two, the new-round key only after the status line is found and while wind or flag is missing; at most 5 options.',
    reread: `${L}, experiments from a menu`,
    async run({ fn }) {
      const experimentMenu = await fn('find.mjs', 'experimentMenu');
      const t = (state) => (experimentMenu(state) ?? []).map((o) => `${o.kind}:${o.target}`).sort();
      expectSame(t({ angle: 900, power: 'found', wind: null, flag: null, lineFound: false }), ['press:angle_down', 'press:angle_up'], { checked: 'before the status line is found', input: 'angle 900 candidates, power found, status line not found', what: 'menu' });
      expectSame(t({ angle: 2, power: 2, wind: 3, flag: 'found', lineFound: true }), ['press:new_round', 'write:angle', 'write:power'], { checked: 'two candidates left for each', input: 'angle 2, power 2, wind 3, flag found', what: 'menu' });
      expectSame(t({ angle: 'found', power: 'found', wind: 'found', flag: 'found', lineFound: true }), [], { checked: 'everything found', input: 'all found', what: 'menu' });
      expectSame(t({ angle: 0, power: null, wind: null, flag: null, lineFound: true }), ['press:angle_down', 'press:angle_up', 'press:new_round', 'press:power_down', 'press:power_up'], { checked: 'no candidates left for the angle, nothing scanned for the power', input: 'angle 0, power not scanned, status line found', what: 'menu' });
      const many = experimentMenu({ angle: 5, power: 7, wind: null, flag: null, lineFound: true }) ?? [];
      if (many.length > 5 || many.some((o) => typeof o.label !== 'string' || !o.label)) fail({ checked: 'the menu\'s size and labels', observed: show(many), expected: 'at most 5 options, each with a label in words' });
    },
  },
  {
    id: '02-write-test', title: 'writeTest tells the real angle from the status line\'s copy, and restores it',
    requirement: 'The slot the game uses holds a written value; its copy snaps back. Both end with their original values. The probe is the value plus 7, or minus 7 at 50 or more.',
    reread: `${L}, which copy is real`,
    async run({ fn }) {
      const writeTest = await fn('find.mjs', 'writeTest');
      const { host, truth } = makeGame({ mode: 0, seed: 12 });
      const base = truth.stateBase();
      // The status line's copy of the angle sits two words before the status text.
      const copy = truth.lineAddr() - 8;
      const cands = { f32: Uint32Array.from([base / 4]), i32: Uint32Array.from([copy / 4]) };
      const angleBefore = truth.angle();
      const r = writeTest(host, cands);
      const byAddr = Object.fromEntries((r ?? []).map((x) => [x.addr, x.held]));
      if (byAddr[base] !== true || byAddr[copy] !== false) fail({ checked: 'writeTest on the angle and the status line\'s copy', input: `float slot at ${base}, integer copy at ${copy}`, observed: show(r), expected: `held true for ${base} and false for ${copy}` });
      if (truth.angle() !== angleBefore) fail({ checked: 'writeTest restores what it wrote', input: `angle ${angleBefore}`, observed: `the angle is ${truth.angle()} after writeTest`, expected: `the angle is back at ${angleBefore}` });
      // At 50 or more the probe goes down by 7. The game doesn't clamp a written angle, so the check records the writes.
      const g2 = makeGame({ mode: 0, seed: 12 });
      while (g2.truth.angle() < 82) g2.host.press('ArrowRight');
      const writes = [];
      const rec = { binary: () => g2.host.binary(), memory: () => g2.host.memory(), write: (a, t, v) => { writes.push(v); return g2.host.write(a, t, v); }, press: (k) => g2.host.press(k), tick: (n) => g2.host.tick(n), screen: () => g2.host.screen() };
      writeTest(rec, { f32: Uint32Array.from([g2.truth.stateBase() / 4]), i32: null });
      if (writes[0] !== 75) fail({ checked: 'writeTest\'s probe for an angle of 82', input: 'the real angle at 82', observed: `first value written: ${show(writes[0])}`, expected: '75: the value is 50 or more, so the probe is 7 less' });
      if (g2.truth.angle() !== 82) fail({ checked: 'writeTest restores an angle of 82', observed: `angle ${g2.truth.angle()}`, expected: 'angle 82' });
    },
  },
  {
    id: '02-find', title: 'findValues finds angle, power, wind, flag, the status line and the message',
    requirement: 'On seeds 7, 21 and 24, findValues returns the addresses the game uses for angle, power, wind and the flag, and the status line\'s and message\'s addresses. The flag needs a line test over at least four new rounds, a copy at one-eighth scale is turned down by its slope, and on a view of the game that keeps the wind and the flag at other addresses they are found there.',
    reread: `${L}, the wind and the flag`,
    async run({ fn }) {
      const findValues = await fn('find.mjs', 'findValues');
      for (const seed of [7, 21, 24]) {
        const game = makeGame({ mode: 0, seed });
        const { truth } = game, { host, seen } = observed(game);
        const f = await findValues(host, CONTROLS);
        const base = truth.stateBase();
        expectSame([f?.angle?.addr, f?.power?.addr, f?.wind?.addr, f?.flag?.addr, f?.statusLine, f?.message], [base, base + 4, base + 8, base + 16, truth.lineAddr(), truth.msgAddr()], { checked: `findValues on seed ${seed}`, input: `state at ${base}${seed === 24 ? '; on this seed another string changes with each key press' : ''}`, what: 'addresses of angle, power, wind, flag, status line, message' });
        const pressed = seen.presses.KeyN ?? 0;
        if (!(pressed >= 4)) fail({ checked: `findValues plays four new rounds before accepting the flag (seed ${seed})`, observed: `it pressed the new-round key ${pressed} times`, expected: 'at least 4' });
        if (f?.rounds !== pressed) fail({ checked: 'the rounds findValues reports', observed: `rounds ${show(f?.rounds)}, but it pressed the new-round key ${pressed} times`, expected: `rounds ${pressed}` });
      }
      const { host, truth } = makeGame({ mode: 0, seed: 47 });
      const view = withMinimap(host, truth);
      let f, error = null;
      try { f = await findValues(view, CONTROLS); } catch (e) { if (String(e?.message).includes('not written yet')) throw e; error = String(e?.message ?? e); }
      if (f?.flag?.addr !== truth.stateBase() + 16) fail({ checked: 'findValues with a minimap copy of the flag in memory', input: `the flag at ${truth.stateBase() + 16}; a copy at one-eighth scale at ${view.minimapAt}`, observed: error ? `it stopped with "${error}"` : `flag ${show(f?.flag)}`, expected: `the flag at ${truth.stateBase() + 16}: the copy moves in step with the screen too, but with a slope of 1/8` });
      const moved = makeGame({ mode: 0, seed: 33 });
      const mv = withMovedFields(moved.host, moved.truth);
      let g, err2 = null;
      try { g = await findValues(mv, CONTROLS); } catch (e) { if (String(e?.message).includes('not written yet')) throw e; err2 = String(e?.message ?? e); }
      const mb = moved.truth.stateBase();
      if (g?.wind?.addr !== mv.windAt || g?.flag?.addr !== mv.flagAt) fail({ checked: 'findValues on a view of the game that keeps the wind and the flag at other addresses', input: `angle at ${mb}, power at ${mb + 4}; the wind at ${mv.windAt} and the flag at ${mv.flagAt}, with constants left at ${mb + 8} and ${mb + 16}`, observed: err2 ? `it stopped with "${err2}"` : `wind ${show(g?.wind)}, flag ${show(g?.flag)}`, expected: `the wind at ${mv.windAt} and the flag at ${mv.flagAt}: the wind is the slot that keeps the value the status line shows, and the flag the slot that moves on a line with the screen, wherever they are` });
    },
  },
  {
    id: '02-gives-up', title: 'findValues stops when the search cannot succeed',
    requirement: 'On a game that moves and scrambles its values, findValues throws an error containing "could not find" after at most 30 experiments.',
    reread: `${L}, experiments from a menu`,
    async run({ fn }) {
      const findValues = await fn('find.mjs', 'findValues');
      for (const mode of [6, 4]) {
        let asked = 0, message = null;
        try { await findValues(makeGame({ mode, seed: 83 }).host, CONTROLS, { decide: () => { asked += 1; return 0; } }); } catch (e) {
          message = String(e?.message ?? e);
          if (message.includes('not written yet')) throw e;
        }
        if (message === null || !message.includes('could not find')) fail({ checked: `findValues on a build that hides its values (mode ${mode})`, observed: message === null ? 'it returned addresses' : `it threw "${message.split('\n')[0]}"`, expected: 'an error containing "could not find" that names what is missing' });
        if (asked > 30) fail({ checked: `experiments findValues ran before giving up (mode ${mode})`, observed: `${asked}`, expected: 'at most 30: on a game that hides its values, press, write-test and restart would otherwise go round for ever' });
      }
    },
  },
  {
    id: '02-choose-pick', title: 'choose returns the model\'s pick, and does not ask when there is nothing to decide',
    requirement: 'choose passes the labels to the decision model and returns its choice. With one option or none it returns 0 without a call.',
    reread: `${L}, a pick that can't hurt`,
    async run({ fn }) {
      const choose = await fn('engine.mjs', 'choose');
      const models = scripted({ decide: [2, 1] });
      const env = envWith(models);
      expectSame(await choose(env, 'the next experiment', 'angle: 3, power: 2', ['a', 'b', 'c']), 2, { checked: 'choose with three text options and a model that picks 2', what: 'the index' });
      expectSame(await choose(env, 'the next repair', 'state', [{ kind: 'find', label: 'Search memory' }, { kind: 'reader', label: 'Read the state out of the code' }]), 1, { checked: 'choose with two options given as { kind, label } and a model that picks 1', what: 'the index' });
      const calls = models.calls;
      expectSame(calls[1]?.labels, ['Search memory', 'Read the state out of the code'], { checked: 'what the decision model was shown for options given as objects', what: 'the labels' });
      expectSame(calls[0]?.text, 'angle: 3, power: 2', { checked: 'the text passed to the decision model', what: 'the text' });
      expectSame(await choose(env, 'x', 'state', ['only one']), 0, { checked: 'choose with one option', what: 'the index' });
      expectSame(await choose(env, 'x', 'state', []), 0, { checked: 'choose with no options', what: 'the index' });
      const logged = env.entries.filter((e) => e.rung === 'decision');
      if (logged.length < 2 || !logged.some((e) => String(e.result).includes('Read the state out of the code'))) fail({ checked: 'what choose logs', observed: show(env.entries, 300), expected: 'a log entry with rung "decision" for each pick, whose result names the option picked' });
      if (models.calls.length !== 2) fail({ checked: 'calls made for menus of one option and of none', observed: `${models.calls.length - 2} extra calls`, expected: 'no call: with one option there is nothing to decide' });
    },
  },
  {
    id: '02-choose-safe', title: 'an answer that is not on the menu, and a model that is not there, are option 0',
    requirement: 'choose returns 0 when the choice is out of range, not a whole number or missing, and when the model throws. It never throws.',
    reread: `${L}, a pick that can't hurt`,
    async run({ fn }) {
      const choose = await fn('engine.mjs', 'choose');
      for (const bad of [3, -1, 1.5, '1', null, undefined, NaN]) {
        const got = await choose(envWith(scripted({ decide: () => bad })), 'x', 'state', ['a', 'b', 'c']);
        expectSame(got, 0, { checked: `choose when the model answers ${show(bad)} to a menu of three`, what: 'the index' });
      }
      const gone = await choose(envWith(scripted({ decide: ['unavailable'] })), 'x', 'state', ['a', 'b']);
      expectSame(gone, 0, { checked: 'choose when the decision model is not available', what: 'the index' });
      const silent = await choose(envWith({ decide: async () => undefined, calls: [] }), 'x', 'state', ['a', 'b']);
      expectSame(silent, 0, { checked: 'choose when the model returns nothing at all', what: 'the index' });
    },
  },
  {
    id: '02-any-pick', title: 'random picks still find everything: on this menu no pick can stop the search',
    requirement: 'findValues finds the same addresses on seeds 55 and 89 with a decider that picks at random, choosing every experiment from your menu.',
    reread: `${L}, a pick that can't hurt`,
    async run({ fn }) {
      const findValues = await fn('find.mjs', 'findValues');
      let x = 7;
      const shuffle = (text, labels) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % labels.length; };
      for (const seed of [55, 89]) {
        const game = makeGame({ mode: 0, seed });
        const { truth } = game, { host, seen } = observed(game);
        const asked = [];
        const f = await findValues(host, CONTROLS, { decide: (text, labels) => { asked.push(labels.length); return shuffle(text, labels); } });
        const turned = (seen.presses.ArrowRight ?? 0) + (seen.presses.ArrowLeft ?? 0), pushed = (seen.presses.ArrowUp ?? 0) + (seen.presses.ArrowDown ?? 0);
        if (!asked.length || !turned || !pushed) fail({ checked: `findValues finds the values by experiment (seed ${seed})`, observed: `it asked the decider ${asked.length} times, pressed an angle key ${turned} times and a power key ${pushed} times`, expected: 'the decider chooses experiments from your menu, and the angle and the power are each found by pressing their keys' });
        const base = truth.stateBase();
        expectSame([f?.angle?.addr, f?.power?.addr, f?.wind?.addr, f?.flag?.addr], [base, base + 4, base + 8, base + 16], { checked: `findValues with a random decider (seed ${seed})`, input: `state at ${base}`, what: 'addresses of angle, power, wind, flag' });
      }
    },
  },
];
