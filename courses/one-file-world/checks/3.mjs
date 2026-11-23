// Lesson 3 checks: dayAngle and skyKeys in project/world-03.html, and moonKeys in project/moon.js.
// The contract and the new application are required. The comparison with stage 3 is a note, never a failure.
import { landPath, ruleFault } from './rule.mjs';
import { stream } from './geometry.mjs';

export const title = 'Light and distance';
const TURN = 2 * Math.PI;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const ROW = 7; // a row of SKY_KEYS: height, three overhead, three at the horizon
const rgb = (S) => [8, 9, 10, 12, 13, 14].map((i) => S[i]);
const WHERE = ['red overhead', 'green overhead', 'blue overhead', 'red at the horizon', 'green at the horizon', 'blue at the horizon'];
const show = (v) => String(+v.toPrecision(5));

// ------------------------------------------------------------------ dayAngle

// The tables are the file's own, so that a second world with its own colours and hours is judged on them.
function rowsOf(world, name, size) {
  const K = world.get(name);
  if (!K || K.length % size || K.length < 2 * size || !Array.from(K).every(Number.isFinite)) throw Error(`${name} must hold rows of ${size} numbers, at least two`);
  const rows = Array.from({ length: K.length / size }, (_, i) => Array.from(K.slice(i * size, i * size + size)));
  if (rows.some((r, i) => i && r[0] <= rows[i - 1][0])) throw Error(`${name} must rise from row to row`);
  return rows;
}
const dayRows = (world) => rowsOf(world, 'DAY_KEYS', 2);

function angleKeys({ mine }) {
  for (const [u, angle] of dayRows(mine).slice(0, -1)) { // the last key is the first, one turn later
    const got = mine.call('dayAngle', u);
    if (typeof got !== 'number' || !Number.isFinite(got)) return { message: `dayAngle(${u}) returned ${got}: it must return a finite number of radians.` };
    if (!near(got, angle, 1e-9)) return { message: `dayAngle(${u}) is ${show(got)}. DAY_KEYS has a key at ${u}, so the angle there is exactly that key's, ${angle}.` };
  }
  return null;
}

function angleBetween({ mine }) {
  const rows = dayRows(mine);
  for (let i = 0; i < rows.length - 1; i++) {
    const [[u0, a0], [u1, a1]] = [rows[i], rows[i + 1]];
    let last = a0;
    for (let s = 1; s <= (i < rows.length - 2 ? 40 : 39); s++) { // u 1 itself is the next day's 0
      const u = u0 + ((u1 - u0) * s) / 40;
      const got = mine.call('dayAngle', u);
      if (got < a0 - 1e-9 || got > a1 + 1e-9) return { message: `dayAngle(${show(u)}) is ${show(got)}. Between the keys at ${u0} and ${u1} the angle lies between theirs, ${a0} and ${a1}: check which two keys you found, and how far between them u is.` };
      if (got < last - 1e-12) return { message: `dayAngle goes backwards between ${u0} and ${u1}: the sun never turns back.` };
      if (got - last > (a1 - a0) / 8) return { message: `dayAngle jumps by ${show(got - last)} near u ${show(u)}: between two keys the angle moves evenly, so the sun does not skip.` };
      last = got;
    }
  }
  return null;
}

function angleWraps({ mine }) {
  const same = (a, b) => { const d = (((a - b) % TURN) + TURN) % TURN; return Math.min(d, TURN - d) < 1e-3; };
  for (const u of [0.1, 0.25, 0.5, 0.87]) {
    for (const days of [1, -1, 12, -7]) {
      const a = mine.call('dayAngle', u), b = mine.call('dayAngle', u + days);
      if (!Number.isFinite(b) || !same(a, b)) return { message: `dayAngle(${u + days}) is ${show(b)} and dayAngle(${u}) is ${show(a)}. The days repeat: only the fraction of u counts, below 0 too (u - Math.floor(u)).` };
    }
  }
  const end = mine.call('dayAngle', 1 - 1e-9), start = mine.call('dayAngle', 0);
  if (!same(end, start)) return { message: `dayAngle just before 1 is ${show(end)} and at 0 is ${show(start)}: the last moment of a day must meet the first of the next, a whole turn on.` };
  return null;
}

// ------------------------------------------------------------------ skyKeys (and moonKeys, for a table of its own)

const fresh = () => Float64Array.from({ length: 20 }, (_, i) => 100 + i);
const keyRows = (world) => rowsOf(world, 'SKY_KEYS', ROW);

function keysHit({ mine }) {
  for (const row of keyRows(mine)) {
    const S = fresh();
    mine.call('skyKeys', S, row[0]);
    const got = rgb(S);
    for (let c = 0; c < 6; c++) if (!near(got[c], row[1 + c], 1e-6)) return { message: `skyKeys(S, ${row[0]}): ${WHERE[c]} is ${show(got[c])}. SKY_KEYS has a row at ${row[0]} degrees, so it is exactly that row's, ${row[1 + c]}.` };
  }
  return null;
}

function keysEnds({ mine }) {
  const rows = keyRows(mine);
  for (const [h, row] of [[-16, rows[0]], [-60, rows[0]], [44, rows.at(-1)], [80, rows.at(-1)]]) {
    const S = fresh();
    mine.call('skyKeys', S, h);
    const got = rgb(S);
    for (let c = 0; c < 6; c++) if (!near(got[c], row[1 + c], 1e-6)) return { message: `skyKeys(S, ${h}): ${WHERE[c]} is ${show(got[c])}. Outside the table the nearest row holds, the one at ${row[0]} degrees: ${row[1 + c]}. A sky that goes on past its last key turns black or too bright.` };
  }
  return null;
}

// Halfway between two rows the blend is halfway between their numbers, however the blend eases in and out.
function midFault(call, rows, name) {
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = [rows[i], rows[i + 1]];
    const S = fresh();
    call(S, (a[0] + b[0]) / 2);
    const got = rgb(S);
    for (let c = 0; c < 6; c++) {
      const half = (a[1 + c] + b[1 + c]) / 2;
      if (near(got[c], half, 2e-4 + 0.01 * Math.abs(a[1 + c] - b[1 + c]))) continue;
      const encoded = ((a[1 + c] ** (1 / 2.2) + b[1 + c] ** (1 / 2.2)) / 2);
      const at = `${name}(S, ${(a[0] + b[0]) / 2}), halfway between the rows at ${a[0]} and ${b[0]} degrees: ${WHERE[c]} is ${show(got[c])}, not halfway between ${a[1 + c]} and ${b[1 + c]}, ${show(half)}.`;
      if (near(got[c], encoded, 2e-3)) return `${at} That is the blend of the display values, left unconverted: the colours must be blended as linear light, and the shader applies the display curve afterwards, once.`;
      if (near(got[c], encoded ** 2.2, 1e-3)) return `${at} That is the blend of the display values, converted back: too dark between keys, which shows as a dull band at dusk. Blend the linear numbers themselves.`;
      return at;
    }
  }
  return null;
}
function keysBlend({ mine }) {
  const message = midFault((S, h) => mine.call('skyKeys', S, h), keyRows(mine), 'skyKeys');
  return message ? { message } : null;
}

function keysBetween({ mine }) {
  const rows = keyRows(mine);
  for (let i = 0; i < rows.length - 1; i++) {
    const [a, b] = [rows[i], rows[i + 1]];
    let last = a.slice(1);
    for (let s = 1; s <= 60; s++) {
      const h = a[0] + ((b[0] - a[0]) * s) / 60;
      const S = fresh();
      mine.call('skyKeys', S, h);
      const got = rgb(S);
      for (let c = 0; c < 6; c++) {
        const lo = Math.min(a[1 + c], b[1 + c]) - 1e-6, hi = Math.max(a[1 + c], b[1 + c]) + 1e-6;
        if (!(got[c] >= lo && got[c] <= hi)) return { message: `skyKeys(S, ${show(h)}): ${WHERE[c]} is ${show(got[c])}, outside its two rows' ${a[1 + c]} and ${b[1 + c]}. Between the rows at ${a[0]} and ${b[0]} degrees every number lies between theirs: check which two rows you found.` };
        if (Math.abs(got[c] - last[c]) > (hi - lo) / 8 + 1e-6) return { message: `skyKeys jumps near ${show(h)} degrees: ${WHERE[c]} goes from ${show(last[c])} to ${show(got[c])} in one step of ${show((b[0] - a[0]) / 60)} degrees. The sky must change evenly, with no flash.` };
      }
      last = got;
    }
  }
  return null;
}

function writesOnly(call, name) {
  const r = stream(3);
  for (let k = 0; k < 40; k++) {
    const h = -20 + r() * 60;
    const S = fresh();
    const out = call(S, h);
    if (out !== S) return `${name} must return the S it was given.`;
    const other = Array.from(S).findIndex((v, i) => ![8, 9, 10, 12, 13, 14].includes(i) && v !== 100 + i);
    if (other >= 0) return `${name} wrote S[${other}]. It fills S[8], S[9], S[10] (overhead) and S[12], S[13], S[14] (horizon) and leaves the rest, which holds the light.`;
    const again = fresh();
    call(again, h);
    if (rgb(S).some((v, i) => v !== rgb(again)[i])) return `${name}(S, ${show(h)}) gave different colours the second time.`;
  }
  return null;
}
function keysWrites({ mine }) { const message = writesOnly((S, h) => mine.call('skyKeys', S, h), 'skyKeys'); return message ? { message } : null; }

function landRule({ mine, course }) { const message = ruleFault(landPath(mine.source, 3, course.names)); return message ? { message } : null; }

// ------------------------------------------------------------------ the moonlit key (new application)

export const MOON = { height: -16, night: -14, brighter: 1.5 };
const light = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; // how bright a linear colour looks

function moonAt(map, h) { const S = fresh(); map.call('moonKeys', S, h); return rgb(S); }

function moonKey({ map, course }) {
  const rows = keyRows(course);
  const moon = moonAt(map, MOON.height);
  if (moon.some((v) => !(v >= 0) || !Number.isFinite(v))) return { message: `moonKeys(S, ${MOON.height}) gives ${moon.map(show).join(', ')}: six numbers of 0 or more are needed.` };
  for (const [i, where] of [[0, 'overhead'], [3, 'at the horizon']]) {
    const c = moon.slice(i, i + 3), night = rows[0].slice(1 + i, 4 + i), dusk = rows[1].slice(1 + i, 4 + i);
    if (light(c) < MOON.brighter * light(night)) return { message: `the moonlit sky ${where}, at ${MOON.height} degrees, has brightness ${show(light(c))}; the night row has ${show(light(night))}, and moonlight is at least ${MOON.brighter} times that.` };
    if (light(c) >= light(dusk)) return { message: `the moonlit sky ${where}, at ${MOON.height} degrees, has brightness ${show(light(c))}, as bright as dusk's ${show(light(dusk))}: it is still night.` };
    if (!(c[2] > c[0] && c[2] > c[1])) return { message: `the moonlit sky ${where} is ${c.map(show).join(', ')}: blue must be the largest of the three.` };
  }
  return null;
}
// From the night row up: each row's own colours at its height, halfway colours halfway, and nothing outside the two
// rows between. The easing is the learner's choice, so it is not compared with skyKeys point by point.
function moonRest({ map, course }) {
  const rows = keyRows(course);
  const hint = `From the night row (${MOON.night} degrees) up the sky is as before: a longer table moves every row, so check where your search for the row stops.`;
  for (const row of [...rows, [44, ...rows.at(-1).slice(1)]]) {
    const got = moonAt(map, row[0]);
    const c = got.findIndex((v, i) => !near(v, row[1 + i], 1e-6));
    if (c >= 0) return { message: `moonKeys(S, ${row[0]}): ${WHERE[c]} is ${show(got[c])}, and skyKeys gives ${show(row[1 + c])}. ${hint}` };
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 1; k < 20; k++) {
      const h = rows[i][0] + ((rows[i + 1][0] - rows[i][0]) * k) / 20;
      const got = moonAt(map, h);
      const c = got.findIndex((v, n) => v < Math.min(rows[i][1 + n], rows[i + 1][1 + n]) - 1e-6 || v > Math.max(rows[i][1 + n], rows[i + 1][1 + n]) + 1e-6);
      if (c >= 0) return { message: `moonKeys(S, ${show(h)}): ${WHERE[c]} is ${show(got[c])}, outside the rows at ${rows[i][0]} and ${rows[i + 1][0]} degrees. ${hint}` };
    }
  }
  return null;
}
function moonBlend({ map, course }) {
  const rows = keyRows(course);
  const moonRow = [MOON.height, ...moonAt(map, MOON.height)];
  const message = midFault((S, h) => map.call('moonKeys', S, h), [moonRow, ...rows], 'moonKeys') ?? writesOnly((S, h) => map.call('moonKeys', S, h), 'moonKeys');
  if (message) return { message };
  const below = moonAt(map, -30);
  const c = below.findIndex((v, i) => !near(v, moonRow[1 + i], 1e-6));
  return c >= 0 ? { message: `moonKeys(S, -30): ${WHERE[c]} is ${show(below[c])}, not the moonlit row's ${show(moonRow[1 + c])}. Below the first row the first row holds.` } : null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '3.angle-keys', part: 'contract', uses: ['dayAngle'], title: 'at each key the angle is the key\'s', run: angleKeys },
  { id: '3.angle-between', part: 'contract', uses: ['dayAngle'], title: 'between two keys the angle moves evenly forward', run: angleBetween },
  { id: '3.angle-wraps', part: 'contract', uses: ['dayAngle'], title: 'days repeat, and the end of one meets the start of the next', run: angleWraps },
  { id: '3.sky-blend', part: 'contract', uses: ['skyKeys'], title: 'halfway between two rows is the halfway colour, in linear light', run: keysBlend },
  { id: '3.sky-keys', part: 'contract', uses: ['skyKeys'], title: 'at each row the sky is the row\'s', run: keysHit },
  { id: '3.sky-ends', part: 'contract', uses: ['skyKeys'], title: 'outside the table the nearest row holds', run: keysEnds },
  { id: '3.sky-between', part: 'contract', uses: ['skyKeys'], title: 'between two rows every number lies between theirs, with no jump', run: keysBetween },
  { id: '3.sky-writes', part: 'contract', uses: ['skyKeys'], title: 'skyKeys writes its six numbers, returns S, and gives the same twice', run: keysWrites },
  { id: '3.land-rule', part: 'contract', uses: [], title: 'everything that shapes the land still keeps the determinism rule', run: landRule },
  { id: '3.moon-key', part: 'application', uses: ['moonKeys'], title: 'at -16 degrees the sky is moonlit: blue, brighter than night, darker than dusk', run: moonKey },
  { id: '3.moon-rest', part: 'application', uses: ['moonKeys'], title: 'from -14 degrees up the sky is as before', run: moonRest },
  { id: '3.moon-blend', part: 'application', uses: ['moonKeys'], title: 'the blend is linear throughout, and below -16 degrees the moonlit row holds', run: moonBlend },
];

export function note({ mine, course }) {
  const lines = [];
  let differ = 0;
  for (let k = 0; k < 1000; k++) if (Math.abs(mine.call('dayAngle', k / 1000) - course.call('dayAngle', k / 1000)) > 1e-12) differ++;
  lines.push(differ ? `dayAngle differs from stage 3's on ${differ} of 1000 times of day` : 'dayAngle matches stage 3\'s on all 1000 times of day');
  differ = 0;
  for (let k = 0; k < 1000; k++) { const a = fresh(), b = fresh(), h = -20 + k * 0.065; mine.call('skyKeys', a, h); course.call('skyKeys', b, h); if (rgb(a).some((v, i) => Math.abs(v - rgb(b)[i]) > 1e-12)) differ++; }
  lines.push(differ ? `skyKeys differs from stage 3's at ${differ} of 1000 heights (a correct blend that eases another way would too)` : 'skyKeys matches stage 3\'s at all 1000 heights');
  const changed = ['DAY_KEYS', 'SKY_KEYS', 'skyState'].filter((n) => mine.text(n) !== course.text(n));
  lines.push(changed.length ? `${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from stage 3` : 'the keys and skyState match stage 3');
  return lines;
}
