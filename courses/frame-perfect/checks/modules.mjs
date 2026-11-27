// The checks for each module. Each check gets the learner's toolkit (the exports of work/tas.mjs) and the
// work folder, and throws an Error whose message tells the learner what went wrong.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { newState, step, hash, ADDR, RAM_SIZE, INPUTS, L, R, J, TILE, W } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';
import { replay, readMovieFile, expected } from './judge.mjs';
import { MOVIES, CLIP_YARD, CLIP_WALL_X, OPEN_ROOM, clipsThrough } from '../game/fixtures.mjs';

const fail = (msg) => { throw new Error(msg); };
const need = (tas, ...names) => names.forEach((n) => { if (typeof tas[n] !== 'function') fail(`work/tas.mjs does not export ${n}. Add the module's region with: node lab.mjs route NN write ./work`); });
const show = (inputs) => inputs.map((i) => '|' + (i & L ? 'L' : '.') + (i & R ? 'R' : '.') + (i & J ? 'J' : '.') + '|').join(' ');
// A small seeded generator, so a failing case can be printed and replayed.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const randomInputs = (rnd, n) => Array.from({ length: n }, () => INPUTS[Math.floor(rnd() * INPUTS.length)]);
const movieAt = (work, name) => join(work, 'movies', `${name}.movie`);
const sameRam = (a, b) => a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------- module 1
const m01 = [
  {
    id: 'c01-read', title: 'readMovie reads a header and frames',
    run(tas) {
      need(tas, 'readMovie');
      const text = '# Frame Perfect movie\ngame: 1.0\nlevel: room0\nrerecords: 3\ninputs:\n|.R.|\n\n|.RJ|\n|...|\n|L.J|\n';
      const m = tas.readMovie(text);
      if (!m || typeof m.header !== 'object' || !Array.isArray(m.inputs)) fail('readMovie should return { header, inputs }');
      if (m.header.level !== 'room0' || m.header.game !== '1.0' || String(m.header.rerecords) !== '3') fail(`the header should read game 1.0, level room0, rerecords 3; got ${JSON.stringify(m.header)}`);
      const want = [R, R | J, 0, L | J];
      if (m.inputs.join() !== want.join()) fail(`the frames should be ${want.join(', ')} (the blank line skipped); got ${m.inputs.join(', ')}`);
    },
  },
  {
    id: 'c01-bad-line', title: 'readMovie names the line of a broken frame',
    run(tas) {
      need(tas, 'readMovie');
      const text = 'game: 1.0\ninputs:\n|.R.|\n|.R.|\n|R..|\n';
      let msg = null;
      try { tas.readMovie(text); } catch (e) { msg = e.message; }
      if (msg === null) fail('readMovie accepted "|R..|" (R in the L column). A broken frame should throw an error.');
      if (!/\b5\b/.test(msg)) fail(`the error should name line 5, where "|R..|" is; it said: ${msg}`);
    },
  },
  {
    id: 'c01-roundtrip', title: 'writeMovie and readMovie give back the same movie, idle frames at the end kept',
    run(tas) {
      need(tas, 'readMovie', 'writeMovie');
      const inputs = [...MOVIES.level1Run.slice(0, 30), 0, 0, 0];
      const back = tas.readMovie(tas.writeMovie({ header: { game: '1.0', level: 'level1', rerecords: 0 }, inputs }));
      if (back.inputs.join() !== inputs.join()) fail(`after writing and reading back, the movie has ${back.inputs.length} frames instead of ${inputs.length}, or different inputs`);
    },
  },
  {
    id: 'c01-play', title: 'play agrees with the game on four movies',
    run(tas) {
      need(tas, 'play');
      const cases = [['room0', MOVIES.room0Right], ['room0', MOVIES.room0Short], ['level1', MOVIES.level1Death], ['level1', MOVIES.level1Run]];
      for (const [name, inputs] of cases) {
        const want = replay(name, inputs);
        const got = tas.play(loadLevel(name), inputs);
        for (const k of ['finished', 'frame', 'dead', 'hash']) {
          if (got?.[k] !== want[k]) fail(`${name}, ${inputs.length}-frame movie: ${k} should be ${want[k]}, play gave ${got?.[k]}`);
        }
      }
    },
  },
  {
    id: 'c01-first-win', title: 'work/movies/room0.movie reaches room 0\'s flag',
    run(tas, work) {
      const { inputs } = readMovieFile(movieAt(work, 'room0'));
      const r = replay('room0', inputs);
      if (!r.finished) fail(`your room 0 movie ends after ${r.frames} frames without the flag`);
    },
  },
];

// ---------------------------------------------------------------- module 2
function stateAfter(level, inputs) {
  const s = newState(level);
  inputs.forEach((i) => step(s, i));
  return s;
}
const m02 = [
  {
    id: 'c02-unchanged', title: 'a savestate does not change when play goes on',
    run(tas) {
      need(tas, 'save');
      const level = loadLevel('level1');
      const s = stateAfter(level, MOVIES.level1Run.slice(0, 20));
      const before = s.ram.slice();
      const saved = tas.save(s);
      MOVIES.level1Run.slice(20, 40).forEach((i) => step(s, i));
      if (!saved?.ram || !sameRam(saved.ram, before)) fail('after save, 20 more frames of play changed the savestate. A savestate must hold its own copy of the RAM.');
    },
  },
  {
    id: 'c02-restore', title: 'restore then continue hashes the same as straight play (200 cases)',
    run(tas) {
      need(tas, 'save', 'load');
      const level = loadLevel('level2'), rnd = seeded(2);
      for (let c = 0; c < 200; c++) {
        const inputs = randomInputs(rnd, 60), cut = 1 + Math.floor(rnd() * 58);
        const straight = stateAfter(level, inputs);
        const s = stateAfter(level, inputs.slice(0, cut));
        const saved = tas.save(s);
        randomInputs(rnd, 15).forEach((i) => step(s, i)); // wander off, then come back
        const back = tas.load(saved);
        inputs.slice(cut).forEach((i) => step(back, i));
        if (hash(back) !== hash(straight)) fail(`case ${c}: saved after frame ${cut} of a 60-frame movie, played 15 other frames, loaded and played the rest: the hash differs from playing straight through`);
      }
    },
  },
  {
    id: 'c02-two-loads', title: 'loading one savestate twice gives two independent states',
    run(tas) {
      need(tas, 'save', 'load');
      const level = loadLevel('level1');
      const saved = tas.save(stateAfter(level, MOVIES.level1Run.slice(0, 10)));
      const a = tas.load(saved), b = tas.load(saved);
      for (let i = 0; i < 10; i++) step(a, R);
      if (hash(b) !== hash(stateAfter(level, MOVIES.level1Run.slice(0, 10)))) fail('playing the first loaded state changed the second one. Each load needs its own copy.');
    },
  },
  {
    id: 'c02-session', title: 'Session throws away frames after a load and counts a rerecord',
    run(tas) {
      if (typeof tas.Session !== 'function') fail('work/tas.mjs does not export Session');
      const level = loadLevel('room0');
      const s = new tas.Session(level);
      [R, R, R].forEach((i) => s.advance(i));
      s.saveSlot(1);
      [J, J].forEach((i) => s.advance(i));
      s.loadSlot(1);
      s.advance(R);
      if (s.inputs.join() !== [R, R, R, R].join()) fail(`after save at frame 3, two frames, load and one more frame, the inputs should be R R R R; got ${s.inputs.join(' ')}`);
      if (s.rerecords !== 1) fail(`one load is one rerecord; the count is ${s.rerecords}`);
      if (hash(s.state) !== hash(stateAfter(level, [R, R, R, R]))) fail('the state after the load does not match playing R R R R');
      // Two slots on different branches: loading slot 2 after a detour from slot 1 must bring back slot 2's frames.
      const b = new tas.Session(level);
      b.advance(R); b.saveSlot(1); b.advance(R); b.saveSlot(2); b.loadSlot(1); b.advance(L); b.loadSlot(2);
      if (b.inputs.join() !== [R, R].join() || hash(b.state) !== hash(stateAfter(level, [R, R]))) fail(`save slot 1 after R, slot 2 after R R, load 1, play L, load 2: the movie should be R R, the frames slot 2 was saved with; it is ${b.inputs.map((i) => (i & L ? 'L' : '') + (i & R ? 'R' : '') + (i & J ? 'J' : '') || '.').join(' ')}`);
    },
  },
];

// ---------------------------------------------------------------- module 3
function probeFor(divergeAt, n) {
  const p = (k) => { p.calls++; if (k < 0 || k > n) fail(`firstDivergence asked about frame ${k}, outside 0 to ${n}`); return k < divergeAt; };
  p.calls = 0;
  return p;
}
const m03 = [
  {
    id: 'c03-bisect', title: 'firstDivergence finds the first disagreeing frame within ceil(log2 n) + 1 probes',
    run(tas) {
      need(tas, 'firstDivergence');
      const { frame, n } = expected.desync;
      for (const [at, len] of [[frame, n], [1, 64], [64, 64], [37, 100], [2, 3]]) {
        const p = probeFor(at, len);
        const got = tas.firstDivergence(p, len);
        if (got !== at) fail(`runs that agree up to frame ${at - 1} and disagree from frame ${at} on (n = ${len}): firstDivergence returned ${got}`);
        const limit = Math.ceil(Math.log2(len)) + 1;
        if (p.calls > limit) fail(`n = ${len}: ${p.calls} probes, more than ${limit}`);
      }
    },
  },
  {
    id: 'c03-diff', title: 'diffRam names the addresses where 1.0 and 1.1 first disagree',
    run(tas) {
      need(tas, 'diffRam');
      const level = loadLevel('level1'), { frame, addrs } = expected.desync;
      const a = newState(level, '1.0'), b = newState(level, '1.1');
      MOVIES.level1Run.slice(0, frame).forEach((i) => { step(a, i); step(b, i); });
      const got = tas.diffRam(a, b);
      if (!Array.isArray(got) || got.join() !== addrs.join()) fail(`after frame ${frame} the RAM differs at ${addrs.join(', ')}; diffRam gave ${JSON.stringify(got)}`);
      if (tas.diffRam(a, a).length !== 0) fail('a state compared with itself should give no addresses');
    },
  },
];

// ---------------------------------------------------------------- module 4
const m04 = [
  {
    id: 'c04-peek', title: 'peek reads u8, u16 and s16 values',
    run(tas) {
      need(tas, 'peek');
      const s = { ram: new Uint8Array(RAM_SIZE) };
      s.ram.set([0x34, 0x12, 0xf0, 0xff, 0x80], 2);
      const cases = [[2, 'u8', 0x34], [2, 'u16', 0x1234], [4, 'u16', 0xfff0], [4, 's16', -16], [6, 'u8', 0x80], [2, 's16', 0x1234]];
      for (const [addr, type, want] of cases) {
        const got = tas.peek(s, addr, type);
        if (got !== want) fail(`peek at 0x${addr.toString(16).padStart(2, '0')} as ${type}: should be ${want}, got ${got}`);
      }
    },
  },
  {
    id: 'c04-model', title: 'predictArc matches the game exactly on unseen input sequences',
    run(tas) {
      need(tas, 'predictArc');
      const src = String(tas.predictArc);
      if (/\bstep\s*\(|\bnewState\s*\(|\bplay\s*\(/.test(src)) fail('predictArc must work Kettle\'s motion out itself, without calling step, newState or play');
      const fixed = [
        [J, J, J, J, J, J, J, J, J, J, J, J, J, J, J, J, J, J, J, J],
        [J, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [R, R, R, R | J, R | J, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R | J, R | J, R | J],
        [L, L, L | J, R | J, R, R, 0, 0, J, J, 0, J, 0, 0, 0, 0, 0, 0, 0, 0],
        // A fall that ends exactly level with the floor is still in the air on that frame.
        [...new Array(16).fill(J), 0, J, J, J, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ];
      const seed = randomInt(1, 2 ** 31);
      const rnd = seeded(seed);
      const cases = [...fixed.map((inputs) => ({ prefix: [], inputs })), ...Array.from({ length: 35 }, () => ({ prefix: groundedPrefix(rnd), inputs: randomInputs(rnd, 30) }))];
      cases.forEach(({ prefix, inputs }, c) => {
        const s = stateAfter(OPEN_ROOM, prefix);
        const start = { x: u16(s, ADDR.X), y: u16(s, ADDR.Y), vx: s16(s, ADDR.VX) };
        const got = tas.predictArc(start, inputs);
        for (let f = 0; f < inputs.length; f++) {
          step(s, inputs[f]);
          const want = { x: u16(s, ADDR.X), y: u16(s, ADDR.Y) };
          const g = got?.[f];
          if (!g || g.x !== want.x || g.y !== want.y) fail(`sequence ${c + 1} (start ${JSON.stringify(start)}): after frame ${f + 1} the game has x ${want.x}, y ${want.y}; the model says ${g ? `x ${g.x}, y ${g.y}` : 'nothing'}. Inputs: ${show(inputs.slice(0, f + 1))}`);
        }
      });
    },
  },
];
const u16 = (s, a) => s.ram[a] | (s.ram[a + 1] << 8);
const s16 = (s, a) => { const v = u16(s, a); return v & 0x8000 ? v - 0x10000 : v; };
// A walk on the ground that ends standing, with jump not held, so the model can start from it.
function groundedPrefix(rnd) {
  const n = Math.floor(rnd() * 6);
  return Array.from({ length: n }, () => [0, L, R][Math.floor(rnd() * 3)]);
}

// ---------------------------------------------------------------- module 5
function reachableWith(stateKey, level, depth) {
  let frontier = [newState(level)];
  const seen = new Set([stateKey(frontier[0])]);
  let total = 1;
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const s of frontier) for (const i of INPUTS) {
      const t = step({ ram: s.ram.slice(), level: s.level, version: s.version }, i);
      if (t.ram[ADDR.DEAD]) continue;
      const k = stateKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(t);
    }
    total += next.length;
    frontier = next;
    if (total > 5 * expected.level1.reach20) fail(`more than ${5 * expected.level1.reach20} distinct states by depth ${d}: the key keeps something the future does not depend on`);
  }
  return total;
}
function checkMovie(level, result, frames) {
  if (typeof result?.expanded !== 'number') fail(`search should return expanded, the number of states it expanded; it returned ${JSON.stringify(result?.expanded)}`);
  if (!result?.inputs) fail(`search found no movie for ${level} (${result?.stopped ?? 'no reason given'}, ${result?.expanded} expanded)`);
  if (result.frames !== result.inputs.length) fail(`search says ${result.frames} frames but returned ${result.inputs.length} inputs`);
  const r = replay(level, result.inputs);
  if (!r.finished || r.frame !== result.inputs.length) fail(`the game replays the ${level} movie from search and ${r.finished ? `reaches the flag on frame ${r.frame}` : 'never reaches the flag'}`);
  if (result.frames !== frames) fail(`${level}: search found ${result.frames} frames; the shortest is ${frames}`);
}
const m05 = [
  {
    id: 'c05-key', title: 'stateKey: the right number of distinct states within 8 and 20 frames of level 1',
    run(tas) {
      need(tas, 'stateKey');
      const level = loadLevel('level1');
      for (const [d, want] of [[8, expected.level1.reach8], [20, expected.level1.reach20]]) {
        const got = reachableWith((s) => tas.stateKey(s), level, d);
        if (got < want) fail(`within ${d} frames your key finds ${got} distinct states; there are ${want}. Your key leaves out something the future depends on, so different states merge.`);
        if (got > want) fail(`within ${d} frames your key finds ${got} distinct states; there are ${want}. Your key keeps something the future does not depend on, so equal states never merge.`);
      }
    },
  },
  {
    id: 'c05-key-random', title: 'stateKey keeps the random state before the bell, only when asked',
    run(tas) {
      need(tas, 'stateKey');
      const bell = loadLevel('bell');
      const a = newState(bell), b = newState(bell);
      b.ram[ADDR.RNG] ^= 1;
      if (tas.stateKey(a) !== tas.stateKey(b)) fail('without withRandom, two states that differ only in the random state should have equal keys');
      if (tas.stateKey(a, true) === tas.stateKey(b, true)) fail('with withRandom, before the bell rings, the random state decides the drop: the keys must differ');
      a.ram[ADDR.BELL] = b.ram[ADDR.BELL] = 1;
      if (tas.stateKey(a, true) !== tas.stateKey(b, true)) fail('after the bell has rung, nothing reads the random state again: with withRandom the keys should be equal');
    },
  },
  {
    id: 'c05-pit', title: 'search crosses the spike pit in the fewest frames',
    run(tas) {
      need(tas, 'search');
      checkMovie('pit', tas.search(loadLevel('pit'), { budget: 100000 }), expected.pit.frames);
    },
  },
  {
    id: 'c05-ratio', title: 'de-duplication reaches the marker in at most 1% of brute force\'s expansions',
    run(tas) {
      need(tas, 'search');
      const room = loadLevel('room0'), s0 = newState(room), m = expected.marker;
      const x0 = u16(s0, ADDR.X), y0 = u16(s0, ADDR.Y);
      const goal = (s) => u16(s, ADDR.X) >= x0 + m.dx * 16 && u16(s, ADDR.Y) <= y0 - m.dy * 16;
      const r = tas.search(room, { goal, budget: m.bruteExpanded });
      if (typeof r?.expanded !== 'number') fail(`search should return expanded, the number of states it expanded; it returned ${JSON.stringify(r?.expanded)}`);
      if (r?.frames !== m.frames) fail(`the marker is ${m.frames} frames away; search found ${r?.frames}`);
      if (r.expanded > m.bruteExpanded / 100) fail(`search expanded ${r.expanded} states; brute force expanded ${m.bruteExpanded}, and the limit is 1% of that (${Math.floor(m.bruteExpanded / 100)})`);
    },
  },
  {
    id: 'c05-level1', title: 'level 1: the shortest movie, proven by exhaustive search within 400,000 expansions',
    run(tas) {
      need(tas, 'search');
      checkMovie('level1', tas.search(loadLevel('level1'), { budget: 400000 }), expected.level1.frames);
      const small = tas.search(loadLevel('level1'), { budget: 1000 });
      if (small?.inputs !== null || small?.stopped !== 'budget' || !(small.expanded <= 1000)) fail(`with a budget of 1,000 the search should stop with inputs null, stopped 'budget' and at most 1,000 expanded; it returned inputs ${small?.inputs ? `of ${small.inputs.length} frames` : small?.inputs}, stopped ${JSON.stringify(small?.stopped)}, expanded ${small?.expanded}`);
    },
  },
  {
    id: 'c05-astar', title: 'level 1 with the walking bound: the same count in at most 20,000 expansions',
    run(tas) {
      need(tas, 'search', 'walkingBound');
      const level = loadLevel('level1');
      const r = tas.search(level, { heuristic: tas.walkingBound(level), budget: 400000 });
      checkMovie('level1', r, expected.level1.frames);
      // Almost every state on a fastest path has f = 109, so the count depends on how the queue breaks ties:
      // 274 with last-in-first-out buckets, about 17,400 first-in-first-out. Every correct A* stays under 17,421.
      if (r.expanded > 20000) fail(`A* expanded ${r.expanded} states. A correct A* with this bound expands at most about 17,400 here, however it breaks ties (breadth-first search needs about 250,000). Check that the queue is ordered by depth plus heuristic, and that a state reached again by a longer way is skipped.`);
    },
  },
];

// ---------------------------------------------------------------- module 6
const wallPassed = (inputs) => clipsThrough(CLIP_YARD, CLIP_WALL_X, inputs);
const presses = (inputs) => inputs.reduce((n, i) => n + (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1), 0);
function oneMinimal(inputs, stillShows) {
  for (let f = 0; f < inputs.length; f++) for (const bit of [L, R, J]) {
    if (!(inputs[f] & bit)) continue;
    const t = inputs.slice();
    t[f] &= ~bit;
    if (stillShows(t)) return { f, bit };
  }
  return null;
}
const m06 = [
  {
    id: 'c06-minimise', title: 'minimise keeps the clip and leaves no press that could go',
    run(tas) {
      need(tas, 'minimise');
      const movie = [...expected.clipYard.movie].map(Number);
      const got = tas.minimise(movie, wallPassed);
      if (!Array.isArray(got) || got.length !== movie.length) fail(`minimise should return a movie of the same length (${movie.length} frames)`);
      if (got.some((v, i) => (v & ~movie[i]) !== 0)) fail('minimise added a press the movie did not have');
      if (!wallPassed(got)) fail('the minimised movie no longer passes the wall. Test each removal before keeping it.');
      const spare = oneMinimal(got, wallPassed);
      if (spare) fail(`frame ${spare.f + 1}'s ${spare.bit === L ? 'L' : spare.bit === R ? 'R' : 'J'} can still be cleared and the clip still happens (${presses(got)} presses left)`);
    },
  },
  {
    id: 'c06-par', title: 'work/movies/level2.movie finishes level 2 under par',
    run(tas, work) {
      const { inputs } = readMovieFile(movieAt(work, 'level2'));
      const r = replay('level2', inputs);
      const par = expected.level2.par;
      if (!r.finished) fail(`your level 2 movie ${r.dead ? `dies on frame ${r.frames}` : `ends after ${r.frames} frames without the flag`}`);
      if (r.frame > par) fail(`your level 2 movie reaches the flag on frame ${r.frame}; par is ${par}`);
    },
  },
  {
    id: 'c06-clip-min', title: 'work/movies/level2-clip.movie: a minimal movie that still clips level 2\'s wall',
    run(tas, work) {
      const { inputs } = readMovieFile(movieAt(work, 'level2-clip'));
      const level = loadLevel('level2');
      const wallX = 34 * TILE;
      const clips = (m) => clipsThrough(level, wallX, m);
      if (!clips(inputs)) fail('in your level2-clip movie Kettle never goes through the wall: on no frame does it move from wholly left of the wall to wholly past it');
      const spare = oneMinimal(inputs, clips);
      if (spare) fail(`frame ${spare.f + 1}'s ${spare.bit === L ? 'L' : spare.bit === R ? 'R' : 'J'} can be cleared and Kettle still goes through the wall: run minimise on it`);
    },
  },
  {
    id: 'c06-account', title: 'work/notes/level2.md names the addresses that show each glitch',
    run(tas, work) {
      const p = join(work, 'notes', 'level2.md');
      if (!existsSync(p)) fail('write your account of the two glitches in work/notes/level2.md');
      const t = readFileSync(p, 'utf8').toLowerCase();
      if (!/0x0?6\b|\bvx\b/.test(t)) fail('the account should name the address that shows the speed build-up (the horizontal speed, 0x06)');
      if (!/0x0?2\b|\bx position\b|\bx\b/.test(t)) fail('the account should name the address that shows the clip (the x position, 0x02)');
    },
  },
];

// ---------------------------------------------------------------- module 7
const m07 = [
  {
    id: 'c07-steer', title: 'steer finds the fewest idle frames for each drop',
    run(tas) {
      need(tas, 'steer');
      const bell = loadLevel('bell');
      const plan = [...expected.bell.plan].map(Number);
      const r = tas.steer(bell, plan, expected.bell.want);
      if (r?.idle !== expected.bell.idle) fail(`for drop ${expected.bell.want} the fewest idle frames is ${expected.bell.idle}; steer returned ${r === null ? 'null' : `idle ${r?.idle}`}`);
      const p = replay(bell, r.inputs);
      if (p.state.ram[ADDR.DROP] !== expected.bell.want) fail(`the inputs steer returned make the bell choose drop ${p.state.ram[ADDR.DROP]}`);
      expected.bell.idleByDrop.forEach((idle, d) => {
        const got = tas.steer(bell, plan, d)?.idle;
        if (got !== idle) fail(`for drop ${d} the fewest idle frames is ${idle}; steer returned ${got === undefined ? 'null' : `idle ${got}`}`);
      });
      if (tas.steer(bell, plan, expected.bell.want, expected.bell.idle - 1) !== null) fail(`with at most ${expected.bell.idle - 1} idle frames there is no way to get drop ${expected.bell.want}: steer should return null`);
    },
  },
  {
    id: 'c07-bell', title: 'work/movies/bell.movie finishes the bell room under par',
    run(tas, work) {
      const { inputs } = readMovieFile(movieAt(work, 'bell'));
      const r = replay('bell', inputs);
      if (!r.finished) fail(`your bell room movie ${r.dead ? `dies on frame ${r.frames}` : `ends after ${r.frames} frames without the flag`}`);
      if (r.frame > expected.bell.par) fail(`your bell room movie reaches the flag on frame ${r.frame}; par is ${expected.bell.par}`);
    },
  },
];

export const CHECKS = { '01': m01, '02': m02, '03': m03, '04': m04, '05': m05, '06': m06, '07': m07 };
