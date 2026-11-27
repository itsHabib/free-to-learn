// The bench page: Kettle run in the browser with game/core.mjs, drawn with game/draw.mjs, the same code the
// course's checks and movie player use. Its only data is bench/data.mjs (see tools/bench-data.mjs).
import { newState, step, parseLevel, ADDR, SUB, L, R, J } from '../game/core.mjs';
import { drawWorld } from '../game/draw.mjs';
import { LEVEL1, LEVEL2, WALL } from './data.mjs';

const $ = (id) => document.getElementById(id);
const u16 = (ram, a) => ram[a] | (ram[a + 1] << 8);
const s16 = (ram, a) => { const v = u16(ram, a); return v & 0x8000 ? v - 0x10000 : v; };
const px = (sub) => String(Math.round((sub / SUB) * 100) / 100);
const buttons = (i) => `${i & L ? 'L' : '.'}${i & R ? 'R' : '.'}${i & J ? 'J' : '.'}`;
const TILES = 24;
// A page may hold either exercise or both: the course's bench/index.html has both, the site's overview page the wall.
const HAS_WALL = $('wall') !== null, HAS_PAR = $('par') !== null;

// Size a canvas to its box at a whole-number scale, so tiles meet without seams.
function sizeCanvas(cv, level) {
  const css = cv.clientWidth || 340;
  const k = Math.max(2, Math.ceil((css * (window.devicePixelRatio || 1)) / (TILES * 8)));
  cv.width = TILES * 8 * k;
  cv.height = level.h * 8 * k;
  return k;
}
const faceOf = (ram, last) => { const vx = s16(ram, ADDR.VX); return vx ? Math.sign(vx) : last; };

// ---------------------------------------------------------------- 1. the wall
const wallLevel = parseLevel(LEVEL2);
const wall = { states: [], f: 0, guess: null };
{
  const s = { ram: Uint8Array.from(WALL.ram), level: wallLevel, version: '1.0' };
  wall.states.push(s.ram.slice());
  for (const input of WALL.inputs) { step(s, input); wall.states.push(s.ram.slice()); }
}
// The wall in front of the flag: the first solid tile to the flag's left, on the flag's row.
const flagRow = wallLevel.tiles.findIndex((row) => row.includes('F'));
let wallCol = wallLevel.tiles[flagRow].indexOf('F');
while (wallLevel.tiles[flagRow][wallCol] !== '#') wallCol--;
const wallX = wallCol * 8;
const wallCam = Math.max(0, wallX + 8 - TILES * 8 * 0.62);
const throughAt = wall.states.findIndex((ram, i) => i > 0 && u16(wall.states[i - 1], ADDR.X) / SUB + 6 <= wallX && u16(ram, ADDR.X) / SUB >= wallX + 8);

function drawWall() {
  const cv = $('wall-canvas'), g = cv.getContext('2d');
  const k = sizeCanvas(cv, wallLevel);
  const ram = wall.states[wall.f];
  drawWorld(g, { level: wallLevel, ram, k, tiles: TILES, face: 1, camX: wallCam });
  const x = u16(ram, ADDR.X) / SUB;
  cv.setAttribute('aria-label', `Level 2, frame ${WALL.from + wall.f}: Kettle's left edge at x ${px(u16(ram, ADDR.X))}, ${x + 6 <= wallX ? 'left of' : x >= wallX + 8 ? 'right of' : 'inside'} the wall at x ${wallX} to ${wallX + 7}.`);
}

function renderWallRows() {
  const body = $('wall-rows');
  body.textContent = '';
  for (let i = 0; i <= wall.f; i++) {
    const ram = wall.states[i], tr = document.createElement('tr');
    if (i === throughAt) tr.className = 'hit';
    const cells = [WALL.from + i, i ? buttons(WALL.inputs[i - 1]) : 'start', px(u16(ram, ADDR.X)), px(s16(ram, ADDR.VX))];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    body.append(tr);
  }
  $('wall-back').disabled = wall.f === 0;
  $('wall-next').disabled = wall.f === wall.states.length - 1;
  const result = $('wall-result');
  if (wall.f < throughAt) { result.textContent = ''; return; }
  const before = wall.states[throughAt - 1], after = wall.states[throughAt];
  const move = s16(after, ADDR.VX), bx = u16(before, ADDR.X);
  const depth = px(bx + 6 * SUB + move - wallX * SUB);
  const verdict = wall.guess === 'through' ? 'You called it.' : 'Not what you picked.';
  result.textContent = '';
  const p1 = document.createElement('p');
  p1.textContent = `${verdict} On frame ${WALL.from + throughAt} Kettle moved ${px(move)} px. Its front edge ended ${depth} px into the 8 px tile, past halfway, so the game pushed it out of the nearer side, which is the far one: x ${px(u16(after, ADDR.X))}, through the wall.`;
  const p2 = document.createElement('p');
  p2.className = 'question';
  p2.textContent = 'Walking speed is 1.5 px a frame, and at that speed the front edge can never get past halfway. So how did Kettle reach 5? Finding out, with a search you write, is what the course is for.';
  result.append(p1, p2);
}

if (HAS_WALL) {
  $('predict').addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = new FormData(e.target).get('guess');
    if (!picked) { $('predict-hint').textContent = 'Pick one answer first.'; return; }
    wall.guess = picked;
    for (const el of e.target.elements) el.disabled = true;
    $('predict-hint').textContent = 'Locked in. Now step through the frames.';
    $('wall-step').hidden = false;
    renderWallRows();
    $('wall-next').focus();
  });
  $('wall-next').addEventListener('click', () => {
    wall.f = Math.min(wall.f + 1, wall.states.length - 1);
    drawWall(); renderWallRows();
    // The button disables on the last frame; keep focus somewhere useful instead of losing it to the page.
    if ($('wall-next').disabled) ($('wall-result').textContent ? $('wall-result') : $('wall-back')).focus();
  });
  $('wall-back').addEventListener('click', () => { wall.f = Math.max(wall.f - 1, 0); drawWall(); renderWallRows(); });
  $('wall-from').textContent = WALL.from;
  $('wall-start-vx').textContent = px(s16(wall.states[0], ADDR.VX));
}

// ---------------------------------------------------------------- 2. beat par by hand
const parLevel = parseLevel(LEVEL1);
const run = { states: [], inputs: [], held: 0, keys: 0, timer: null, rerecords: 0, face: 1 };
const PADS = [['pad-l', L], ['pad-r', R], ['pad-j', J]];
const KEYS = { ArrowLeft: L, ArrowRight: R, ArrowUp: J };

function resetRun() {
  stopPlay();
  run.states = [newState(parLevel).ram.slice()];
  run.inputs = [];
  run.face = 1;
  run.held = 0;
  run.rerecords = 0;
  for (const [id] of PADS) $(id).setAttribute('aria-pressed', 'false');
  renderPar();
}
const lastRam = () => run.states[run.states.length - 1];
const finished = (ram) => ram[ADDR.DONE] !== 0 || ram[ADDR.DEAD] !== 0;
const heldNow = () => run.held | run.keys;

function advance() {
  const ram = lastRam();
  if (finished(ram)) { stopPlay(); return; }
  const s = { ram: ram.slice(), level: parLevel, version: '1.0' };
  step(s, heldNow());
  run.inputs.push(heldNow());
  run.states.push(s.ram);
  run.face = faceOf(s.ram, run.face);
  if (finished(s.ram)) stopPlay();
  renderPar();
}

function renderPar() {
  const cv = $('par-canvas'), g = cv.getContext('2d');
  const k = sizeCanvas(cv, parLevel);
  const ram = lastRam();
  drawWorld(g, { level: parLevel, ram, k, tiles: TILES, face: run.face });
  const n = run.inputs.length, par = parLevel.par;
  let text = `Frame ${n}. Par ${par}.`;
  if (ram[ADDR.DONE]) text = `Flag on frame ${n}. Par is ${par}: ${n < par ? `${par - n} under par.` : n === par ? 'exactly par.' : `${n - par} over.`} In the course you write the search that finds the fastest possible run.`;
  else if (ram[ADDR.DEAD]) text = `Kettle hit the spikes on frame ${n}. Go back a frame or start over.`;
  $('par-status').textContent = text;
  cv.setAttribute('aria-label', `Level 1, frame ${n}: Kettle at x ${px(u16(ram, ADDR.X))}, y ${px(u16(ram, ADDR.Y))}.`);
  $('par-undo').disabled = n === 0;
  $('par-step').disabled = finished(ram);
  $('par-play').disabled = finished(ram);
  $('par-rerecords').textContent = run.rerecords;
}

function stopPlay() {
  if (run.timer) clearInterval(run.timer);
  run.timer = null;
  $('par-play').textContent = 'Play';
  $('par-status').setAttribute('aria-live', 'polite'); // announce the frame count again once play stops
}
if (HAS_PAR) {
  $('par-play').addEventListener('click', () => {
    if (run.timer) { stopPlay(); return; }
    $('par-status').setAttribute('aria-live', 'off'); // 30 updates a second would flood a screen reader
    run.timer = setInterval(advance, 1000 / 30);
    $('par-play').textContent = 'Pause';
  });
  $('par-step').addEventListener('click', () => { stopPlay(); advance(); });
  $('par-undo').addEventListener('click', () => {
    stopPlay();
    if (run.inputs.length === 0) return;
    run.inputs.pop(); run.states.pop(); run.rerecords += 1;
    renderPar();
  });
  $('par-reset').addEventListener('click', resetRun);
  for (const [id, bit] of PADS) {
    $(id).addEventListener('click', () => {
      run.held ^= bit;
      $(id).setAttribute('aria-pressed', String((run.held & bit) !== 0));
    });
  }
  document.addEventListener('keydown', (e) => {
    const bit = KEYS[e.key];
    if (!bit || !e.target.closest('#par')) return; // only while focus is in the level 1 section, so the page still scrolls
    e.preventDefault();
    run.keys |= bit;
  });
  document.addEventListener('keyup', (e) => { const bit = KEYS[e.key]; if (bit) run.keys &= ~bit; });
  window.addEventListener('blur', () => { run.keys = 0; });
  $('par-value').textContent = parLevel.par;
}

// ---------------------------------------------------------------- start
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (HAS_WALL) drawWall(); if (HAS_PAR) renderPar(); }, 100); });
if (HAS_WALL) drawWall();
if (HAS_PAR) resetRun();
