// The judge: replays movies on the untouched game. It has its own movie reader, so a claim never
// depends on code the learner wrote.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newState, step, hash, ADDR, L, R, J } from '../game/core.mjs';
import { loadLevel } from '../game/levels.mjs';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
export const expected = JSON.parse(readFileSync(join(course, 'checks', 'expected.json'), 'utf8'));

// The game files the checks were written for: the core, the level loader, the levels and the fixtures.
// If one changes, every replay would mean something else. Line endings are normalised before hashing, so a
// checkout that turns them into CRLF still matches. tools/pin.mjs writes checks/pins.json.
export function gameFiles() {
  const levels = readdirSync(join(course, 'game', 'levels')).filter((f) => f.endsWith('.txt')).sort();
  return ['game/core.mjs', 'game/levels.mjs', 'game/fixtures.mjs', ...levels.map((f) => `game/levels/${f}`)];
}
export const digest = (rel) => createHash('sha256').update(readFileSync(join(course, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

export function verifyCore() {
  const pins = JSON.parse(readFileSync(join(course, 'checks', 'pins.json'), 'utf8'));
  const files = gameFiles();
  const extra = files.filter((f) => !(f in pins));
  if (extra.length) throw new Error(`${extra.join(', ')} is not part of the course. The checks replay only on the original game and levels: remove it, or restore game/ from a fresh copy of the course.`);
  for (const [rel, want] of Object.entries(pins)) {
    if (!existsSync(join(course, rel)) || digest(rel) !== want) throw new Error(`${rel} has been changed or removed. The checks only replay on the original game and levels: restore it from a fresh copy of the course.`);
  }
}

const BITS = [['L', L], ['R', R], ['J', J]];

export function readMovieText(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const at = lines.indexOf('inputs:');
  if (at < 0) throw new Error('the movie has no line "inputs:"');
  const header = {};
  for (const line of lines.slice(0, at)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2];
  }
  const inputs = [];
  lines.slice(at + 1).forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    if (!/^\|[L.][R.][J.]\|$/.test(t)) throw new Error(`line ${at + 2 + i} of the movie is "${t}", not a frame such as |.R.|`);
    inputs.push(BITS.reduce((v, [ch, bit], k) => (t[k + 1] === ch ? v | bit : v), 0));
  });
  return { header, inputs };
}

export function readMovieFile(path) {
  if (!existsSync(path)) throw new Error(`there is no movie at ${path}`);
  return readMovieText(readFileSync(path, 'utf8'));
}

// Replays inputs from a new state. frames is the number of inputs played (it stops at the flag or death).
export function replay(level, inputs, version = '1.0') {
  verifyCore();
  const lv = typeof level === 'string' ? loadLevel(level) : level;
  const state = newState(lv, version);
  let frame = null, played = 0;
  for (const input of inputs) {
    step(state, input);
    played++;
    if (state.ram[ADDR.DEAD]) break;
    if (state.ram[ADDR.DONE]) { frame = played; break; }
  }
  return { finished: frame !== null, frame, dead: state.ram[ADDR.DEAD] === 1, hash: hash(state), frames: played, state };
}

// Level 3: which tier the learner's movie reaches.
export function capstone(workDir) {
  const path = join(workDir, 'movies', 'level3.movie');
  const { header, inputs } = readMovieFile(path);
  if (header.level && header.level !== 'level3') throw new Error(`${path} says it is for ${header.level}, not level3`);
  const r = replay('level3', inputs, '1.0');
  const { par, best, bestProven } = expected.level3;
  const bestName = bestProven ? 'the best possible count' : "the author's best count, not proven optimal";
  if (!r.finished) return { tier: 'none', frame: null, message: r.dead ? `Kettle dies on frame ${r.frames}.` : `The movie ends after ${r.frames} frames without reaching the flag.` };
  if (best !== null && r.frame <= best) return { tier: 'best', frame: r.frame, message: `Flag on frame ${r.frame}: matches ${bestName} (${best}).` };
  const bestNote = best === null ? '' : ` ${bestName[0].toUpperCase() + bestName.slice(1)} is ${best}.`;
  if (r.frame <= par) return { tier: 'par', frame: r.frame, message: `Flag on frame ${r.frame}: under par (${par}).${bestNote}` };
  return { tier: 'finish', frame: r.frame, message: `Flag on frame ${r.frame}: finished. Par is ${par}.` };
}
