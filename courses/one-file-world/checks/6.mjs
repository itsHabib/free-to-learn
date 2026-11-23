// Lesson 6 checks: whichTree and bucket in project/world-06.html, and kioskAt in project/kiosk.js.
// The contract and the new application are required. The comparison with stage 6 is a note, never a failure.
import { landPath, ruleFault, declarations } from './rule.mjs';
import { stream } from './geometry.mjs';
import { layout, place } from './grow.mjs';

export const title = 'Ten thousand things';
const PLOTS = 32;
const PLOT = 64;
const HALF = 1024;
const show = (v) => String(+v.toPrecision(4));

// ------------------------------------------------------------------ whichTree

const KINDS = [-1, 0, 1, 2, 4];
// The tree's numbers: h, grass, moist, sand, steep, grove, tall, chance, pick.
const wood = { h: 30, grass: 0.9, moist: 0.6, sand: 0, steep: 0.1, grove: 1, tall: -0.2, chance: 0.1, pick: 0.8 };
const ask = (mine, o) => { const x = { ...wood, ...o }; return mine.call('whichTree', x.h, x.grass, x.moist, x.sand, x.steep, x.grove, x.tall, x.chance, x.pick); };
const said = (o) => { const x = { ...wood, ...o }; return `whichTree(h ${show(x.h)}, grass ${show(x.grass)}, moist ${show(x.moist)}, sand ${show(x.sand)}, steep ${show(x.steep)}, grove ${show(x.grove)}, tall ${show(x.tall)}, chance ${show(x.chance)}, pick ${show(x.pick)})`; };

function treeKinds({ mine }) {
  const r = stream(6);
  for (let k = 0; k < 4000; k++) {
    const o = { h: -4 + r() * 260, grass: r(), moist: r(), sand: r(), steep: r(), grove: r(), tall: r() * 2 - 1, chance: r(), pick: r() };
    const got = ask(mine, o);
    if (!KINDS.includes(got)) return { message: `${said(o)} returned ${got}: a tree is one of 0 (broadleaf), 1 (pine), 2 (cypress), 4 (palm), or -1 for none.` };
    if (ask(mine, o) !== got) return { message: `${said(o)} gave ${got}, then something else: the same spot must give the same tree.` };
    const band = o.h > 1.6 && o.h < 7 && o.sand > 0.12 && o.sand < 0.8;
    if (got === 4 && !band) return { message: `${said(o)} is a palm. Palms stand only behind the beach: 1.6 < h < 7 and 0.12 < sand < 0.8.` };
    if (band && got !== 4 && got !== -1) return { message: `${said(o)} is kind ${got}: behind the beach there are palms or nothing.` };
    if (!band && got >= 0 && (o.grass < 0.5 || o.h < 2.5)) return { message: `${said(o)} is a tree where ${o.grass < 0.5 ? 'the grass is thin' : 'the ground is too close to the sea'}: no tree there (grass below 0.5, or h below 2.5).` };
  }
  return null;
}
function palms({ mine }) {
  const at = { h: 4, sand: 0.4, grass: 0.1 };
  if (ask(mine, { ...at, chance: 0.1 }) !== 4) return { message: `${said({ ...at, chance: 0.1 })} is ${ask(mine, { ...at, chance: 0.1 })}: behind the beach, with chance below 0.2, a palm (4) grows, whatever the grass.` };
  if (ask(mine, { ...at, chance: 0.5 }) !== -1) return { message: `${said({ ...at, chance: 0.5 })} is ${ask(mine, { ...at, chance: 0.5 })}: about one spot in five takes a palm, when chance is below 0.2.` };
  return null;
}
// More of what a wood wants never turns a tree into none.
function thicker({ mine }) {
  for (const k of ['grove', 'moist']) {
    for (const chance of [0.05, 0.2, 0.4, 0.6]) {
      let had = false;
      for (let x = 0; x <= 1.0001; x += 0.1) {
        const got = ask(mine, { [k]: x, chance });
        if (had && got === -1) return { message: `${said({ [k]: x, chance })} is no tree, though with a smaller ${k} one grew at the same chance. A deeper grove and wetter ground never grow fewer trees.` };
        had ||= got >= 0;
      }
    }
  }
  return null;
}
// Where the wood is thin: dry ground gets few trees, high ground fewer still.
function density({ mine }) {
  const share = (o) => { let n = 0; for (let k = 0; k < 400; k++) n += ask(mine, { ...o, chance: (k + 0.5) / 400 }) >= 0 ? 1 : 0; return n / 400; };
  const wet = share({ moist: 1, grove: 1, h: 30 }), dry = share({ moist: 0, grove: 1, h: 30 }), clearing = share({ grove: 0, h: 30 }), high = share({ moist: 1, grove: 1, h: 250 });
  if (wet < 0.5) return { message: `in a wet wood (grove 1, moist 1, h 30) ${show(wet)} of the spots grow a tree: at least half do.` };
  if (dry > 0.4 * wet) return { message: `dry ground (grove 1, moist 0) grows a tree at ${show(dry)} of its spots and wet ground at ${show(wet)}. The share is grove × (0.2 + 0.8 × moist), so dry ground grows at most about a quarter of the wet: the moisture counts four times as much as the base.` };
  if (clearing > 0) return { message: `a clearing (grove 0) still grows a tree at ${show(clearing)} of its spots; it should grow none.` };
  if (high > 0.4 * wet) return { message: `at 250 m, ${show(high)} of the spots grow a tree, against ${show(wet)} low down. The woods thin toward the heights, down to almost nothing by 210 m.` };
  return null;
}
function kinds({ mine }) {
  if (ask(mine, { moist: 0.1, h: 100, steep: 0.5, pick: 0.2, tall: -1 }) !== 1) return { message: `${said({ moist: 0.1, h: 100, steep: 0.5, pick: 0.2, tall: -1 })} is ${ask(mine, { moist: 0.1, h: 100, steep: 0.5, pick: 0.2, tall: -1 })}: dry, steep ground takes pines (1).` };
  if (ask(mine, { moist: 0.95, h: 10, steep: 0.02, pick: 0.8, tall: -1 }) !== 0) return { message: `${said({ moist: 0.95, h: 10, steep: 0.02, pick: 0.8, tall: -1 })} is ${ask(mine, { moist: 0.95, h: 10, steep: 0.02, pick: 0.8, tall: -1 })}: wet, low, level ground takes broadleaf trees (0).` };
  const cypress = { tall: 0.6, h: 40, pick: 0.2, moist: 0.8 };
  if (ask(mine, cypress) !== 2) return { message: `${said(cypress)} is ${ask(mine, cypress)}: where the second noise (tall) is above 0.25, below 110 m, cypresses (2) gather when pick is low.` };
  if (ask(mine, { ...cypress, h: 160 }) === 2) return { message: `${said({ ...cypress, h: 160 })} is a cypress above 110 m.` };
  if (ask(mine, { ...cypress, tall: -0.2 }) === 2) return { message: `${said({ ...cypress, tall: -0.2 })} is a cypress where tall is low: cypresses gather only where the second noise is above 0.25.` };
  return null;
}

// ------------------------------------------------------------------ bucket

// A list of things: random places and a chance number each, so plots hold different counts.
export function thingList(n, seed) {
  const r = stream(seed);
  const list = [];
  for (let k = 0; k < n; k++) list.push((r() - 0.5) * 2048 * 0.98, r() * 5, (r() - 0.5) * 2048 * 0.98, 1 + r(), 1, 0, r(), r());
  return list;
}
const clampPlot = (v) => Math.min(PLOTS - 1, Math.max(0, Math.floor((v + HALF) / PLOT)));
const plotOf = (x, z) => clampPlot(z) * PLOTS + clampPlot(x);

function bucketShape({ mine }) {
  for (const list of [thingList(500, 3), thingList(1, 4), []]) {
    const before = list.slice();
    const out = mine.call('bucket', list);
    if (list.some((v, i) => v !== before[i])) return { message: 'bucket changed the list it was given: build a new one.' };
    if (!out || Object.prototype.toString.call(out.data) !== '[object Float32Array]' || Object.prototype.toString.call(out.start) !== '[object Uint32Array]') return { message: 'bucket must return { data, start }: a Float32Array of the things in their new order and a Uint32Array saying where each plot starts.' };
    if (out.data.length !== list.length) return { message: `bucket returned ${out.data.length / 8} things for ${list.length / 8}: every thing is kept.` };
    if (out.start.length !== PLOTS * PLOTS + 1) return { message: `bucket's start has ${out.start.length} numbers; ${PLOTS * PLOTS} plots need ${PLOTS * PLOTS + 1}, one more than the plots, so the end of the last is there.` };
    if (out.start[0] !== 0 || out.start[PLOTS * PLOTS] !== list.length / 8) return { message: `bucket's start runs from ${out.start[0]} to ${out.start[PLOTS * PLOTS]}; it must run from 0 to the number of things, ${list.length / 8}.` };
    for (let c = 0; c < PLOTS * PLOTS; c++) if (out.start[c + 1] < out.start[c]) return { message: `bucket's start goes down at plot ${c}: ${out.start[c]} then ${out.start[c + 1]}. Each plot starts where the one before ends.` };
    // Same things, as a set: compare sorted rows as text.
    const rows = (a) => Array.from({ length: a.length / 8 }, (_, i) => Array.from({ length: 8 }, (_, k) => Math.fround(a[i * 8 + k])).join()).sort();
    if (rows(Float32Array.from(list)).join(';') !== rows(out.data).join(';')) return { message: 'bucket lost, copied or changed a thing: the same things must come back, in another order.' };
  }
  return null;
}
function bucketPlots({ mine }) {
  const list = thingList(3000, 5);
  const { data, start } = mine.call('bucket', list);
  for (let c = 0; c < PLOTS * PLOTS; c++) for (let i = start[c]; i < start[c + 1]; i++) {
    const want = plotOf(data[i * 8], data[i * 8 + 2]);
    if (want !== c) return { message: `thing ${i} stands at x ${show(data[i * 8])}, z ${show(data[i * 8 + 2])}, in plot ${want} (its z ÷ 64 is the row, its x ÷ 64 the column), and bucket put it in plot ${c}. Row is from z and column from x: plot = row × 32 + column.` };
  }
  // Things beyond the map's edge belong to the edge plots.
  const out = mine.call('bucket', [-2000, 0, -2000, 1, 1, 0, 0, 0.5, 2000, 0, 2000, 1, 1, 0, 0, 0.5]);
  if (out.start[1] !== 1 || out.start[PLOTS * PLOTS] - out.start[PLOTS * PLOTS - 1] !== 1) return { message: 'a thing outside the map must go in the nearest plot at its edge: clamp the plot numbers to 0 and 31.' };
  return null;
}
// Inside a plot, the first things are an even thinning of it. Order by chance, either way, is one; so is any other
// shuffle that does not lean. What fails is an order that keeps one side of every plot.
export function lean(data, start, share, axis) {
  let sum = 0, n = 0;
  for (let c = 0; c < PLOTS * PLOTS; c++) {
    const count = start[c + 1] - start[c], m = Math.ceil(count * share);
    if (!m || !count) continue;
    let kept = 0, all = 0;
    for (let i = start[c]; i < start[c + 1]; i++) { const v = data[i * 8 + axis]; all += v; if (i < start[c] + m) kept += v; }
    sum += kept / m - all / count;
    n++;
  }
  return sum / n / PLOT;
}
function bucketOrder({ mine }) {
  // The page makes its lists row by row across the island; the order that a fair thinning has to undo.
  const made = thingList(6000, 8);
  const rows = Array.from({ length: made.length / 8 }, (_, i) => made.slice(i * 8, i * 8 + 8)).sort((a, b) => a[2] - b[2] || a[0] - b[0]).flat();
  const { data, start } = mine.call('bucket', rows);
  for (const [axis, way] of [[2, 'north to south'], [0, 'east to west']]) {
    for (const share of [0.5, 0.25]) {
      const off = lean(data, start, share, axis);
      if (Math.abs(off) > 0.06) return { message: `drawing the first ${share === 0.5 ? 'half' : 'quarter'} of every plot keeps things that stand ${show(Math.abs(off))} of a plot to one side (${way}), not spread over it. The list was made row by row, so a plot left in that order is bare on one side when thinned: shuffle each plot, by its things' chance numbers, before drawing a prefix.` };
    }
  }
  return null;
}
function bucketEven({ mine }) {
  const a = mine.call('bucket', thingList(400, 11)), b = mine.call('bucket', thingList(400, 11));
  if (a.data.some((v, i) => v !== b.data[i]) || a.start.some((v, i) => v !== b.start[i])) return { message: 'bucket gave a different order the second time for the same list.' };
  return null;
}

function rule({ mine, course }) {
  mine.call('whichTree', 30, 0.9, 0.6, 0, 0.1, 1, 0, 0.1, 0.5); // stops here with "not written yet"
  mine.call('bucket', []);
  const message = ruleFault(landPath(mine.source, 6, course.names));
  return message ? { message } : null;
}

// The whole island, grown and planted with the learner's two functions.
export const TREES_ENOUGH = 3000;
function forest({ mine }) {
  const l = layout(mine, 7);
  const lists = place(mine, l, 7);
  const trees = [0, 1, 2, 4].map((k) => lists[k].length / 8);
  const total = trees.reduce((a, b) => a + b, 0);
  if (total < TREES_ENOUGH) return { message: `seed 7 has ${total.toLocaleString('en-US')} trees with your whichTree; about 7,700 stand in stage 6, and at least ${TREES_ENOUGH.toLocaleString('en-US')} are needed for a forest.` };
  if (total > 30000) return { message: `seed 7 has ${total.toLocaleString('en-US')} trees with your whichTree: more than the 30,000 a phone can draw. The woods thin out with height, dry ground and clearings.` };
  const missing = [0, 1, 2, 4].filter((k) => lists[k].length === 0);
  if (missing.length) return { message: `seed 7 has no ${missing.map((k) => ['broadleaf', 'pine', 'cypress', '', 'palm'][k]).join(' and no ')} with your whichTree: an island has all four.` };
  return null;
}

// ------------------------------------------------------------------ kiosks (new application)

export const KIOSK = { low: 1.2, high: 4, sandLeast: 0.5, steepMost: 0.1, share: 0.25 };
function kioskWhere({ map }) {
  const r = stream(8);
  for (let k = 0; k < 4000; k++) {
    const h = -3 + r() * 30, sand = r(), steep = r() * 0.6, chance = r();
    const got = map.call('kioskAt', h, sand, steep, chance);
    if (typeof got !== 'boolean') return { message: `kioskAt(${show(h)}, ${show(sand)}, ${show(steep)}, ${show(chance)}) returned ${got}: true or false is needed.` };
    const good = h > KIOSK.low && h < KIOSK.high && sand > KIOSK.sandLeast && steep < KIOSK.steepMost;
    if (got && !good) return { message: `kioskAt(${show(h)}, ${show(sand)}, ${show(steep)}, ${show(chance)}) puts a kiosk where it does not belong: only on dry sand, ${KIOSK.low} to ${KIOSK.high} m up, at least ${KIOSK.sandLeast} sand, no steeper than ${KIOSK.steepMost}.` };
  }
  return null;
}
function kioskShare({ map }) {
  let n = 0;
  for (let k = 0; k < 2000; k++) n += map.call('kioskAt', 2.5, 0.9, 0.03, (k + 0.5) / 2000) ? 1 : 0;
  const share = n / 2000;
  if (Math.abs(share - KIOSK.share) > 0.03) return { message: `on good sand, kioskAt says yes at ${show(share)} of the spots; about one in four, ${KIOSK.share}, is asked.` };
  return null;
}
function kioskRule({ map, scriptSource }) {
  map.call('kioskAt', 2.5, 0.9, 0.03, 0.1); // stops here with "not written yet"
  const message = ruleFault(declarations(scriptSource));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '6.tree-kinds', part: 'contract', uses: ['whichTree'], title: 'a tree is a known kind, and stands only where its rule allows', run: treeKinds },
  { id: '6.tree-palms', part: 'contract', uses: ['whichTree'], title: 'palms behind the beach, about one spot in five', run: palms },
  { id: '6.tree-thicker', part: 'contract', uses: ['whichTree'], title: 'a deeper grove or wetter ground never grows fewer trees', run: thicker },
  { id: '6.tree-density', part: 'contract', uses: ['whichTree'], title: 'thick in wet groves, thin on dry ground, gone toward the heights', run: density },
  { id: '6.tree-choice', part: 'contract', uses: ['whichTree'], title: 'pine on dry steep ground, broadleaf on wet ground, cypress where they gather', run: kinds },
  { id: '6.bucket-shape', part: 'contract', uses: ['bucket'], title: 'bucket returns every thing, in a Float32Array, with a start for every plot', run: bucketShape },
  { id: '6.bucket-plots', part: 'contract', uses: ['bucket'], title: 'every thing stands in its own plot', run: bucketPlots },
  { id: '6.bucket-order', part: 'contract', uses: ['bucket'], title: 'the first part of a plot is an even thinning of it', run: bucketOrder },
  { id: '6.bucket-steady', part: 'contract', uses: ['bucket'], title: 'the same list gives the same order', run: bucketEven },
  { id: '6.forest', part: 'contract', uses: ['whichTree', 'bucket'], title: 'seed 7 gets a forest: all four trees, between 3,000 and 30,000', run: forest },
  { id: '6.rule', part: 'contract', uses: ['whichTree', 'bucket'], title: 'everything that shapes the land keeps the determinism rule', run: rule },
  { id: '6.kiosk-where', part: 'application', uses: ['kioskAt'], title: 'kiosks stand only on dry level sand', run: kioskWhere },
  { id: '6.kiosk-share', part: 'application', uses: ['kioskAt'], title: 'about one good spot in four takes a kiosk', run: kioskShare },
  { id: '6.kiosk-rule', part: 'application', uses: ['kioskAt'], title: 'kiosk.js keeps the determinism rule', run: kioskRule },
];

export function note({ mine, course }) {
  const r = stream(40);
  let differ = 0;
  for (let k = 0; k < 2000; k++) { const a = [-4 + r() * 260, r(), r(), r(), r(), r(), r() * 2 - 1, r(), r()]; if (mine.call('whichTree', ...a) !== course.call('whichTree', ...a)) differ++; }
  const lines = [differ ? `whichTree differs from stage 6's on ${differ} of 2,000 spots (another correct rule would too)` : 'whichTree matches stage 6\'s on all 2,000 spots'];
  const list = thingList(2000, 41);
  const a = mine.call('bucket', list.slice()), b = course.call('bucket', list.slice());
  const same = a.data.every((v, i) => v === b.data[i]) && a.start.every((v, i) => v === b.start[i]);
  lines.push(same ? 'bucket matches stage 6\'s order' : 'bucket\'s order differs from stage 6\'s (ties between equal chances may break differently)');
  return lines;
}
