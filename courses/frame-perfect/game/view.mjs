// The movie player and recorder. It plays Kettle with game/core.mjs, the same code the checks run,
// so what you see here is exactly what a movie does.
import { newState, step, parseLevel, ADDR, VERSIONS, L, R, J, SUB } from './core.mjs';
import { PAL, TILE_ART, drawBell, drawGem, drawCrate, drawDropPlace, drawKettle, drawBackdrop, drawTiles, drawItems } from './draw.mjs';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FPS = 30;
const WALK_MAX = 24;
const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

const app = {
  level: null, levelName: '', version: '1.0', header: {},
  inputs: [], states: [], f: 0,
  mode: 'watch', timer: null, running: false,
  held: 0, keys: 0, pads: 0,
  rerecords: 0, slot: null, k: 4, tiles: 24,
};

// ---- RAM ----
const u16 = (ram, a) => ram[a] | (ram[a + 1] << 8);
const s16 = (ram, a) => { const v = u16(ram, a); return v & 0x8000 ? v - 0x10000 : v; };
const ended = (ram) => ram[ADDR.DONE] !== 0 || ram[ADDR.DEAD] !== 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- movie text: the same format the toolkit's writeMovie writes ----
const BUTTONS = [['L', L], ['R', R], ['J', J]];
const formatInput = (input) => '|' + BUTTONS.map(([ch, bit]) => (input & bit ? ch : '.')).join('') + '|';

function parseInput(line, n) {
  if (!/^\|[L.][R.][J.]\|$/.test(line)) throw new Error(`line ${n}: expected something like |.R.| but found "${line}"`);
  return BUTTONS.reduce((input, [ch, bit], i) => (line[i + 1] === ch ? input | bit : input), 0);
}

function readMovie(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.indexOf('inputs:');
  if (start < 0) throw new Error('the movie has no line "inputs:"');
  const header = {};
  for (const line of lines.slice(0, start)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2];
  }
  const inputs = [];
  lines.slice(start + 1).forEach((line, i) => {
    if (line.trim() !== '') inputs.push(parseInput(line.trim(), start + 2 + i));
  });
  return { header, inputs };
}

function writeMovie({ header, inputs }) {
  const head = Object.entries(header).map(([k, v]) => `${k}: ${v}`);
  return ['# Frame Perfect movie', ...head, 'inputs:', ...inputs.map(formatInput), ''].join('\n');
}

// ---- the timeline: states[k] is the RAM after k frames, so going back is free ----
function resetTimeline() {
  app.inputs = [];
  app.states = [newState(app.level, app.version).ram.slice()];
}

function append(input) {
  const st = { ram: app.states[app.states.length - 1].slice(), level: app.level, version: app.version };
  step(st, input);
  app.inputs.push(input);
  app.states.push(st.ram);
}

function truncate(n) {
  app.inputs.length = n;
  app.states.length = n + 1;
  if (app.slot !== null && app.slot > n) app.slot = null;
}

const lastRam = () => app.states[app.states.length - 1];
const shownRam = () => app.states[app.f];

// Where Kettle faces: the sign of the last non-zero speed, looking back from frame f.
function facing(f) {
  for (let k = f; k >= 0 && k > f - 60; k--) {
    const vx = s16(app.states[k], ADDR.VX);
    if (vx !== 0) return Math.sign(vx);
  }
  return 1;
}

function drawTrail(g, f) {
  g.fillStyle = PAL.copper;
  for (let k = Math.max(0, f - 30); k < f; k++) {
    const ram = app.states[k];
    g.globalAlpha = 0.12 + 0.5 * (k - f + 30) / 30;
    g.beginPath(); g.arc(u16(ram, ADDR.X) / SUB + 3, u16(ram, ADDR.Y) / SUB + 5, 0.9, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

function drawScene() {
  const cv = $('game'), g = cv.getContext('2d');
  const ram = shownRam(), k = app.k;
  const viewW = app.tiles * 8, levelW = app.level.w * 8, h = app.level.h * 8;
  const kx = u16(ram, ADDR.X) / SUB, ky = u16(ram, ADDR.Y) / SUB;
  const camX = Math.round(clamp(kx + 3 - viewW * 0.42, 0, levelW - viewW) * k) / k;
  g.setTransform(k, 0, 0, k, -camX * k, 0);
  drawBackdrop(g, camX, viewW, h);
  drawTiles(g, app.level, ram, camX, app.tiles);
  drawItems(g, app.level, ram);
  drawTrail(g, app.f);
  drawKettle(g, kx, ky, { face: facing(app.f), dead: ram[ADDR.DEAD] !== 0 });
}

// Size the canvas: 24 tiles across on a narrow screen, 30 on a wide one, the whole level height,
// drawn at a whole-number scale so tiles meet without seams.
function fit() {
  if (!app.level) return;
  const cv = $('game');
  const css = cv.parentElement.clientWidth || 360;
  app.tiles = Math.min(app.level.w, css < 520 ? 24 : 30);
  app.k = Math.max(2, Math.ceil((css * (window.devicePixelRatio || 1)) / (app.tiles * 8)));
  cv.width = app.tiles * 8 * app.k;
  cv.height = app.level.h * 8 * app.k;
  render();
}

// ---- the legend: each tile type in this level, drawn with the same art ----
function legendItems() {
  const lv = app.level;
  const has = (c) => lv.tiles.some((row) => row.includes(c));
  const items = [['kettle', 'Kettle']];
  if (has('#')) items.push(['#', 'Stone']);
  if (has('>')) items.push(['>', 'Belt, carries right']);
  if (has('<')) items.push(['<', 'Belt, carries left']);
  if (has('B')) items.push(['B', 'Bell: hit it from below'], ['rung', 'Bell, already rung']);
  if (has('^')) items.push(['^', 'Spikes']);
  if (has('F')) items.push(['F', 'Flag: the goal']);
  if (lv.gems.length || lv.dropKind === 'gem') items.push(['gem', 'Gem']);
  if (lv.dropKind) items.push(['place', `Drop places 0 to ${lv.dropCols.length - 1} (the bell picks one)`]);
  if (lv.dropKind === 'block') items.push(['crate', 'Dropped block']);
  return items;
}

function drawLegendTile(g, key) {
  const info = { tile: key, frame: 3, rung: false, grass: true, odd: false, kind: app.level.dropKind, face: 1 };
  if (TILE_ART[key]) return TILE_ART[key](g, 0, 0, info);
  if (key === 'gem') return drawGem(g, 0, 0);
  if (key === 'crate') return drawCrate(g, 0, 0);
  if (key === 'place') return drawDropPlace(g, 0, 0, info);
  if (key === 'rung') return drawBell(g, 0, 0, { ...info, rung: true });
  drawKettle(g, 0.4, 0, info);
}

function buildLegend() {
  const list = $('legend');
  list.textContent = '';
  // The legend covers the whole level, not only the part in view.
  const title = document.createElement('li');
  title.className = 'legend-title';
  title.textContent = 'In this level:';
  list.append(title);
  const dpr = window.devicePixelRatio || 1;
  for (const [key, label] of legendItems()) {
    const li = document.createElement('li');
    const cv = document.createElement('canvas');
    const scale = Math.ceil((22 * dpr) / 8);
    cv.width = cv.height = 8 * scale;
    cv.setAttribute('aria-hidden', 'true');
    const g = cv.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawLegendTile(g, key);
    const span = document.createElement('span');
    span.textContent = label;
    li.append(cv, span);
    list.append(li);
  }
}

// ---- the readouts beside the picture ----
const fmt = (n) => String(Math.round(n * 10000) / 10000);
const WATCH = [
  ['frame', ADDR.FRAME, (ram) => [u16(ram, ADDR.FRAME), 'frames played']],
  ['x', ADDR.X, (ram) => { const v = u16(ram, ADDR.X); return [v, `${fmt(v / SUB)} px, tile ${Math.floor(v / SUB / 8)}`]; }],
  ['y', ADDR.Y, (ram) => { const v = u16(ram, ADDR.Y); return [v, `${fmt(v / SUB)} px, tile ${Math.floor(v / SUB / 8)}`]; }],
  ['vx', ADDR.VX, (ram) => vxMeaning(s16(ram, ADDR.VX))],
  ['vy', ADDR.VY, (ram) => { const v = s16(ram, ADDR.VY); return [v, `${fmt(v / SUB)} px a frame${v > 0 ? ', falling' : v < 0 ? ', rising' : ''}`]; }],
  ['rng', ADDR.RNG, (ram) => ['0x' + u16(ram, ADDR.RNG).toString(16).padStart(4, '0'), 'random state']],
];

function vxMeaning(v) {
  const over = Math.abs(v) > WALK_MAX;
  return [v, `${fmt(v / SUB)} px a frame${over ? ', over walking top speed (1.5)' : ''}`, over];
}

function buildWatch() {
  const body = $('watch');
  for (const [name, addr] of WATCH) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="addr">0x${addr.toString(16).padStart(2, '0')}</td><th scope="row">${name}</th><td></td><td></td>`;
    body.append(tr);
  }
}

function renderWatch(ram) {
  const rows = $('watch').rows;
  WATCH.forEach(([, , read], i) => {
    const [value, meaning, hot] = read(ram);
    const cells = rows[i].cells;
    cells[2].textContent = String(value);
    cells[3].textContent = meaning;
    cells[2].classList.toggle('hot', !!hot);
    cells[3].classList.toggle('hot', !!hot);
  });
}

function renderLights() {
  const input = app.f > 0 ? app.inputs[app.f - 1] : 0;
  const names = [];
  for (const [ch, bit] of BUTTONS) {
    $('light-' + bit).classList.toggle('on', (input & bit) !== 0);
    if (input & bit) names.push({ L: 'left', R: 'right', J: 'jump' }[ch]);
  }
  $('lights').setAttribute('aria-label', `Buttons pressed on this frame: ${names.join(', ') || 'none'}`);
}

// The first frame, up to f, on which a test is true, or -1.
function firstFrame(test) {
  for (let k = 0; k <= app.f; k++) if (test(app.states[k])) return k;
  return -1;
}

function noteText(ram) {
  const done = firstFrame((r) => r[ADDR.DONE] !== 0);
  if (done >= 0) return [`Flag reached on frame ${done}.`, false];
  const dead = firstFrame((r) => r[ADDR.DEAD] !== 0);
  if (dead >= 0) return [`Kettle was lost on frame ${dead}.`, true];
  if (!ram[ADDR.BELL]) return ['', false];
  const rang = firstFrame((r) => r[ADDR.BELL] !== 0);
  const drop = ram[ADDR.DROP];
  if (drop === 255) return [`The bell rang on frame ${rang}.`, false];
  return [`The bell rang on frame ${rang} and chose drop place ${drop} (column ${app.level.dropCols[drop]}).`, false];
}

function renderPads() {
  const live = app.held | app.keys | app.pads;
  document.querySelectorAll('.pad').forEach((pad) => {
    pad.setAttribute('aria-pressed', String((live & Number(pad.dataset.bit)) !== 0));
  });
}

function render() {
  if (!app.level) return;
  const ram = shownRam(), end = app.inputs.length;
  drawScene();
  renderWatch(ram);
  renderLights();
  renderPads();
  const [note, bad] = noteText(ram);
  $('note').textContent = note;
  $('note').classList.toggle('bad', bad);
  $('scrub').max = String(end);
  $('scrub').value = String(app.f);
  $('frame').textContent = `frame ${app.f} / ${end}`;
  $('rec-frame').textContent = `frame ${end}`;
  $('rerecords').textContent = `rerecords: ${app.rerecords}`;
  $('meta').textContent = `${end} frames · par ${app.level.par ?? 'none'} · game ${app.version} · rerecords: ${app.rerecords}`;
  $('step').disabled = app.running || ended(lastRam());
  $('undo').disabled = app.running || end === 0;
  $('slot-load').disabled = app.running || app.slot === null;
  $('slot-save').disabled = app.running;
  $('slot-load').textContent = app.slot === null ? 'Load savestate' : `Load frame ${app.slot}`;
  const px = (a) => fmt(u16(ram, a) / SUB);
  $('game').setAttribute('aria-label', `${app.level.name}, frame ${app.f}: Kettle at x ${px(ADDR.X)} px, y ${px(ADDR.Y)} px. ${note}`);
}

// ---- watch mode ----
function go(n) {
  app.f = clamp(n, 0, app.inputs.length);
  render();
}

function stopTimer() {
  clearInterval(app.timer);
  app.timer = null;
  app.running = false;
  app.pads = 0;
  $('play').textContent = 'Play';
  $('run').textContent = 'Run live';
  $('rec-hint').textContent = hintText();
}

function togglePlay() {
  if (app.timer) return stopTimer();
  if (app.f >= app.inputs.length) app.f = 0;
  $('play').textContent = 'Pause';
  app.timer = setInterval(() => {
    if (app.f >= app.inputs.length) return stopTimer();
    go(app.f + 1);
  }, 1000 / FPS);
}

// ---- record mode ----
function hintText() {
  if (app.running) return 'Live: hold the arrow keys or A and D to walk, Space, W or Up to jump. Press P or Pause to stop.';
  return 'Frame advance: tap L, R or J to choose the buttons for the next frame, then Step (or press .). Keys held down count too. Undo frame removes the last frame and counts a rerecord.';
}

function nextInput() {
  return app.held | app.keys | app.pads;
}

function stepOnce() {
  if (ended(lastRam())) return;
  append(nextInput());
  app.f = app.inputs.length;
  render();
}

function toggleRun() {
  if (app.running) { stopTimer(); render(); return; }
  if (ended(lastRam())) return;
  app.held = 0;
  app.running = true;
  $('run').textContent = 'Pause';
  $('rec-hint').textContent = hintText();
  app.timer = setInterval(() => {
    if (ended(lastRam())) { stopTimer(); render(); return; }
    stepOnce();
  }, 1000 / FPS);
  render();
}

function undoFrame() {
  if (app.running || app.inputs.length === 0) return;
  truncate(app.inputs.length - 1);
  app.rerecords += 1;
  app.f = app.inputs.length;
  render();
}

function saveSlot() {
  app.slot = app.inputs.length;
  render();
}

function loadSlot() {
  if (app.running || app.slot === null) return;
  if (app.slot < app.inputs.length) {
    truncate(app.slot);
    app.rerecords += 1;
  }
  app.f = app.inputs.length;
  render();
}

function setMode(mode) {
  if (mode === app.mode) return;
  stopTimer();
  if (mode === 'record' && app.f < app.inputs.length) {
    const drop = app.inputs.length - app.f;
    const ok = window.confirm(`Recording from frame ${app.f} drops the ${drop} frame${drop === 1 ? '' : 's'} after it. Go on?`);
    if (!ok) return;
    truncate(app.f);
    app.rerecords += 1;
  }
  app.mode = mode;
  if (mode === 'record') app.f = app.inputs.length;
  showMode();
  render();
}

function showMode() {
  const rec = app.mode === 'record';
  $('mode-watch').setAttribute('aria-pressed', String(!rec));
  $('mode-record').setAttribute('aria-pressed', String(rec));
  $('watch-bar').hidden = rec;
  $('record-bar').hidden = !rec;
  $('rec-hint').textContent = hintText();
}

// ---- the on-screen buttons: hold while running live, toggle when stepping ----
function padDown(e) {
  const bit = Number(e.currentTarget.dataset.bit);
  e.preventDefault();
  if (!app.running) { app.held ^= bit; renderPads(); return; }
  app.pads |= bit;
  renderPads();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that already left */ }
}

function padUp(e) {
  app.pads &= ~Number(e.currentTarget.dataset.bit);
  renderPads();
}

function padClick(e) {
  if (e.detail !== 0) return; // pointer presses are handled above; this is Enter or Space on a focused pad
  app.held ^= Number(e.currentTarget.dataset.bit);
  renderPads();
}

// ---- keyboard ----
const GAME_KEYS = { ArrowLeft: L, a: L, A: L, ArrowRight: R, d: R, D: R, ' ': J, w: J, W: J, ArrowUp: J };

function typing(e) {
  return e.target.closest && e.target.closest('input[type=text], input:not([type]), textarea');
}

function recordKey(e) {
  const bit = GAME_KEYS[e.key];
  if (bit) { e.preventDefault(); app.keys |= bit; renderPads(); return; }
  if (e.key === '.') { e.preventDefault(); if (!app.running) stepOnce(); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleRun(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); undoFrame(); }
}

function watchKey(e) {
  if (e.target.type === 'range') return;
  const isButton = e.target.tagName === 'BUTTON';
  if (e.key === 'ArrowLeft') { e.preventDefault(); stopTimer(); go(app.f - 1); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); stopTimer(); go(app.f + 1); return; }
  if (e.key === 'Home') { e.preventDefault(); go(0); return; }
  if (e.key === 'End') { e.preventDefault(); go(app.inputs.length); return; }
  if (e.key === ' ' && !isButton) { e.preventDefault(); togglePlay(); }
}

function onKeyDown(e) {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || !app.level) return;
  if (app.mode === 'record') return recordKey(e);
  watchKey(e);
}

function onKeyUp(e) {
  const bit = GAME_KEYS[e.key];
  if (!bit || app.mode !== 'record' || typing(e)) return;
  e.preventDefault(); // so Space does not also press a focused button
  app.keys &= ~bit;
  renderPads();
}

// ---- saving ----
function movieText() {
  const header = { ...app.header, game: app.version, level: app.levelName, rerecords: String(app.rerecords) };
  return writeMovie({ header, inputs: app.inputs });
}

function saveMessage(text, kind) {
  $('save-msg').textContent = text;
  $('save-msg').className = 'msg ' + (kind || '');
}

async function saveMovie() {
  const name = $('save-name').value.trim();
  if (!NAME.test(name)) {
    saveMessage('Use lowercase letters, digits and dashes, starting with a letter or digit.', 'bad');
    return $('save-name').focus();
  }
  if (app.inputs.length === 0) return saveMessage('There are no frames to save yet.', 'bad');
  let res;
  try {
    res = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: movieText(), headers: { 'Content-Type': 'text/plain' } });
  } catch {
    return saveMessage('The lab server did not answer. Is it still running?', 'bad');
  }
  const reply = (await res.text()).trim();
  if (res.status === 409) {
    saveMessage(`work/movies/${name}.movie already exists. Choose another name.`, 'bad');
    $('save-name').focus();
    return $('save-name').select();
  }
  if (!res.ok) return saveMessage(`Not saved: ${reply}`, 'bad');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  saveMessage(`Saved work/movies/${name}.movie: ${plural(app.inputs.length, 'frame')}, ${plural(app.rerecords, 'rerecord')}.`, 'good');
  const url = new URL(location.href);
  url.searchParams.set('movie', `work/movies/${name}.movie`);
  url.searchParams.set('level', app.levelName);
  history.replaceState(null, '', url);
}

// ---- start ----
async function fetchText(url, what) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`could not load ${what}. Open this page through the lab server.`);
  }
  if (!res.ok) throw new Error(`could not load ${what} (${res.status})`);
  return res.text();
}

function moviePath(path) {
  const clean = path.includes('/') ? path : `work/movies/${path.replace(/\.movie$/, '')}.movie`;
  return '/' + clean.replace(/^\/+/, '');
}

function suggestName(path) {
  const base = path ? path.split('/').pop().replace(/\.movie$/, '') : app.levelName;
  return (path ? `${base}-2` : base).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 41);
}

async function boot() {
  const path = params.get('movie');
  const movie = path ? readMovie(await fetchText(moviePath(path), `the movie ${path}`)) : null;
  app.levelName = params.get('level') || movie?.header.level || 'level1';
  if (!NAME.test(app.levelName)) throw new Error(`there is no level called "${app.levelName}"`);
  app.level = parseLevel(await fetchText(`levels/${app.levelName}.txt`, `the level ${app.levelName}`));
  app.version = params.get('version') || movie?.header.game || '1.0';
  if (!VERSIONS.includes(app.version)) throw new Error(`there is no game version ${app.version}; there are ${VERSIONS.join(' and ')}`);
  resetTimeline();
  if (movie) {
    movie.inputs.forEach(append);
    app.header = movie.header;
    app.rerecords = Number(movie.header.rerecords) || 0;
  }
  app.f = clamp(Number(params.get('frame')) || 0, 0, app.inputs.length);
  app.mode = movie ? 'watch' : 'record';
  if (app.mode === 'record') app.f = app.inputs.length;
  document.title = `${app.level.name} · Frame Perfect player`;
  $('lvname').textContent = app.level.name + (path ? ` · ${path.split('/').pop()}` : '');
  $('save-name').value = suggestName(path);
  buildLegend();
  showMode();
  fit();
}

function wire() {
  $('mode-watch').addEventListener('click', () => setMode('watch'));
  $('mode-record').addEventListener('click', () => setMode('record'));
  $('back').addEventListener('click', () => { stopTimer(); go(app.f - 1); });
  $('fwd').addEventListener('click', () => { stopTimer(); go(app.f + 1); });
  $('play').addEventListener('click', togglePlay);
  $('scrub').addEventListener('input', () => { stopTimer(); go(Number($('scrub').value)); });
  $('undo').addEventListener('click', undoFrame);
  $('run').addEventListener('click', toggleRun);
  $('step').addEventListener('click', stepOnce);
  $('slot-save').addEventListener('click', saveSlot);
  $('slot-load').addEventListener('click', loadSlot);
  $('save').addEventListener('click', saveMovie);
  $('save-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveMovie(); });
  document.querySelectorAll('.pad').forEach((pad) => {
    pad.addEventListener('pointerdown', padDown);
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);
    pad.addEventListener('lostpointercapture', padUp);
    pad.addEventListener('click', padClick);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { app.keys = 0; app.pads = 0; renderPads(); });
  window.addEventListener('resize', fit);
}

wire();
buildWatch();
boot().then(() => { window.__ready = true; }).catch((err) => {
  $('lvname').textContent = 'could not open';
  $('note').textContent = 'Could not open the player: ' + err.message;
  $('note').classList.add('bad');
  window.__ready = true;
});
