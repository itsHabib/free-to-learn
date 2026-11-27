// The bench page: unit 1's rasterizer run in the browser. Its only code from the course is
// bench/raster.mjs, written by tools/bench-data.mjs from reference/gpu/raster.mjs.
import { SUB, snap2, edge, rasterize } from './raster.mjs';

const $ = (id) => document.getElementById(id);
const C = {
  paper: '#ffffff', line: '#e2dccf', block: '#c9c1b1', ink: '#2b2620', soft: '#6f685d',
  blue: '#7fb0d6', orange: '#f0b27a', both: '#7d4fa8', miss: '#c0392b', cover: '#7fb0d6',
  waste: '#f3eee4', warp: '#2f6f8f', handle: '#b5541c',
};
// A page may hold either part or both: the course's bench has both, the site's overview page part 1.
const HAS_SEAM = $('seam') !== null, HAS_WARP = $('warp') !== null;

// Size a canvas for a W by H pixel grid at a whole number of device pixels per grid pixel.
function fit(cv, W, H) {
  const css = cv.clientWidth || 320;
  const k = Math.max(4, Math.floor((css * (window.devicePixelRatio || 1)) / W));
  cv.width = W * k;
  cv.height = H * k;
  return k;
}
// Grid pixel (x, y), y up, to the canvas rectangle it fills.
const cell = (g, k, H, x, y, fill) => { g.fillStyle = fill; g.fillRect(x * k, (H - 1 - y) * k, k, k); };
const toCanvas = (k, H, [sx, sy]) => [(sx / SUB) * k, (H - sy / SUB) * k];

function gridLines(g, k, W, H, colour, every = 1, everyY = every) {
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1, k / 24);
  g.beginPath();
  for (let x = 0; x <= W; x += every) { g.moveTo(x * k, 0); g.lineTo(x * k, H * k); }
  for (let y = 0; y <= H; y += everyY) { g.moveTo(0, (H - y) * k); g.lineTo(W * k, (H - y) * k); }
  g.stroke();
}

function outline(g, k, H, tri, colour, width) {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.beginPath();
  tri.forEach((p, i) => { const [x, y] = toCanvas(k, H, p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.closePath();
  g.stroke();
}

// ---------------------------------------------------------------- 1. two triangles, one edge
// The square from (1, 0) to (9, 0) and (9, 8): its outer edges lie between pixel centres, so the
// only centres on any edge are the 8 on the diagonal from (1, 8) to (9, 0).
const SW = 10, SH = 8;
const BELOW = snap2([[1, 0], [9, 0], [1, 8]]); // blue, counter-clockwise
const ABOVE = snap2([[9, 0], [9, 8], [1, 8]]); // orange, counter-clockwise
const seam = { guess: null, rule: null };

// Which pixels a counter-clockwise triangle draws when every edge tests w >= 0 or w > 0. These are
// the two wrong rules lesson 1 starts from; the tie rule is the course's own rasterize.
function coverWith(tri, onEdgeInside) {
  const out = new Set();
  const [v0, v1, v2] = tri;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const p = [x * SUB + SUB / 2, y * SUB + SUB / 2];
      const ws = [edge(v1, v2, p), edge(v2, v0, p), edge(v0, v1, p)];
      if (ws.every((w) => (onEdgeInside ? w >= 0 : w > 0))) out.add(`${x},${y}`);
    }
  }
  return out;
}
function cover(tri, rule) {
  if (rule !== 'tie') return coverWith(tri, rule === 'ge');
  const out = new Set();
  rasterize(tri, { x0: 0, y0: 0, x1: SW, y1: SH }, (x, y) => out.add(`${x},${y}`));
  return out;
}
const onDiagonal = (x, y) => x >= 1 && x <= 8 && x + y === 8;

function drawSeam() {
  const cv = $('seam-canvas'), g = cv.getContext('2d');
  const k = fit(cv, SW, SH);
  g.fillStyle = C.paper;
  g.fillRect(0, 0, cv.width, cv.height);
  const a = seam.rule ? cover(BELOW, seam.rule) : null;
  const b = seam.rule ? cover(ABOVE, seam.rule) : null;
  let twice = 0, missed = 0, drawn = 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const key = `${x},${y}`;
      const inSquare = x >= 1 && x <= 8;
      if (!a) {
        if (inSquare && !onDiagonal(x, y)) cell(g, k, SH, x, y, x + y < 8 ? C.blue : C.orange);
        continue;
      }
      const n = (a.has(key) ? 1 : 0) + (b.has(key) ? 1 : 0);
      drawn += n;
      if (n === 2) { twice++; cell(g, k, SH, x, y, C.both); }
      else if (n === 1) cell(g, k, SH, x, y, a.has(key) ? C.blue : C.orange);
      else if (inSquare) missed++;
    }
  }
  gridLines(g, k, SW, SH, C.line);
  // Undecided or missed centres on the diagonal: a ring.
  for (let x = 1; x <= 8; x++) {
    const y = 8 - x, key = `${x},${y}`;
    const n = a ? (a.has(key) ? 1 : 0) + (b.has(key) ? 1 : 0) : -1;
    if (n === 0 || n === -1) {
      g.strokeStyle = n === 0 ? C.miss : C.soft;
      g.lineWidth = Math.max(2, k / 10);
      g.beginPath();
      g.arc((x + 0.5) * k, (SH - y - 0.5) * k, k * 0.28, 0, Math.PI * 2);
      g.stroke();
    }
  }
  outline(g, k, SH, BELOW, C.ink, Math.max(1.5, k / 16));
  outline(g, k, SH, ABOVE, C.ink, Math.max(1.5, k / 16));
  if (!seam.rule) return;
  const words = { ge: '"On an edge counts as inside"', gt: '"On an edge counts as outside"', tie: 'The tie rule' };
  $('seam-status').textContent = `${words[seam.rule]}: ${drawn} pixels drawn for a square of 64. ${twice} drawn twice, ${missed} missed.`;
  cv.setAttribute('aria-label', `The square under ${words[seam.rule].replace(/"/g, '')}: ${twice} pixels on the diagonal drawn by both triangles, ${missed} drawn by neither.`);
  // The red ring's key entry appears once a rule can leave a centre undrawn.
  const miss = $('seam-key-miss');
  if (miss) miss.hidden = false;
  const result = $('seam-result');
  result.textContent = '';
  const p = document.createElement('p');
  if (seam.rule === 'ge') {
    p.textContent = `${seam.guess === 'both' ? 'You called it.' : 'Not what you picked.'} Both triangles count the 8 centres as theirs, so those pixels are coloured twice. With see-through surfaces they show as a darker seam, and the GPU does the work for 8 pixels twice. Try the other two tests.`;
  } else if (seam.rule === 'gt') {
    p.textContent = 'Now neither triangle takes the 8 centres, and the square has a crack along its diagonal that the background shows through.';
  } else {
    p.textContent = 'A centre exactly on an edge is a tie. The tie rule gives it to the triangle whose inside lies to the right of that edge on the screen, toward larger x, or above it when the edge is flat. Orange\'s inside lies to the right of the diagonal and blue\'s to the left, so orange keeps all 8: 64 pixels, each drawn once. Both triangles apply the same rule to the same edge, so a tie can never go to both or to neither. The course has you write this rule, prove it with a check, and compare it with your own browser\'s GPU.';
  }
  result.append(p);
}

if (HAS_SEAM) {
  $('seam-predict').addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = new FormData(e.target).get('guess');
    if (!picked) { $('seam-hint').textContent = 'Pick one answer first.'; return; }
    seam.guess = picked;
    for (const el of e.target.elements) el.disabled = true;
    $('seam-hint').textContent = 'Locked in. Now try each test.';
    $('seam-rules').hidden = false;
    const first = document.querySelector('#seam-rules input[value="ge"]');
    first.checked = true;
    seam.rule = 'ge';
    drawSeam();
    first.focus();
  });
  for (const input of document.querySelectorAll('#seam-rules input')) {
    input.addEventListener('change', () => { seam.rule = input.value; drawSeam(); });
  }
  window.addEventListener('resize', drawSeam);
  drawSeam();
}

// ---------------------------------------------------------------- 2. drag a corner, count the warps
const WW = 32, WH = 24;
const SHAPES = {
  big: [[3.3, 2.6], [27.8, 6.1], [12.4, 21.7]],
  sliver: [[2.2, 3.1], [29.6, 9.4], [29.1, 10.6]],
  tiny: [[14.2, 10.3], [16.1, 10.9], [14.9, 12.4]],
};
// open: the corners and shapes unlock only after the guess, so the sliver's count can't be seen first.
const warp = { tri: snap2(SHAPES.big), pick: 0, drag: -1, open: false };
const NAMES = ['A', 'B', 'C'];
const px = (s) => String(s / SUB);

function measure() {
  const covered = [];
  rasterize(warp.tri, { x0: 0, y0: 0, x1: WW, y1: WH }, (x, y) => covered.push([x, y]));
  const blocks = new Set(covered.map(([x, y]) => `${Math.floor(x / 4)},${Math.floor(y / 2)}`));
  return { covered, blocks };
}

function drawWarp() {
  const cv = $('warp-canvas'), g = cv.getContext('2d');
  const k = fit(cv, WW, WH);
  g.fillStyle = C.paper;
  g.fillRect(0, 0, cv.width, cv.height);
  const { covered, blocks } = measure();
  // Lanes that wait: every pixel of a launched block.
  for (const b of blocks) {
    const [bx, by] = b.split(',').map(Number);
    for (let y = by * 2; y < by * 2 + 2; y++) for (let x = bx * 4; x < bx * 4 + 4; x++) cell(g, k, WH, x, y, C.waste);
  }
  for (const [x, y] of covered) cell(g, k, WH, x, y, C.cover);
  gridLines(g, k, WW, WH, C.line);
  gridLines(g, k, WW, WH, C.block, 4, 2);
  g.strokeStyle = C.warp;
  g.lineWidth = Math.max(2, k / 8);
  for (const b of blocks) {
    const [bx, by] = b.split(',').map(Number);
    g.strokeRect(bx * 4 * k, (WH - by * 2 - 2) * k, 4 * k, 2 * k);
  }
  outline(g, k, WH, warp.tri, C.ink, Math.max(1.5, k / 10));
  // The picked corner is drawn last, so its handle stays on top when two corners are close.
  [0, 1, 2].filter((i) => i !== warp.pick).concat(warp.pick).forEach((i) => {
    const p = warp.tri[i];
    const [x, y] = toCanvas(k, WH, p);
    g.fillStyle = i === warp.pick ? C.handle : C.ink;
    g.beginPath();
    g.arc(x, y, Math.max(9, k * 0.6), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `bold ${Math.max(11, Math.round(k * 0.7))}px -apple-system, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(NAMES[i], x, y + 1);
  });
  const lanes = blocks.size * 8, used = covered.length;
  const pct = lanes ? Math.round((100 * used) / lanes) : 0;
  const text = used
    ? `${used} pixels covered. ${blocks.size} warps launched, ${lanes} lanes: ${used} do work and ${lanes - used} wait (${pct}% busy).`
    : 'The triangle covers no pixel centre, so no warp is launched.';
  $('warp-status').textContent = text;
  $('warp-coords').textContent = 'Corners in pixels, after snapping to 1/16: ' +
    warp.tri.map((p, i) => `${NAMES[i]} (${px(p[0])}, ${px(p[1])})`).join(', ') + '.';
}

function pickCorner(i) {
  warp.pick = i;
  for (const b of document.querySelectorAll('.corner')) b.setAttribute('aria-pressed', String(Number(b.dataset.k) === i));
  drawWarp();
}
const clampS = (v, max) => Math.max(0, Math.min(max * SUB, v));
// A pointer position to the subpixel grid, y up.
function toSub(cv, e) {
  const r = cv.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * WW, y = WH - ((e.clientY - r.top) / r.height) * WH;
  return [clampS(Math.round(x * SUB), WW), clampS(Math.round(y * SUB), WH)];
}

if (HAS_WARP) {
  const cv = $('warp-canvas');
  cv.addEventListener('pointerdown', (e) => {
    if (!warp.open) return;
    const p = toSub(cv, e);
    let best = -1, bestD = (1.6 * SUB) ** 2;
    warp.tri.forEach((q, i) => { const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bestD) { bestD = d; best = i; } });
    if (best < 0) return;
    warp.drag = best;
    // A drag redraws on every move; announce the count once, when it ends.
    $('warp-status').setAttribute('aria-live', 'off');
    cv.setPointerCapture(e.pointerId);
    pickCorner(best);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (warp.drag < 0) return;
    warp.tri[warp.drag] = toSub(cv, e);
    drawWarp();
  });
  const end = () => {
    if (warp.drag < 0) return;
    warp.drag = -1;
    $('warp-status').setAttribute('aria-live', 'polite');
    drawWarp();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('.corner')) b.addEventListener('click', () => pickCorner(Number(b.dataset.k)));
  for (const b of document.querySelectorAll('[data-shape]')) {
    b.addEventListener('click', () => { warp.tri = snap2(SHAPES[b.dataset.shape]); drawWarp(); });
  }
  // The prediction: guess, then the page loads the sliver and compares its busy lanes with the big triangle's.
  const busy = (tri) => {
    const before = warp.tri; warp.tri = snap2(tri);
    const { covered, blocks } = measure(); warp.tri = before;
    return Math.round((100 * covered.length) / (blocks.size * 8));
  };
  $('warp-predict').addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = new FormData(e.target).get('guess');
    if (!picked) { $('warp-hint').textContent = 'Pick one answer first.'; return; }
    for (const el of e.target.elements) el.disabled = true;
    warp.open = true;
    $('warp-play').hidden = false;
    const big = busy(SHAPES.big), thin = busy(SHAPES.sliver);
    warp.tri = snap2(SHAPES.sliver);
    drawWarp();
    $('warp-hint').textContent = 'Locked in. The grid now shows the sliver, and the corners and shapes below are yours to try.';
    const p = document.createElement('p');
    p.textContent = `${picked === 'less' ? 'You called it.' : 'Not what you picked.'} The big triangle keeps ${big}% of its lanes busy, the sliver ${thin}%. A thin triangle crosses many blocks but covers only a pixel or two in each, so most lanes in each warp carry no pixel. In the course, the floor of a 3D scene drawn by warps keeps 7.74 of 8 lanes busy on average, and a scene of smaller, thinner triangles only 5.03. Drag the corners and see how thin a triangle can get before its warps are mostly empty.`;
    $('warp-result').textContent = '';
    $('warp-result').append(p);
    $('warp-result').focus();
  });
  const MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  $('warp').addEventListener('keydown', (e) => {
    const m = MOVES[e.key];
    if (!m || !warp.open || !(e.target === cv || e.target.classList.contains('corner'))) return;
    e.preventDefault();
    const step = e.shiftKey ? SUB : 1, p = warp.tri[warp.pick];
    warp.tri[warp.pick] = [clampS(p[0] + m[0] * step, WW), clampS(p[1] + m[1] * step, WH)];
    drawWarp();
  });
  window.addEventListener('resize', drawWarp);
  drawWarp();
}
