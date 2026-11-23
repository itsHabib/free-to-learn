// Lesson 5 checks: depositOrCut in project/world-05.html, and screeAt in project/scree.js.
// The contract and the new application are required. The comparison with stage 5 is a note, never a failure.
import { landPath, ruleFault, declarations } from './rule.mjs';
import { stream } from './geometry.mjs';

export const title = 'Erosion and ground';
const N = 512;
const show = (v) => String(+v.toPrecision(4));
const MID = 200 * N + 200; // a cell far from every edge

// A level patch of ground and an empty record, kept between calls because they are large, and what one call of the
// learner's function did to them. The whole grid is searched for changes far from the drop on the first calls only.
const GROUND = new Float32Array(N * N).fill(50);
const RECORD = new Float32Array(N * N * 3);
const WIDE = 6;
function call1(mine, { u, v, fall, speed, water, soil }, whole = false) {
  const H = GROUND, E = RECORD;
  const after = mine.call('depositOrCut', H, E, MID, u, v, fall, speed, water, soil);
  const moved = [];
  let touched = 0;
  const [worn, laid, wet] = [E[MID * 3], E[MID * 3 + 1], E[MID * 3 + 2]];
  for (let y = -WIDE; y <= WIDE; y++) for (let x = -WIDE; x <= WIDE; x++) {
    const i = MID + y * N + x;
    if (H[i] !== 50) { moved.push([x, y, H[i] - 50]); H[i] = 50; }
    for (let k = 0; k < 3; k++) if (E[i * 3 + k] !== 0) { touched++; E[i * 3 + k] = 0; }
  }
  let stray = false;
  if (whole) {
    for (let i = 0; i < N * N; i++) if (H[i] !== 50) { stray = true; H[i] = 50; }
    for (let i = 0; i < E.length; i++) if (E[i] !== 0) { touched++; E[i] = 0; }
  }
  return { after, moved, stray, sum: moved.reduce((s, m) => s + m[2], 0), worn, laid, water: wet, touched };
}
const at = (c) => `depositOrCut with u ${show(c.u)}, v ${show(c.v)}, fall ${show(c.fall)}, speed ${show(c.speed)}, water ${show(c.water)}, soil ${show(c.soil)}`;

// Cases over every kind of step: fast and slow, full and empty, downhill, level and uphill.
export function dropCases(count = 400, seed = 4) {
  const r = stream(seed);
  const out = [];
  for (let k = 0; k < count; k++) {
    const kind = k % 4;
    out.push({ u: r(), v: r(), fall: kind === 0 ? -r() * 3 : kind === 1 ? r() * 0.05 : r() * 4, speed: 0.2 + r() * 4, water: 0.3 + r() * 0.7, soil: kind === 2 ? r() * 0.4 : r() * 6 });
  }
  return out;
}

function finite(mine, c, whole = false) {
  const r = call1(mine, c, whole);
  if (typeof r.after !== 'number' || !Number.isFinite(r.after)) return { r, message: `${at(c)} returned ${r.after}: it must return the soil the drop carries afterwards, a finite number.` };
  return { r };
}

// Soil carried plus soil in the ground stays the same in one call: what the ground gives up the drop carries.
function ledger({ mine }) {
  for (const [k, c] of dropCases().entries()) {
    const { r, message } = finite(mine, c, k < 8);
    if (message) return { message };
    if (r.stray) return { message: `${at(c)} changed ground more than six cells from the drop.` };
    const off = r.sum + (r.after - c.soil);
    if (Math.abs(off) > 2e-3) {
      const verb = r.after > c.soil ? 'The drop took' : 'The drop laid';
      return { message: `${at(c)}: the ground changed by ${show(r.sum)} in all and the drop's soil by ${show(r.after - c.soil)}. ${verb} ${show(Math.abs(r.after - c.soil))}, so the ground must change by the opposite: nothing is made or lost in one call, and the totals differ by ${show(Math.abs(off))}.` };
    }
  }
  return null;
}

function soilFault({ mine }) {
  for (const c of dropCases()) {
    const { r, message } = finite(mine, c);
    if (message) return { message };
    if (r.after < -1e-6) return { message: `${at(c)} leaves ${show(r.after)} soil: a drop cannot lay down more than it carries. Uphill, it lays the smaller of the rise and what it has.` };
    if (c.fall >= 0 && r.after > c.soil && r.after - c.soil > c.fall + 1e-4) return { message: `${at(c)} takes ${show(r.after - c.soil)} from the ground where the way ahead falls only ${show(c.fall)}. That digs below the next point, so the drop makes a pit it cannot leave: cut no more than the fall.` };
  }
  return null;
}

function uphill({ mine }) {
  for (const c of dropCases(1200, 9).filter((x) => x.fall < 0)) {
    const { r, message } = finite(mine, c);
    if (message) return { message };
    const laid = c.soil - r.after;
    const most = Math.min(-c.fall, c.soil);
    if (laid > most + 1e-4) return { message: `${at(c)} lays ${show(laid)}: the way ahead rises ${show(-c.fall)}, so ${show(most)} is enough to level it, and more builds a mound. Uphill a drop lays the smaller of the rise and its soil.` };
    if (laid < most - 1e-4) return { message: `${at(c)} lays ${show(laid)} where it should lay ${show(most)}, the smaller of the rise and its soil: the rise stays, and the drop is stuck behind it.` };
  }
  return null;
}

// Where the ground changes: laid soil lies round the drop, its centre where the drop is; dug ground is a broad,
// even brush round the cell.
function place({ mine }) {
  const r0 = stream(5);
  for (let k = 0; k < 60; k++) {
    const c = { u: 0.05 + 0.9 * r0(), v: 0.05 + 0.9 * r0(), fall: -1.5, speed: 1, water: 1, soil: 1 + r0() * 3 };
    const { r, message } = finite(mine, c);
    if (message) return { message };
    if (r.sum <= 0) continue;
    const cx = r.moved.reduce((s, m) => s + m[0] * m[2], 0) / r.sum, cy = r.moved.reduce((s, m) => s + m[1] * m[2], 0) / r.sum;
    if (Math.abs(cx - c.u) > 1e-2 || Math.abs(cy - c.v) > 1e-2) return { message: `${at(c)}: the laid soil centres on (${show(cx)}, ${show(cy)}) in the cell, and the drop is at (${show(c.u)}, ${show(c.v)}). Each corner's share is how near the drop is to it: (1 - u) and (1 - v) for the first corner, u along x and v down, so the soil lies where the drop is.` };
  }
  const c = { u: 0.3, v: 0.6, fall: 2.5, speed: 3, water: 1, soil: 0 };
  const { r, message } = finite(mine, c);
  if (message) return { message };
  if (r.sum >= 0) return { message: `${at(c)} should cut into the ground: the drop is fast, the ground falls away, and it carries nothing.` };
  const cells = r.moved.filter((m) => m[2] < -1e-6).length;
  if (cells < 9) return { message: `${at(c)} digs at ${cells} ${cells === 1 ? 'cell' : 'cells'}. Cutting only where the drop stands makes a narrow pit; the brush spreads it over the cells within 2.4, at least 9 of them.` };
  const cx = r.moved.reduce((s, m) => s + m[0] * m[2], 0) / r.sum, cy = r.moved.reduce((s, m) => s + m[1] * m[2], 0) / r.sum;
  if (Math.abs(cx) > 0.01 || Math.abs(cy) > 0.01) return { message: `${at(c)}: the dug ground centres on (${show(cx)}, ${show(cy)}) from the cell. The brush is even all round: use the cell the drop starts in, i + BRUSH[k].` };
  const deepest = r.moved.reduce((a, m) => (m[2] < a[2] ? m : a), r.moved[0]);
  if (Math.abs(deepest[0]) + Math.abs(deepest[1]) > 0) return { message: `${at(c)}: the deepest cut is at (${deepest[0]}, ${deepest[1]}) from the cell. The brush digs most where the drop stands and less further out.` };
  return null;
}

// How much a drop may carry: more when it is faster, fuller, or on steeper ground.
function room({ mine }) {
  for (const k of ['speed', 'water', 'fall']) {
    for (const soil of [0, 0.5, 2]) {
      let last = -Infinity;
      for (const x of [0.05, 0.1, 0.3, 0.6, 1, 1.5, 2.2, 3, 4]) {
        const c = { u: 0.4, v: 0.5, fall: 1, speed: 1.5, water: 0.8, soil, [k]: x };
        const { r, message } = finite(mine, c);
        if (message) return { message };
        if (r.after < last - 1e-4) return { message: `${at(c)} leaves ${show(r.after)} soil, less than with a smaller ${k} (${show(last)}). Faster, fuller and steeper water carries more: capacity is max(fall, 0.02) × speed × water × CARRY.` };
        last = r.after;
      }
    }
  }
  // Nearly flat ground keeps a little capacity, and a drop over capacity lays only part of the excess.
  const c = { u: 0.5, v: 0.5, fall: 0.001, speed: 1, water: 1, soil: 2 };
  const { r, message } = finite(mine, c);
  if (message) return { message };
  if (r.after > 1.99) return { message: `${at(c)} lays nothing: it carries ${show(c.soil)} where the ground is almost flat, far over what it may carry.` };
  if (r.after < 0.5) return { message: `${at(c)} lays ${show(c.soil - r.after)} at once. Over capacity a drop lays only part of the excess (SETTLE of it), so it spreads a little over many steps instead of making a mound.` };
  return null;
}

function record({ mine }) {
  for (const [k, c] of dropCases(200, 12).entries()) {
    const { r, message } = finite(mine, c, k < 8);
    if (message) return { message };
    const taken = Math.max(0, r.after - c.soil), laid = Math.max(0, c.soil - r.after);
    if (Math.abs(r.worn - taken) > 1e-3 || Math.abs(r.laid - laid) > 1e-3) return { message: `${at(c)}: E records ${show(r.worn)} worn and ${show(r.laid)} laid at the drop's cell; it took ${show(taken)} and laid ${show(laid)}. E[i * 3] collects what is worn and E[i * 3 + 1] what is laid; the ground cover reads them.` };
    if (r.water !== 0) return { message: `${at(c)} wrote to E[i * 3 + 2], the water that passed; dropStep records that.` };
    if (r.touched > 1) return { message: `${at(c)} wrote to ${r.touched} places of E. It records at the drop's own cell only.` };
  }
  return null;
}

// Rain on the whole island: how many pits it leaves, and no wild ground.
export const PITS_MOST = 450; // stage 5 leaves 236 for seed 7; digging at one cell leaves about 2,500
export function countPits(H) {
  let p = 0;
  for (let y = 4; y < N - 4; y++) for (let x = 4; x < N - 4; x++) {
    const i = y * N + x;
    if (H[i] < 3) continue;
    let low = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) low = Math.min(low, H[i + a * N + b]);
    if (H[i] < low - 0.05) p++;
  }
  return p;
}
export function rainIsland(world, seed = 7, drops = 70000) {
  const P = world.call('islandParams', seed);
  const H = world.call('fillLand', new Float32Array(N * N), P);
  const E = new Float32Array(N * N * 3);
  world.call('erode', H, E, drops, world.call('hash2', seed, 5, 9));
  return { H, E };
}
function rain({ mine }) {
  const { H } = rainIsland(mine);
  let low = Infinity, high = -Infinity;
  for (const h of H) { if (!Number.isFinite(h)) return { message: `after 70,000 drops a height is ${h}.` }; low = Math.min(low, h); high = Math.max(high, h); }
  const pits = countPits(H);
  if (pits > PITS_MOST) return { message: `after 70,000 drops on seed 7 there are ${pits.toLocaleString('en-US')} pits (a cell lower than all eight round it); stage 5 leaves 236, and at most ${PITS_MOST} is allowed. Pits instead of gullies come from digging in one place, or from laying too much where a drop turns uphill.` };
  if (low < -60 || high > 400) return { message: `after 70,000 drops on seed 7 the island runs from ${show(low)} m to ${show(high)} m. Drops have dug or piled without limit: cut no more than the fall, and lay no more than the rise.` };
  return null;
}

function rule({ mine, course }) {
  mine.call('depositOrCut', new Float32Array(N * N).fill(10), new Float32Array(N * N * 3), MID, 0.5, 0.5, 1, 1, 1, 0); // stops here with "not written yet"
  const message = ruleFault(landPath(mine.source, 5, course.names));
  return message ? { message } : null;
}
function steady({ mine }) {
  for (const c of dropCases(60, 21)) { const a = call1(mine, c), b = call1(mine, c); if (a.after !== b.after || a.sum !== b.sum) return { message: `${at(c)} gave ${show(a.after)} the first time and ${show(b.after)} the second.` }; }
  return null;
}

// ------------------------------------------------------------------ scree (new application)

export const SCREE = { level: 0.08, cliff: 0.6, low: 20, band: [0.3, 120], least: 0.8, stepMost: 0.16 };
const scree = (map, h, steep) => map.call('screeAt', h, steep);

function screeRange({ map }) {
  for (let h = -20; h <= 300; h += 4) for (let s = 0; s <= 1; s += 0.02) {
    const v = scree(map, h, s);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return { message: `screeAt(${h}, ${show(s)}) returned ${v}: it must be a number from 0 to 1.` };
    if (s <= SCREE.level && v > 0) return { message: `screeAt(${h}, ${show(s)}) is ${show(v)} on ground that is nearly level (steep ${SCREE.level} or less). Loose stone rolls off flat ground: it lies there as 0.` };
    if (s >= SCREE.cliff && v > 0) return { message: `screeAt(${h}, ${show(s)}) is ${show(v)} on a cliff (steep ${SCREE.cliff} or more). Loose stone does not stay on a wall.` };
    if (h <= SCREE.low && v > 0) return { message: `screeAt(${h}, ${show(s)}) is ${show(v)} below ${SCREE.low} m: that is grass and beach.` };
  }
  return null;
}
function screeBand({ map }) {
  const [s, h] = SCREE.band;
  const v = scree(map, h, s);
  if (!(v >= SCREE.least)) return { message: `screeAt(${h}, ${s}) is ${show(v)}: at ${h} m, on a slope of ${s}, is where scree gathers, and it must be at least ${SCREE.least}.` };
  let last = -1;
  for (let height = SCREE.low; height <= h; height += 2) { const x = scree(map, height, s); if (x < last - 1e-6) return { message: `screeAt(${height}, ${s}) is ${show(x)}, less than lower down (${show(last)}): scree thickens upward, up to ${h} m.` }; last = x; }
  return null;
}
function screeSmooth({ map }) {
  for (let h = 20; h <= 260; h += 10) for (let s = 0; s < 1; s += 0.01) {
    const a = scree(map, h, s), b = scree(map, h, s + 0.01);
    if (Math.abs(a - b) > SCREE.stepMost) return { message: `screeAt changes by ${show(Math.abs(a - b))} between steep ${show(s)} and ${show(s + 0.01)} at ${h} m. A rule that jumps draws a ruled line on the hill: ease in and out.` };
  }
  for (let h = 20; h < 260; h++) for (const s of [0.15, 0.3, 0.45]) { const d = Math.abs(scree(map, h, s) - scree(map, h + 1, s)); if (d > SCREE.stepMost) return { message: `screeAt changes by ${show(d)} between ${h} m and ${h + 1} m at steep ${s}. It must ease along the height too.` }; }
  return null;
}
function screeRule({ map, scriptSource }) {
  map.call('screeAt', 100, 0.3); // stops here with "not written yet"
  const message = ruleFault(declarations(scriptSource));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '5.drop-ledger', part: 'contract', uses: ['depositOrCut'], title: 'in one call, what the ground gives up the drop carries', run: ledger },
  { id: '5.drop-soil', part: 'contract', uses: ['depositOrCut'], title: 'a drop never lays more than it has, or cuts deeper than the fall', run: soilFault },
  { id: '5.drop-uphill', part: 'contract', uses: ['depositOrCut'], title: 'uphill, it lays the smaller of the rise and its soil', run: uphill },
  { id: '5.drop-place', part: 'contract', uses: ['depositOrCut'], title: 'soil lies where the drop is, and cutting is a broad brush', run: place },
  { id: '5.drop-room', part: 'contract', uses: ['depositOrCut'], title: 'faster, fuller, steeper water carries more', run: room },
  { id: '5.drop-record', part: 'contract', uses: ['depositOrCut'], title: 'E records what was worn and what was laid', run: record },
  { id: '5.drop-steady', part: 'contract', uses: ['depositOrCut'], title: 'the same step gives the same result', run: steady },
  { id: '5.rain', part: 'contract', uses: ['depositOrCut'], title: 'rain on the island leaves gullies, not pits', run: rain },
  { id: '5.rule', part: 'contract', uses: ['depositOrCut'], title: 'everything that shapes the land keeps the determinism rule', run: rule },
  { id: '5.scree-range', part: 'application', uses: ['screeAt'], title: 'scree from 0 to 1, none on the level, on cliffs or low down', run: screeRange },
  { id: '5.scree-band', part: 'application', uses: ['screeAt'], title: 'most on slopes of 0.3 near 120 m, thickening upward', run: screeBand },
  { id: '5.scree-smooth', part: 'application', uses: ['screeAt'], title: 'it eases in and out, with no jump', run: screeSmooth },
  { id: '5.scree-rule', part: 'application', uses: ['screeAt'], title: 'scree.js keeps the determinism rule', run: screeRule },
];

export function note({ mine, course }) {
  // What a step returns, what it does to the ground, and what it writes in the record are compared apart.
  const cases = dropCases(300, 31);
  const ground = (r) => new Map(r.moved.map(([x, y, d]) => [`${x},${y}`, d]));
  let soil = 0, land = 0, record = 0;
  for (const c of cases) {
    const a = call1(mine, c), b = call1(course, c);
    if (Math.abs(a.after - b.after) > 1e-9) soil++;
    const ga = ground(a), gb = ground(b);
    if ([...new Set([...ga.keys(), ...gb.keys()])].some((k) => Math.abs((ga.get(k) ?? 0) - (gb.get(k) ?? 0)) > 1e-6)) land++;
    if (Math.abs(a.worn - b.worn) > 1e-6 || Math.abs(a.laid - b.laid) > 1e-6) record++;
  }
  const lines = [`depositOrCut on 300 steps, against stage 5's: ${[['the soil returned', soil], ['the ground it leaves', land], ['the record in E', record]].map(([what, n]) => `${what} ${n ? `differs on ${n}` : 'matches on all'}`).join('; ')}`];
  const a = rainIsland(mine, 7, 2000), b = rainIsland(course, 7, 2000);
  const h = a.H.reduce((k, v, i) => k + (Math.abs(v - b.H[i]) > 1e-6 ? 1 : 0), 0);
  lines.push(h ? `after 2,000 drops ${h.toLocaleString('en-US')} of ${(N * N).toLocaleString('en-US')} heights differ from stage 5's (another correct rule's would too)` : 'after 2,000 drops every height matches stage 5\'s');
  return lines;
}
