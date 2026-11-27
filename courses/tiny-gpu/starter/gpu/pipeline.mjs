// Supplied: the pipeline that wires the units together.
//
// render(scene, opts) -> {
//   image: { w, h, rgba: Uint8Array, ids: Int32Array },
//   ties: Uint8Array, depth: Float32Array,
//   counts: { fragments, shaded, warps, issues,
//             bytes: { depth, color, bins, tex },
//             cache: { hits, misses } } }
//
// opts.stage (default 4) picks which units' code runs:
//   1  2D scenes only: snap2, rasterize; each triangle is filled
//      with its first vertex's colour, drawn in order.
//   2  3D scenes too: transform, clipNear, toWindow; still flat
//      colour and drawn in order (no depth buffer yet).
//   3  interpolate and depthTest: colours are interpolated and a
//      textured triangle shows a uv checker (uvChecker below).
//   4  textures: colour times sample(tex, u, v, opts.filter), with
//      opts.filter 'nearest' (default) or 'linear'.
//   5  scene.shader (program text), when the scene has one, runs
//      with runLane on each fragment that passed the depth test.
//      counts.issues adds up the instructions run. Without a shader,
//      stages 5 and on shade as stage 4.
//   6  the same fragments shaded by warps: per triangle, the pixels
//      that passed are grouped by 4 x 2 block and each block runs
//      runWarp once with those lanes in its mask (opts.skip = false
//      turns off skipping an empty side). counts.warps, issues.
//      opts.block = [8, 1] groups 8 x 1 blocks instead.
//   7  memory is counted: per block, the depth reads of the covered
//      lanes and the depth and colour writes of the lanes that
//      passed, as transactions(addresses, mask) x SEGMENT bytes
//      (framebuffers row-major, 4 bytes a pixel); texture reads go
//      through a TextureCache (CACHE) with textures stored in
//      opts.layout, 'linear' (default) or 'tiled'. Per warp, the
//      distinct cache lines its tex reads touch, in the order first
//      touched, are one access each. Textures sample 'nearest' from
//      stage 7 on.
//   8  opts.mode 'tiled': window triangles are binned with bin and
//      each tile drawn by renderTile; colour is stored once per pixel
//      and binning is counted in bytes.bins. 'immediate' (default)
//      draws as stage 7.
//   9  opts.mode 'visible': renderVisible from capstone.mjs draws the
//      tiles; shadeWarp is its only way to a colour.
// opts.ties = true fills `ties` (1 where a pixel centre lies exactly
// on an edge of some triangle); otherwise it stays all 0.
// opts.trace (an array, stage 6 on): each warp appends { x0, y0, id,
// issues, misses } (misses: texture cache misses, stage 7 on). With
// opts.trace set, at any stage, the result also holds uv: a
// Float64Array of 2 per pixel, the interpolated (u, v) of the fragment
// whose colour the pixel shows (NaN where none did, or at stages 1-2).
// counts: fragments = pixels rasterize emitted (immediate mode);
// shaded = fragments that reached shading.
// In 'tiled' and 'visible' modes the result also holds provenance:
// { ids, rgba }, for each pixel the triangle id and colour of the
// last shading (by warp) that covered it; -1 where none did.
//
// A 2D scene (no camera) gives each vertex p = [x, y] in window
// pixels, optionally [x, y, z, w]: window depth z (default 0.5) and
// clip w (default 1) for perspective-correct interpolation.
//
// glScene(scene) -> plain JSON for the WebGL comparison page:
//   { name, width, height, clear: [r, g, b], camera: boolean,
//     textures: { NAME: { w, h, data: [RGBA levels, row 0 = v 0] } },
//     tris: [{ id, tex: NAME or null,
//              v: [ { c: [x, y, z, w], a: [r, g, b, u, v,
//                                          nx, ny, nz] } x 3 ] }] }
// c is the vertex in clip space, from matrix.mjs's apply4 (never the
// learner's transform). For a 2D scene c is chosen so the divide and
// the viewport land the vertex on its window position:
//   c = [(2x / W - 1) w, (2y / H - 1) w, (2z - 1) w, w].
// Draw in array order with a W x H viewport, no culling. Stages 1-2:
// flat colour a[0..2] of vertex 0, no depth test. Stage 3: colour
// a[0..2] interpolated, times uvChecker(u, v) when tex is set, depth
// LESS cleared to 1. Stage 4: colour times the texture (nearest,
// repeat). Stage 5 on: glsl (when the scene has a shader) is its
// GLSL twin, a function vec3 shade(vec3 color, vec2 uv, vec3 n)
// with texture NAME bound to sampler tex_NAME; shader names the
// program. The page owns its picture's ids; tri.id identifies them.

import { SUB, fullRect, rasterize, snap2 } from './raster.mjs';
import { clipNear, toWindow, transform } from './vertex.mjs';
import { apply4, viewProjection } from './matrix.mjs';
import { depthTest, interpolate, toByte } from './interp.mjs';
import { sample } from './texture.mjs';
import { assemble, runLane } from './shader.mjs';
import { LANES, laneOf, loadWarp, runWarp } from './warp.mjs';
import { CACHE, SEGMENT, TextureCache, storeTexture, texelAddress,
  transactions } from './memory.mjs';
import { TILE, bin, renderTile } from './tiles.mjs';
import { renderVisible } from './capstone.mjs';

export const ATTRS = ['r', 'g', 'b', 'u', 'v', 'nx', 'ny', 'nz'];

export function attrsOf(v) {
  const c = v.c ?? [1, 1, 1];
  const uv = v.uv ?? [0, 0];
  const n = v.n ?? [0, 0, 1];
  return [c[0], c[1], c[2], uv[0], uv[1], n[0], n[1], n[2]];
}

// The stage 3 stand-in for a texture: squares half a uv unit wide.
export function uvChecker(u, v) {
  return (Math.floor(2 * u) + Math.floor(2 * v)) & 1 ? 0.85 : 1;
}

export function newTarget(scene) {
  const { width: w, height: h } = scene;
  const rgba = new Uint8Array(w * h * 4);
  const clear = (scene.clear ?? [0, 0, 0]).map(toByte);
  for (let i = 0; i < w * h; i++) rgba.set([...clear, 255], i * 4);
  return {
    w, h, rgba,
    ids: new Int32Array(w * h).fill(-1),
    ties: new Uint8Array(w * h),
    depth: new Float32Array(w * h).fill(1),
    uv: null,
    counts: {
      fragments: 0, shaded: 0, warps: 0, issues: 0,
      bytes: { depth: 0, color: 0, bins: 0, tex: 0 },
      cache: { hits: 0, misses: 0 },
    },
  };
}

// One scene triangle -> 0, 1 or 2 window triangles of
// { x, y, z, invW, a } (x, y in subpixels).
export function windowTris(tri, ctx) {
  const { target, vp } = ctx;
  if (!vp) {
    const pts = snap2(tri.v.map((v) => v.p));
    return [tri.v.map((v, k) => ({
      x: pts[k][0], y: pts[k][1],
      z: v.p[2] ?? 0.5, invW: 1 / (v.p[3] ?? 1), a: attrsOf(v),
    }))];
  }
  const clip = tri.v.map((v) => ({
    c: transform(vp, v.p), a: attrsOf(v),
  }));
  return clipNear(clip).map((piece) => piece.map((cv) => ({
    ...toWindow(cv.c, target.w, target.h), a: cv.a,
  })));
}

// Rasterize one window triangle inside rect, depth-test (stage 3+),
// shade the survivors and write them.
export function drawTriangle(tri, win, rect, ctx) {
  const { target, stage } = ctx;
  const frags = [];
  const covered = ctx.memory ? [] : null; // for unit 7's counts
  const pts = win.map((v) => [v.x, v.y]);
  rasterize(pts, rect, (x, y, w0, w1, w2) => {
    const i = y * target.w + x;
    target.counts.fragments++;
    covered?.push({ x, y });
    if (stage < 3) return void frags.push({ x, y, i, attrs: null });
    const f = interpolate(win, [w0, w1, w2], ATTRS.length);
    if (depthTest(target.depth, i, f.z)) {
      frags.push({ x, y, i, attrs: f.attrs });
    }
  });
  const colours = ctx.shade(tri, frags);
  target.counts.shaded += frags.length;
  frags.forEach((f, k) =>
    writePixel(target, f.i, colours[k], tri.id, f.attrs));
  if (covered) countFramebuffer(ctx, covered, frags);
}

function writePixel(target, i, rgb, id, attrs) {
  target.rgba.set([toByte(rgb[0]), toByte(rgb[1]), toByte(rgb[2]), 255],
    i * 4);
  target.ids[i] = id;
  traceUV(target, i, attrs);
}

// opts.trace: the texture coordinate behind pixel i's colour.
function traceUV(target, i, attrs) {
  if (target.uv && attrs) target.uv.set([attrs[3], attrs[4]], i * 2);
}

// texOf(name, u, v) reads a texture (stage 7 on: through memory).
function fixedShade(ctx, texOf) {
  const { scene, stage, opts } = ctx;
  const filter = opts.filter ?? 'nearest';
  const read = texOf ??
    ((name, u, v) => sample(scene.textures[name], u, v, filter));
  return (tri, attrs) => {
    if (stage <= 2) return tri.v[0].c;
    const rgb = attrs.slice(0, 3);
    if (!tri.tex) return rgb;
    const [u, v] = [attrs[3], attrs[4]];
    if (stage === 3) return rgb.map((c) => c * uvChecker(u, v));
    const t = read(tri.tex, u, v);
    return [rgb[0] * t[0], rgb[1] * t[1], rgb[2] * t[2]];
  };
}

// ---- SEAM: shading for stages 5 and on --------------------------
// shaderFor(ctx) returns shade(tri, frags) -> one [r, g, b] per
// fragment, where a fragment is { x, y, attrs } (attrs in ATTRS
// order, null at stages 1-2). Stage 5 runs scene.shader per fragment;
// stage 6 on groups frags into warps and adds to ctx.target.counts.
function shaderFor(ctx) {
  const { stage, scene } = ctx;
  if (stage < 5) {
    const fixed = fixedShade(ctx);
    return (tri, frags) => frags.map((f) => fixed(tri, f.attrs));
  }
  ctx.memory = stage >= 7 ? newMemory(ctx) : null;
  const nearest = (name, u, v) =>
    sample(scene.textures[name], u, v, 'nearest');
  ctx.env = { tex: ctx.memory ? ctx.memory.fetch : nearest };
  ctx.fixed = fixedShade(ctx, ctx.memory?.fetch);
  ctx.program = scene.shader ? assemble(scene.shader) : null;
  if (stage >= 6) return (tri, frags) => shadeWarps(ctx, tri, frags);
  const { counts } = ctx.target;
  return (tri, frags) => frags.map((f) => {
    if (!ctx.program) return ctx.fixed(tri, f.attrs);
    const r = runLane(ctx.program, f.attrs, ctx.env);
    counts.issues += r.issues;
    return r.out;
  });
}

// The block a pixel falls in: 4 x 2 unless opts.block says otherwise.
function blockOf(ctx, x, y) {
  const [bw, bh] = ctx.opts.block ?? [4, 2];
  const x0 = x - (x % bw);
  const y0 = y - (y % bh);
  return { key: y0 * ctx.target.w + x0, x0, y0,
    lane: (y - y0) * bw + (x - x0) };
}

// Groups fragments by block, in the order each block is first met.
function groupBlocks(ctx, frags) {
  const blocks = new Map();
  frags.forEach((f, n) => {
    const b = blockOf(ctx, f.x, f.y);
    if (!blocks.has(b.key)) {
      blocks.set(b.key, { x0: b.x0, y0: b.y0,
        at: new Array(LANES).fill(-1) });
    }
    blocks.get(b.key).at[b.lane] = n;
  });
  return [...blocks.values()];
}

const maskOf = (at) =>
  at.reduce((m, n, k) => (n >= 0 ? m | (1 << k) : m), 0);

function shadeWarps(ctx, tri, frags) {
  const out = new Array(frags.length);
  for (const b of groupBlocks(ctx, frags)) {
    const attrsOf = (k) => (b.at[k] >= 0 ? frags[b.at[k]].attrs : null);
    const colours = runBlock(ctx, tri, attrsOf, maskOf(b.at), b);
    b.at.forEach((n, k) => {
      if (n >= 0) out[n] = colours[k];
    });
  }
  return out;
}

// One warp: the program (or fixed shading) on the lanes in mask.
// at = { x0, y0 }, the block, for opts.trace.
function runBlock(ctx, tri, attrsOf, mask, at) {
  const { counts } = ctx.target;
  const before = { issues: counts.issues,
    misses: ctx.memory?.cache.misses ?? 0 };
  counts.warps += 1;
  ctx.memory?.begin();
  let colours;
  if (ctx.program) {
    const lanes = loadWarp(ctx.program, attrsOf);
    const r = runWarp(ctx.program, lanes, mask, ctx.env,
      { skip: ctx.opts.skip });
    counts.issues += r.issues;
    colours = lanes.map((l) => l.out);
  } else {
    colours = Array.from({ length: LANES }, (_, k) =>
      (mask & (1 << k) ? ctx.fixed(tri, attrsOf(k)) : null));
  }
  ctx.memory?.end();
  ctx.opts.trace?.push({ x0: at.x0, y0: at.y0, id: tri.id,
    issues: counts.issues - before.issues,
    misses: (ctx.memory?.cache.misses ?? 0) - before.misses });
  return colours;
}

// ---- unit 7: memory ----------------------------------------------

const wrap = (i, n) => ((i % n) + n) % n;

// Textures stored in opts.layout, one after another in memory, and
// the cache in front of them. fetch(name, u, v) reads the nearest
// texel through texelAddress and notes its cache line; end() sends
// the warp's lines to the cache, each once, first touched first.
function newMemory(ctx) {
  const layout = ctx.opts.layout ?? 'linear';
  const cache = new TextureCache(CACHE);
  const stored = {};
  let base = 0;
  for (const [name, tex] of Object.entries(ctx.scene.textures ?? {})) {
    stored[name] = { tex, data: storeTexture(tex, layout), base };
    base += Math.ceil(tex.data.length / SEGMENT) * SEGMENT;
  }
  let lines = null;
  return {
    cache,
    begin() {
      lines = new Set();
    },
    fetch(name, u, v) {
      const s = stored[name];
      if (!s) throw new Error(`no texture ${name} in the scene`);
      const { tex, data } = s;
      const x = wrap(Math.floor(u * tex.w), tex.w);
      const y = wrap(Math.floor(v * tex.h), tex.h);
      const a = texelAddress(tex, x, y, layout);
      lines?.add(Math.floor((s.base + a) / SEGMENT));
      return [data[a] / 255, data[a + 1] / 255, data[a + 2] / 255,
        data[a + 3] / 255];
    },
    end() {
      for (const line of lines) cache.access(line * SEGMENT);
      lines = null;
    },
  };
}

// Immediate mode, one triangle: per block, depth read by the covered
// lanes, depth and colour written by the lanes that passed.
function countFramebuffer(ctx, covered, frags) {
  const { w } = ctx.target;
  const { bytes } = ctx.target.counts;
  const blocks = new Map();
  const note = (f, field) => {
    const b = blockOf(ctx, f.x, f.y);
    if (!blocks.has(b.key)) {
      const [bw] = ctx.opts.block ?? [4, 2];
      const addr = Array.from({ length: LANES }, (_, k) =>
        ((b.y0 + Math.floor(k / bw)) * w + b.x0 + (k % bw)) * 4);
      blocks.set(b.key, { addr, cover: 0, pass: 0 });
    }
    blocks.get(b.key)[field] |= 1 << b.lane;
  };
  covered.forEach((f) => note(f, 'cover'));
  frags.forEach((f) => note(f, 'pass'));
  for (const { addr, cover, pass } of blocks.values()) {
    const read = transactions(addr, cover) * SEGMENT;
    const written = transactions(addr, pass) * SEGMENT;
    bytes.depth += read + written;
    bytes.color += written;
  }
}

// ---- units 8 and 9: tiles -----------------------------------------

// Binning traffic: 4 bytes per list entry and 64 per triangle record
// written; 4 per entry and 64 per record read for every entry.
function countBins(target, lists) {
  const entries = lists.reduce((n, l) => n + l.length, 0);
  const records = new Set(lists.flat()).size;
  target.counts.bytes.bins += 4 * entries + 64 * records
    + (4 + 64) * entries;
}

const toLevels = (rgb) =>
  [toByte(rgb[0]), toByte(rgb[1]), toByte(rgb[2]), 255];

function provenance(target) {
  if (!target.provenance) {
    const n = target.w * target.h;
    target.provenance = { ids: new Int32Array(n).fill(-1),
      rgba: new Uint8Array(n * 4) };
  }
  return target.provenance;
}

function record(target, x, y, levels, id, attrs) {
  const p = provenance(target);
  const i = y * target.w + x;
  p.ids[i] = id;
  p.rgba.set(levels, i * 4);
  traceUV(target, i, attrs);
}

// What renderTile and renderVisible are handed.
function tileContext(ctx) {
  const { target, opts } = ctx;
  const size = opts.tile ?? TILE;
  const tris = [];
  for (const tri of ctx.scene.tris) {
    for (const win of windowTris(tri, ctx)) {
      const pts = win.map((v) => [v.x, v.y]);
      tris.push({ id: tri.id, tri, win, pts });
    }
  }
  const lists = bin(tris.map((t) => t.pts), target.w, target.h, size);
  countBins(target, lists);
  const clear = target.rgba.subarray(0, 4);
  const background = new Uint8Array(size * size * 4);
  for (let j = 0; j < size * size; j++) background.set(clear, j * 4);
  provenance(target);
  return {
    W: target.w, H: target.h, size, tris, lists, background,
    chip: { depth: new Float32Array(size * size),
      rgba: new Uint8Array(size * size * 4),
      ids: new Int32Array(size * size) },
    store: (tx, ty, parts) => store(ctx, size, tx, ty, parts),
  };
}

function store(ctx, size, tx, ty, parts = ['colour']) {
  const { target } = ctx;
  const { chip } = ctx.tiles;
  const x0 = tx * size;
  const y0 = ty * size;
  const colour = parts.includes('colour');
  const depth = parts.includes('depth');
  for (let y = y0; y < Math.min(y0 + size, target.h); y++) {
    for (let x = x0; x < Math.min(x0 + size, target.w); x++) {
      const j = (y - y0) * size + (x - x0);
      const i = y * target.w + x;
      if (colour) {
        target.rgba.set(chip.rgba.subarray(j * 4, j * 4 + 4), i * 4);
        target.ids[i] = chip.ids[j];
        target.counts.bytes.color += 4;
      }
      if (depth) {
        target.depth[i] = chip.depth[j];
        target.counts.bytes.depth += 4;
      }
    }
  }
}

// Unit 8: draw-order shading of a tile's fragments, as RGBA levels.
function tileShade(ctx, t, frags) {
  ctx.target.counts.shaded += frags.length;
  return ctx.shade(t.tri, frags).map((rgb, n) => {
    const levels = toLevels(rgb);
    record(ctx.target, frags[n].x, frags[n].y, levels, t.id,
      frags[n].attrs);
    return levels;
  });
}

// Unit 9: one warp for triangle k on the 4 x 2 block at (x0, y0).
function shadeWarp(ctx, k, x0, y0, mask) {
  const t = ctx.tiles.tris[k];
  if (!t) throw new Error(`shadeWarp: there is no triangle ${k}`);
  if (x0 % 4 || y0 % 2 || !(mask > 0 && mask < 256)) {
    throw new Error(`shadeWarp: a block starts at x % 4 = 0 and ` +
      `y % 2 = 0 with a mask of 1 to 255, not (${x0}, ${y0}) ${mask}`);
  }
  const attrs = new Array(LANES).fill(null);
  const rect = { x0, y0, x1: x0 + 4, y1: y0 + 2 };
  rasterize(t.pts, rect, (x, y, w0, w1, w2) => {
    attrs[laneOf(x, y, x0, y0)] =
      interpolate(t.win, [w0, w1, w2], ATTRS.length).attrs;
  });
  for (let lane = 0; lane < LANES; lane++) {
    if (mask & (1 << lane) && !attrs[lane]) {
      throw new Error(`shadeWarp: lane ${lane}, pixel (` +
        `${x0 + (lane & 3)}, ${y0 + (lane >> 2)}), is not covered by ` +
        `triangle ${k} (id ${t.id})`);
    }
  }
  const attrsOf = (lane) => (mask & (1 << lane) ? attrs[lane] : null);
  const colours = runBlock(ctx, t.tri, attrsOf, mask, { x0, y0 });
  return colours.map((rgb, lane) => {
    if (!(mask & (1 << lane))) return null;
    ctx.target.counts.shaded += 1;
    const levels = toLevels(rgb);
    record(ctx.target, x0 + (lane & 3), y0 + (lane >> 2), levels, t.id,
      attrs[lane]);
    return levels;
  });
}

function renderTiles(ctx, visible) {
  const t = tileContext(ctx);
  ctx.tiles = t;
  if (visible) {
    t.shadeWarp = (k, x0, y0, mask) => shadeWarp(ctx, k, x0, y0, mask);
    renderVisible(t);
  } else {
    t.shade = (tri, frags) => tileShade(ctx, tri, frags);
    const tilesX = Math.ceil(t.W / t.size);
    t.lists.forEach((list, n) =>
      renderTile(n % tilesX, Math.floor(n / tilesX), list, t));
  }
  if (ctx.opts.ties) {
    for (const x of t.tris) markTies(x.win, ctx.target);
  }
}
// ---- end SEAM ----------------------------------------------------

// A centre exactly on an edge is a tie. rasterize reports ties only
// on the edges that own them. Turned 180 degrees about the picture's
// centre, every edge points the other way and owns the other ties,
// while pixel centres still land on pixel centres.
function markTies(win, target) {
  const { w: W, h: H } = target;
  const rect = fullRect(W, H);
  const mark = (x, y, w0, w1, w2) => {
    if (w0 === 0 || w1 === 0 || w2 === 0) target.ties[y * W + x] = 1;
  };
  const pts = win.map((v) => [v.x, v.y]);
  rasterize(pts, rect, mark);
  const turned = pts.map(([x, y]) => [W * SUB - x, H * SUB - y]);
  rasterize(turned, rect, (x, y, w0, w1, w2) =>
    mark(W - 1 - x, H - 1 - y, w0, w1, w2));
}

export function render(scene, opts = {}) {
  const stage = opts.stage ?? 4;
  if (stage === 1 && scene.camera) {
    throw new Error('render: stage 1 draws 2D scenes only');
  }
  const target = newTarget(scene);
  if (opts.trace) {
    target.uv = new Float64Array(target.w * target.h * 2).fill(NaN);
  }
  const vp = scene.camera
    ? viewProjection(scene.camera, scene.width, scene.height)
    : null;
  const mode = opts.mode ?? 'immediate';
  const least = { immediate: 1, tiled: 8, visible: 9 }[mode];
  if (!least || stage < least) {
    throw new Error(`render: mode '${mode}' needs stage ${least ?? 8}` +
      ' or later (modes: immediate, tiled, visible)');
  }
  const ctx = { scene, stage, opts, target, vp };
  ctx.shade = shaderFor(ctx);
  if (mode === 'immediate') {
    const rect = fullRect(target.w, target.h);
    for (const tri of scene.tris) {
      for (const win of windowTris(tri, ctx)) {
        drawTriangle(tri, win, rect, ctx);
        if (opts.ties) markTies(win, target);
      }
    }
  } else {
    renderTiles(ctx, mode === 'visible');
  }
  if (ctx.memory) {
    const { cache } = ctx.memory;
    target.counts.bytes.tex = cache.bytes;
    target.counts.cache = { hits: cache.hits, misses: cache.misses };
  }
  const { w, h, rgba, ids, ties, depth, counts } = target;
  const out = { image: { w, h, rgba, ids }, ties, depth, counts };
  if (target.provenance) out.provenance = target.provenance;
  if (target.uv) out.uv = target.uv;
  return out;
}

function windowToClip(p, W, H) {
  const [x, y, z = 0.5, w = 1] = p;
  return [(2 * x / W - 1) * w, (2 * y / H - 1) * w, (2 * z - 1) * w, w];
}

export function glScene(scene) {
  const { width: W, height: H } = scene;
  const vp = scene.camera ? viewProjection(scene.camera, W, H) : null;
  const clipOf = vp
    ? (p) => apply4(vp, p)
    : (p) => windowToClip(p, W, H);
  const textures = {};
  for (const [name, t] of Object.entries(scene.textures ?? {})) {
    textures[name] = { w: t.w, h: t.h, data: Array.from(t.data) };
  }
  return {
    name: scene.name, width: W, height: H,
    clear: [...(scene.clear ?? [0, 0, 0])], camera: !!vp, textures,
    shader: scene.shader ? scene.shaderName ?? null : null,
    glsl: scene.shader ? scene.glsl ?? null : null,
    tris: scene.tris.map((tri) => ({
      id: tri.id, tex: tri.tex ?? null,
      v: tri.v.map((v) => ({ c: clipOf(v.p), a: attrsOf(v) })),
    })),
  };
}
