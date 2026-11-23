// Lesson 8 checks: gullCall, soundMix and callEnvelope in project/world-08.html, and bellStrikes in project/bell.js.
// The contract and the new application are required. The comparison with stage 8 is a note, never a failure.
// These checks measure: levels, lengths, steps between samples. No check can hear; only a person can.
import { landPath, ruleFault } from './rule.mjs';
import { renderCall, peak, clickSize } from './sound.mjs';

export const title = 'Sound from code';
const show = (v) => String(+v.toPrecision(4));
const rngs = (mine, seed) => mine.call('rng', seed);

// ------------------------------------------------------------------ the call

export const CALL = { low: 700, high: 3500, longest: 6, notes: [4, 16] };
function notesOf(mine, seed) { return mine.call('gullCall', rngs(mine, seed)); }
const list = (n) => `[${n.map(show).join(', ')}]`;
function callShape({ mine }) {
  for (let seed = 1; seed <= 60; seed++) {
    const notes = notesOf(mine, seed);
    if (!Array.isArray(notes)) return { message: `gullCall returned ${notes}: it must return a list of notes.` };
    if (notes.length < CALL.notes[0] || notes.length > CALL.notes[1]) return { message: `gullCall gave ${notes.length} notes for one call: between ${CALL.notes[0]} and ${CALL.notes[1]}, a few long falling calls and then a run of short ones.` };
    for (const n of notes) if (!Array.isArray(n) || n.length !== 4 || !n.every(Number.isFinite)) return { message: `a note of gullCall is ${n}: it must be [start, length, pitch at start, pitch at end].` };
    let end = 0;
    for (const [at, len, f0, f1] of notes) {
      if (len <= 0 || len > 1) return { message: `a note lasts ${show(len)} s: a call's notes are between 0 and 1 second long.` };
      if (at < -1e-9 || at + 1e-9 < end - 0.02) return { message: `a note starts at ${show(at)} s, before the one before ends at ${show(end)} s: notes follow each other, with a gap.` };
      if (f1 >= f0) return { message: `a note goes from ${show(f0)} Hz to ${show(f1)} Hz: every note of a gull falls in pitch.` };
      for (const f of [f0, f1]) if (f < CALL.low || f > CALL.high) return { message: `a note reaches ${show(f)} Hz: a gull's cry stays between ${CALL.low} and ${CALL.high} Hz.` };
      end = at + len;
    }
    if (end > CALL.longest) return { message: `a call lasts ${show(end)} s: no longer than ${CALL.longest}.` };
  }
  return null;
}
function callVaries({ mine }) {
  const a = JSON.stringify(notesOf(mine, 5)), b = JSON.stringify(notesOf(mine, 5)), c = JSON.stringify(notesOf(mine, 6));
  if (a !== b) return { message: 'gullCall gave a different call the second time from the same stream of numbers.' };
  if (a === c) return { message: 'gullCall gave the same call for two different streams: its pitch and number of notes come from the stream r.' };
  const starts = new Set();
  for (let s = 1; s <= 40; s++) starts.add(notesOf(mine, s).length);
  if (starts.size < 3) return { message: `forty calls have only ${starts.size} different numbers of notes: they vary from call to call.` };
  return null;
}
function callOrder({ mine }) {
  for (let seed = 1; seed <= 40; seed++) {
    const notes = notesOf(mine, seed);
    const longest = Math.max(...notes.map((n) => n[1])), shortest = Math.min(...notes.map((n) => n[1]));
    if (longest < 0.2 || shortest > 0.2) return { message: `gullCall's notes run from ${show(shortest)} to ${show(longest)} s: a call has long notes (about 0.3 s) and short ones (about 0.1 s).` };
    const first = notes.findIndex((n) => n[1] < 0.2), last = notes.map((n) => n[1] >= 0.2).lastIndexOf(true);
    if (first >= 0 && first < last) return { message: 'gullCall puts a short note before a long one: the long falling calls come first, the run of short ones after.' };
  }
  return null;
}

// ------------------------------------------------------------------ the envelope and the click

const ENVELOPE_LENGTHS = [0.11, 0.2, 0.32];
function envelope({ mine }) {
  for (const len of ENVELOPE_LENGTHS) {
    const p = mine.call('callEnvelope', len);
    const at = `callEnvelope(${len})`;
    if (!Array.isArray(p) || p.length < 3 || !p.every((x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite))) return { message: `${at} returned ${JSON.stringify(p)}: it must return points [seconds, level], at least three.` };
    for (let k = 1; k < p.length; k++) if (p[k][0] <= p[k - 1][0]) return { message: `${at} has its points out of order: ${list(p.map((x) => x[0]))}. The seconds must rise from one point to the next.` };
    if (p[0][0] !== 0) return { message: `${at} begins at ${show(p[0][0])} s: the first point is at 0, the start of the note.` };
    if (Math.abs(p.at(-1)[0] - len) > 1e-9) return { message: `${at} ends at ${show(p.at(-1)[0])} s: the last point is at the end of the note, ${len} s.` };
    if (Math.abs(p[0][1]) > 1e-6 || Math.abs(p.at(-1)[1]) > 1e-6) return { message: `${at} starts at level ${show(p[0][1])} and ends at ${show(p.at(-1)[1])}: both must be 0, or the note starts or stops with a step in the sound, a click.` };
    if (!p.every((x) => x[1] >= 0 && x[1] <= 1)) return { message: `${at} has a level outside 0 to 1: ${list(p.map((x) => x[1]))}.` };
    const top = p.reduce((m, x) => Math.max(m, x[1]), 0);
    if (top < 0.2) return { message: `${at} never rises above ${show(top)}: a call is heard, at 0.2 or more.` };
    const rise = p.find((x) => x[1] === top)[0];
    if (rise > 0.1 || rise < 0.01) return { message: `${at} reaches its highest level after ${show(rise)} s: between 0.01 and 0.1 s, a quick rise.` };
  }
  return null;
}
// 0.06 with stage 8's envelope and 0.71 with a flat one; 0.23 with a note that falls only to a fifth of its peak.
export const CLICK_MOST = 0.2;
function click({ mine }) {
  let worst = 0;
  for (const seed of [1, 7, 8, 123]) {
    const notes = notesOf(mine, seed);
    const call = renderCall(notes, (len) => mine.call('callEnvelope', len));
    worst = Math.max(worst, clickSize(call));
    if (worst > CLICK_MOST) return { message: `where a note starts or stops, the loudness changes by ${show(worst)} of the call's loudest in 2 ms: a click. The envelope must bring every note up from silence and back to it; at most ${CLICK_MOST} is allowed. (Measured from the samples; only a person can hear it.)` };
  }
  return null;
}
function levels({ mine }) {
  for (const seed of [1, 7, 8]) {
    const call = renderCall(notesOf(mine, seed), (len) => mine.call('callEnvelope', len));
    const top = peak(call.samples);
    if (top < 0.02) return { message: `the lab's renderer peaks at ${show(top)}: the call is nearly silent.` };
    if (top > 0.6) return { message: `the lab's renderer peaks at ${show(top)}: louder than 0.6, four times the stage's call.` };
  }
  return null;
}

// ------------------------------------------------------------------ the mix

const mix = (mine, o) => mine.call('soundMix', o.ground ?? 0.5, o.alt ?? 2, o.speed ?? 0, o.night ?? 0, o.flock ?? 50);
function mixShape({ mine }) {
  for (const ground of [-5, 0.5, 40, 273]) for (const alt of [0, 30, 300]) for (const speed of [0, 30]) for (const night of [0, 1]) for (const flock of [5, 400]) {
    const m = mix(mine, { ground, alt, speed, night, flock });
    if (!m || m.length !== 4 || !Array.from(m).every(Number.isFinite)) return { message: `soundMix returned ${m}: it must return four finite numbers, [surf, wind, crickets, gulls].` };
    const bad = Array.from(m).findIndex((v) => v < -1e-9 || v > 1 + 1e-9);
    if (bad >= 0) return { message: `soundMix gives ${['surf', 'wind', 'crickets', 'gulls'][bad]} ${show(m[bad])}, outside 0 to 1.` };
  }
  return null;
}
function mixRules({ mine }) {
  const sea = mix(mine, { ground: 0 }), shore = mix(mine, { ground: 40 }), hill = mix(mine, { ground: 273 });
  if (!(sea[0] > shore[0] + 0.1 && shore[0] >= hill[0])) return { message: `surf is ${show(sea[0])} at the shore, ${show(shore[0])} at 40 m inland and ${show(hill[0])} over 273 m land, all from 2 m up: it is loudest at the sea and fades inland.` };
  if (hill[0] > 0.3 * sea[0]) return { message: `surf over 273 m land is ${show(hill[0])}, against ${show(sea[0])} at the shore: at most three tenths of it, up there.` };
  if (!(mix(mine, { alt: 200 })[0] < mix(mine, { alt: 5 })[0] - 0.1)) return { message: 'surf is as loud from 200 m up as from 5 m: it fades with height.' };
  if (!(mix(mine, { alt: 200, speed: 0 })[1] > mix(mine, { alt: 5, speed: 0 })[1] + 0.05)) return { message: 'wind does not rise with height: the higher you fly, the more of it.' };
  if (!(mix(mine, { speed: 40 })[1] > mix(mine, { speed: 0 })[1] + 0.05)) return { message: 'wind does not rise with speed: the faster you fly, the more of it.' };
  if (mix(mine, { night: 0 })[2] > 0.01) return { message: `crickets are ${show(mix(mine, { night: 0 })[2])} by day: they sound only at night.` };
  const land = mix(mine, { night: 1, ground: 20 })[2], water = mix(mine, { night: 1, ground: 0.2 })[2];
  if (!(land > water + 0.05)) return { message: `crickets on land at night are ${show(land)} and at the water's edge ${show(water)}: they live on land.` };
  if (!(mix(mine, { flock: 10 })[3] > mix(mine, { flock: 600 })[3] + 0.2)) return { message: 'gulls are as loud when the flock is far as when it is near: they fade with distance.' };
  return null;
}

function landRule({ mine, course }) {
  mine.call('gullCall', mine.call('rng', 1)); // stops here with "not written yet"
  mine.call('callEnvelope', 0.2);
  mine.call('soundMix', 1, 2, 0, 0, 50);
  const message = ruleFault(landPath(mine.source, 8, course.names));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ the bell (new application)

export const BELL = { gap: 1.2, low: 100, high: 900 };
function bellShape({ map }) {
  for (let hour = 0; hour < 24; hour++) {
    const s = map.call('bellStrikes', hour);
    const at = `bellStrikes(${hour})`;
    if (!Array.isArray(s)) return { message: `${at} returned ${s}: a list of strikes, each [seconds, pitch in hertz, level].` };
    const want = hour % 12 === 0 ? 12 : hour % 12;
    if (s.length !== want) return { message: `${at} gives ${s.length} strikes: the bell counts the hours on a twelve-hour clock, so ${want} at hour ${hour} (12 at noon and at midnight).` };
    let last = -Infinity;
    for (const [k, x] of s.entries()) {
      if (!Array.isArray(x) || x.length !== 3 || !x.every(Number.isFinite)) return { message: `${at}, strike ${k + 1}: ${x}; it must be [seconds, pitch in hertz, level].` };
      if (k === 0 && x[0] !== 0) return { message: `${at}: the first strike is at ${show(x[0])} s; it starts at 0.` };
      if (x[0] - last < BELL.gap - 1e-9) return { message: `${at}: strike ${k + 1} comes ${show(x[0] - last)} s after the one before; a tower bell needs at least ${BELL.gap} s to swing.` };
      if (x[1] < BELL.low || x[1] > BELL.high) return { message: `${at}: strike ${k + 1} is at ${show(x[1])} Hz; a tower bell is between ${BELL.low} and ${BELL.high} Hz.` };
      if (x[1] !== s[0][1]) return { message: `${at}: strike ${k + 1} has another pitch (${show(x[1])} Hz) than the first (${show(s[0][1])} Hz): one bell has one note.` };
      if (x[2] <= 0 || x[2] > 1) return { message: `${at}: strike ${k + 1} has level ${show(x[2])}; above 0 and at most 1.` };
      last = x[0];
    }
  }
  return null;
}
function bellSame({ map }) {
  if (JSON.stringify(map.call('bellStrikes', 5)) !== JSON.stringify(map.call('bellStrikes', 5))) return { message: 'bellStrikes(5) gave different strikes the second time: a bell that counts the hours is the same every time.' };
  if (JSON.stringify(map.call('bellStrikes', 3)) !== JSON.stringify(map.call('bellStrikes', 15))) return { message: 'bellStrikes(3) and bellStrikes(15) differ: both are three o\'clock, three in the morning and three in the afternoon.' };
  return null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '8.call-shape', part: 'contract', uses: ['gullCall'], title: 'a call is a list of falling notes, in order, in a gull\'s range', run: callShape },
  { id: '8.call-varies', part: 'contract', uses: ['gullCall'], title: 'another stream gives another call, the same stream the same one', run: callVaries },
  { id: '8.call-order', part: 'contract', uses: ['gullCall'], title: 'long calls come first, short ones after', run: callOrder },
  { id: '8.envelope', part: 'contract', uses: ['callEnvelope'], title: 'a note rises from silence and falls to it', run: envelope },
  { id: '8.click', part: 'contract', uses: ['gullCall', 'callEnvelope'], title: 'the loudness does not jump where a note starts or stops', run: click },
  { id: '8.levels', part: 'contract', uses: ['gullCall', 'callEnvelope'], title: 'the call is heard, and not clipped', run: levels },
  { id: '8.mix-shape', part: 'contract', uses: ['soundMix'], title: 'four numbers from 0 to 1', run: mixShape },
  { id: '8.mix-rules', part: 'contract', uses: ['soundMix'], title: 'surf at the sea, wind with height and speed, crickets by night, gulls near', run: mixRules },
  { id: '8.rule', part: 'contract', uses: ['gullCall', 'soundMix', 'callEnvelope'], title: 'everything that shapes the land keeps the determinism rule', run: landRule },
  { id: '8.bell-shape', part: 'application', uses: ['bellStrikes'], title: 'the bell counts the hours, one note, with time to swing', run: bellShape },
  { id: '8.bell-same', part: 'application', uses: ['bellStrikes'], title: 'it counts on a twelve-hour clock, the same every time', run: bellSame },
];

export function note({ mine, course }) {
  let differ = 0;
  for (let s = 1; s <= 200; s++) if (JSON.stringify(notesOf(mine, s)) !== JSON.stringify(notesOf(course, s))) differ++;
  const lines = [differ ? `gullCall differs from stage 8's for ${differ} of 200 streams` : 'gullCall matches stage 8\'s for all 200 streams'];
  let m = 0;
  for (let k = 0; k < 200; k++) { const a = [k * 2 - 10, k % 60, k % 40, k % 2, k * 3]; if (mine.call('soundMix', ...a).some((v, i) => Math.abs(v - course.call('soundMix', ...a)[i]) > 1e-9)) m++; }
  lines.push(m ? `soundMix differs from stage 8's at ${m} of 200 places` : 'soundMix matches stage 8\'s at all 200 places');
  const e = JSON.stringify(mine.call('callEnvelope', 0.2)) === JSON.stringify(course.call('callEnvelope', 0.2));
  lines.push(e ? 'callEnvelope matches stage 8\'s' : 'callEnvelope differs from stage 8\'s (another correct shape would too)');
  return lines;
}
