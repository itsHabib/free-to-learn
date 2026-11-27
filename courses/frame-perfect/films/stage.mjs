// Draws one still of a film: films/stage.html?cut=film|short&seg=N&frame=I&cap=K
// seg is the segment in films/script.mjs, frame the index into a clip's frames, cap the spoken line to burn in
// (Shorts only; -1 for none). The game is drawn with game/draw.mjs from states replayed with game/core.mjs;
// tables, outputs and code are read from the repository files at render time, never retyped.
import { newState, step, parseLevel, ADDR, SUB } from '../game/core.mjs';
import { drawWorld } from '../game/draw.mjs';
import script, { COURSE_URL } from './script.mjs';

const q = new URLSearchParams(location.search);
const cut = script[q.get('cut') ?? 'film'];
const seg = cut.segments[Number(q.get('seg') ?? 0)];
const frameIx = Number(q.get('frame') ?? 0);
const capIx = Number(q.get('cap') ?? -1);
const portrait = cut.height > cut.width;
const stage = document.getElementById('stage');
stage.className = portrait ? 'portrait' : 'landscape';
stage.style.width = `${cut.width}px`;
stage.style.height = `${cut.height}px`;

const text = async (path) => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.text(); };
const el = (tag, cls, content) => { const e = document.createElement(tag); if (cls) e.className = cls; if (content !== undefined) e.textContent = content; return e; };
const u16 = (ram, a) => ram[a] | (ram[a + 1] << 8);

async function levelStates(name, upTo) {
  const level = parseLevel(await text(`../game/levels/${name}.txt`));
  const states = [newState(level).ram.slice()];
  if (upTo > 0) {
    const movie = await text(`../reference/movies/${name}.movie`);
    const inputs = movie.split('\n').slice(movie.split('\n').indexOf('inputs:') + 1).filter((l) => l.trim()).map((l) => (l[1] === 'L' ? 1 : 0) | (l[2] === 'R' ? 2 : 0) | (l[3] === 'J' ? 4 : 0));
    const s = { ram: states[0].slice(), level, version: '1.0' };
    for (let f = 0; f < upTo; f++) { step(s, inputs[f]); states.push(s.ram.slice()); }
  }
  return { level, states };
}

function wallCam(level, tiles) {
  const row = level.tiles.findIndex((r) => r.includes('F'));
  let col = level.tiles[row].indexOf('F');
  while (level.tiles[row][col] !== '#') col--;
  return { wallX: col * 8, cam: Math.max(0, col * 8 + 8 - tiles * 8 * 0.62) };
}

function canvasFor(level, cssWidth, tiles, ram, camX) {
  const cv = el('canvas', 'game');
  const k = Math.ceil((cssWidth * cut.scale) / (tiles * 8));
  cv.width = tiles * 8 * k; cv.height = level.h * 8 * k;
  cv.style.width = `${cssWidth}px`;
  drawWorld(cv.getContext('2d'), { level, ram, k, tiles, face: 1, camX });
  return cv;
}

// A recorded watch table: header and the rows for the given frames, from examples/06-watch*.txt.
async function watchTable(file, frames, highlight) {
  const lines = (await text(`../${file}`)).trimEnd().split('\n');
  const table = el('table', 'watch');
  const head = el('tr');
  for (const h of lines[0].trim().split(/\s{2,}/)) head.append(el('th', '', h));
  table.append(head);
  for (const line of lines.slice(1)) {
    const cells = line.trim().split(/\s+/);
    if (frames && !frames.includes(Number(cells[0]))) continue;
    const tr = el('tr', Number(cells[0]) === highlight ? 'hit' : '');
    for (const c of cells) tr.append(el('td', '', c));
    table.append(tr);
  }
  return table;
}

async function draw() {
  const shot = seg.shot;
  const part = (shot.parts ?? [shot.kind])[Math.min(frameIx, (shot.parts ?? [shot.kind]).length - 1)];
  const main = el('div', `shot s-${shot.kind === 'code' ? part : shot.kind}`);
  stage.append(main);
  if (shot.kind === 'game') {
    const { level, states } = await levelStates(shot.level, shot.frame);
    const tiles = level.w;
    if (portrait) main.append(el('div', 'label', 'Level 2 of Kettle'));
    const cam = shot.level === 'level2' ? level.w * 8 - tiles * 8 : 0;
    if (shot.label) main.append(el('div', 'label', shot.label));
    main.append(canvasFor(level, portrait ? cut.width - 40 : cut.width - 80, tiles, states[shot.frame], cam));
  }
  if (shot.kind === 'terminal') {
    const lines = (await text(`../${shot.file}`)).trimEnd().split('\n');
    const term = el('div', 'term');
    term.append(el('div', 'path', `$ ${shot.cmd}`));
    for (const i of shot.lines) term.append(el('pre', 'out', lines[i]));
    main.append(term);
    if (shot.par) main.append(el('div', 'par', `par ${shot.par}`));
  }
  if (shot.kind === 'clip') {
    const last = shot.frames[Math.min(frameIx, shot.frames.length - 1)];
    const { level, states } = await levelStates('level2', last);
    const tiles = 24;
    const { wallX, cam } = wallCam(level, tiles);
    const pic = el('figure', 'pic');
    pic.append(canvasFor(level, portrait ? cut.width - 40 : 700, tiles, states[last], cam));
    pic.append(el('figcaption', '', `Frame ${last}. Wall: x ${wallX} to ${wallX + 7}. Kettle: 6 px wide.`));
    main.append(pic);
    const shown = shot.frames.slice(0, frameIx + 1);
    main.append(await watchTable('examples/06-watch.txt', shown, shot.highlight));
  }
  if (shot.kind === 'code') {
    const src = (await text('../game/core.mjs')).split('\n');
    const listing = (from, to, cls) => {
      const box = el('div', `codebox ${cls}`);
      box.append(el('div', 'path', `game/core.mjs, lines ${from} to ${to}`));
      const pre = el('pre');
      // The zoomed view drops the indentation every shown line shares, so long lines fit; nothing else changes.
      const cut = cls === 'zoomed' ? Math.min(...src.slice(from - 1, to).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length)) : 0;
      for (let n = from; n <= to; n++) {
        const line = el('span', shot.mark.includes(n) ? 'line mark' : 'line');
        line.append(el('span', 'num', String(n)), el('span', 'src', src[n - 1].slice(cut)));
        pre.append(line);
      }
      box.append(pre);
      return box;
    };
    if (part === 'code') main.append(listing(shot.from, shot.to, 'full'));
    if (part === 'zoom') { const z = listing(shot.zoom[0], shot.zoom[1], 'zoomed'); if (shot.zoomSize) z.querySelector('pre').style.fontSize = `${shot.zoomSize}px`; main.append(z); }
    if (part === 'table') main.append(await watchTable(shot.table, null, null));
    if (part === 'figure') {
      // Inline, so the figure's labels use the film's font instead of the system one.
      const box = el('div');
      box.innerHTML = await text('../lessons/figures/wall-clip.svg');
      const svg = box.querySelector('svg');
      svg.classList.add('figure');
      svg.removeAttribute('width'); svg.removeAttribute('height');
      main.append(svg);
    }
  }
  if (shot.kind === 'par') main.append(el('div', 'bigpar', `par ${shot.par}`));
  if (shot.kind === 'card') {
    main.append(el('div', 'title', shot.title));
    for (const l of shot.lines) main.append(el('div', 'line', l));
    main.append(el('div', 'url', COURSE_URL));
  }
  if (cut.burn && capIx >= 0) stage.append(el('div', 'caption', seg.say[capIx]));
  await Promise.all(['500 20px Barlow', '600 20px Barlow', '400 20px "Plex Mono"', '500 20px "Plex Mono"'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  if (!document.fonts.check('600 20px Barlow') || !document.fonts.check('400 20px "Plex Mono"')) throw new Error('the film fonts did not load');
  window.__ready = true;
}

draw().catch((e) => { document.body.textContent = String(e.stack ?? e); window.__error = String(e); window.__ready = true; });
export { SUB, ADDR, u16 };
