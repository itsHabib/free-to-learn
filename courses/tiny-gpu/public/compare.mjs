// The comparison page: draws the lab's scene with the browser's own WebGL2, posts the
// pixels back to the lab, and shows your picture, WebGL's and the difference.
// Started by: node lab.mjs compare N
//
// First it measures two things about this GPU, from small scenes drawn with additive
// counting and matched against hashes in tie-rules.json: the tie rule, and the grid it
// snaps vertices to (WebGL promises 1/16 of a pixel or finer). It tells the lab the grid,
// the lab draws your picture on that grid and sends it back, and then the page draws the
// unit's scenes.
//
// The scene arrives as pipeline.mjs's glScene: each vertex in clip coordinates (worked
// out by the supplied matrix code, never by your transform) with its attributes
// r g b u v nx ny nz. The page follows the pipeline's stages:
//   1-2  each triangle filled with its first vertex's colour, drawn in order
//   3    colour interpolated (perspective-correct), times the uv checker when the
//        triangle has a texture; depth test LESS, cleared to 1
//   4    colour times the texture's texel (nearest, or bilinear), repeat wrapping
//   5+   the scene's GLSL shader, when it has one
// Two passes per scene into an offscreen framebuffer: colour, then each triangle's
// id + 1, flat, in red, green and blue (0 = no triangle). readPixels returns row 0 at
// the bottom, the same order as the lab's pictures.
//
// A GLSL shader is either a whole fragment shader (it has "void main") with
//   in vec3 vColor; in vec2 vUV; in vec3 vNormal; out vec4 fragColor;
// or a function  vec3 shade(vec3 color, vec2 uv, vec3 n)  that this page wraps.
// Texture NAME is the sampler uniform tex_NAME.

const token = new URLSearchParams(location.search).get('t') ?? '';
const $ = (id) => document.getElementById(id);

const VS = `#version 300 es
in vec4 aClip; in vec3 aColor; in vec2 aUV; in vec3 aNormal; in float aId;
out vec3 vColor; out vec2 vUV; out vec3 vNormal; flat out float vId;
void main() {
  gl_Position = aClip;
  vColor = aColor; vUV = aUV; vNormal = aNormal; vId = aId;
}`;

const FS_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec3 vColor; in vec2 vUV; in vec3 vNormal; flat in float vId;
uniform int uMode; uniform int uStage; uniform bool uUseTex; uniform sampler2D uTex;
out vec4 fragColor;
`;

const FIXED = `${FS_HEAD}
vec4 idColour() {
  int id = int(vId) + 1;
  return vec4(float(id & 255), float((id >> 8) & 255), float((id >> 16) & 255), 255.0) / 255.0;
}
float uvChecker(vec2 uv) {
  return mod(floor(2.0 * uv.x) + floor(2.0 * uv.y), 2.0) > 0.5 ? 0.85 : 1.0;
}
void main() {
  if (uMode == 1) { fragColor = idColour(); return; }
  if (uMode == 2) { fragColor = vec4(1.0 / 255.0, 0.0, 0.0, 1.0); return; }
  vec3 t = vec3(1.0);
  if (uUseTex && uStage == 3) t = vec3(uvChecker(vUV));
  if (uUseTex && uStage >= 4) t = texture(uTex, vUV).rgb;
  fragColor = vec4(vColor * t, 1.0);
}`;

function shaderSource(glsl, textures) {
  if (/\bvoid\s+main\s*\(/.test(glsl)) return glsl.startsWith('#version') ? glsl : `#version 300 es\nprecision highp float;\n${glsl}`;
  const samplers = textures.map((n) => `uniform sampler2D tex_${n};`).join('\n');
  return `${FS_HEAD}${samplers}\n${glsl}\nvoid main() { fragColor = vec4(shade(vColor, vUV, vNormal), 1.0); }`;
}

// ------------------------------------------------------------------ WebGL plumbing

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(`shader did not compile: ${gl.getShaderInfoLog(s)}`);
  return s;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aClip');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(`shader did not link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

// An offscreen colour and depth target of the scene's size; returns a function that frees it.
function target(gl, w, h) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const bufs = [[gl.RGBA8, gl.COLOR_ATTACHMENT0], [gl.DEPTH_COMPONENT32F, gl.DEPTH_ATTACHMENT]].map(([format, at]) => {
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, format, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, at, gl.RENDERBUFFER, rb);
    return rb;
  });
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('this browser cannot make the offscreen framebuffer');
  return () => { bufs.forEach((rb) => gl.deleteRenderbuffer(rb)); gl.deleteFramebuffer(fb); };
}

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function base64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function uploadTextures(gl, textures, filter) {
  const out = {};
  const f = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
  for (const [name, t] of Object.entries(textures ?? {})) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const data = typeof t.data === 'string' ? bytes(t.data) : Uint8Array.from(t.data);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    out[name] = tex;
  }
  return out;
}

// One vertex: clip, colour, uv, normal, id: 13 floats. Stages 1 and 2 fill each
// triangle with its first vertex's colour.
function vertexData(tris, stage) {
  const f = new Float32Array(tris.length * 3 * 13);
  let k = 0;
  for (const t of tris) {
    for (const v of t.v) {
      const a = v.a ?? [1, 1, 1, 0, 0, 0, 0, 1];
      const colour = stage <= 2 ? (t.v[0].a ?? a).slice(0, 3) : a.slice(0, 3);
      f.set([...v.c, ...colour, ...a.slice(3, 8), t.id], k);
      k += 13;
    }
  }
  return f;
}

function bindVertices(gl, prog, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  for (const [name, n, off] of [['aClip', 4, 0], ['aColor', 3, 4], ['aUV', 2, 7], ['aNormal', 3, 9], ['aId', 1, 12]]) {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) continue;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 13 * 4, off * 4);
  }
  return () => { gl.bindVertexArray(null); gl.deleteVertexArray(vao); gl.deleteBuffer(buf); };
}

// Draws the triangles in order, one draw call per run of triangles with the same texture.
function drawRuns(gl, prog, tris, textures) {
  const useTex = gl.getUniformLocation(prog, 'uUseTex');
  let start = 0;
  while (start < tris.length) {
    let end = start;
    while (end < tris.length && tris[end].tex === tris[start].tex) end++;
    const tex = textures[tris[start].tex];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex ?? null);
    if (useTex) gl.uniform1i(useTex, tex ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, start * 3, (end - start) * 3);
    start = end;
  }
}

function bindSamplers(gl, prog, textures) {
  const base = gl.getUniformLocation(prog, 'uTex');
  if (base) gl.uniform1i(base, 0);
  Object.entries(textures).forEach(([name, tex], i) => {
    const loc = gl.getUniformLocation(prog, `tex_${name}`);
    if (!loc) return;
    gl.activeTexture(gl.TEXTURE1 + i);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, 1 + i);
  });
}

const setInt = (gl, prog, name, v) => { const l = gl.getUniformLocation(prog, name); if (l) gl.uniform1i(l, v); };

// mode 0 colour, 1 ids, 2 additive coverage count.
function pass(gl, prog, scene, stage, mode, textures) {
  const { width: w, height: h } = scene;
  gl.useProgram(prog);
  gl.viewport(0, 0, w, h);
  const clear = mode === 0 ? scene.clear ?? [0, 0, 0] : [0, 0, 0];
  gl.clearColor(clear[0], clear[1], clear[2], mode === 0 ? 1 : 0);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (mode === 2) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND);
  if (mode === 2 || stage < 3) gl.disable(gl.DEPTH_TEST);
  else { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); }
  gl.disable(gl.CULL_FACE);
  setInt(gl, prog, 'uMode', mode);
  setInt(gl, prog, 'uStage', stage);
  bindSamplers(gl, prog, textures);
  const unbind = bindVertices(gl, prog, vertexData(scene.tris, stage));
  drawRuns(gl, prog, scene.tris, textures);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  unbind();
  return px;
}

function renderScene(gl, fixed, scene, job) {
  const free = target(gl, scene.width, scene.height);
  const textures = uploadTextures(gl, scene.textures, job.filter);
  try {
    const custom = scene.glsl ? program(gl, shaderSource(scene.glsl, Object.keys(textures))) : null;
    const rgba = pass(gl, custom ?? fixed, scene, job.stage, 0, textures);
    const ids = pass(gl, fixed, scene, job.stage, 1, textures);
    if (custom) gl.deleteProgram(custom);
    return { rgba, ids };
  } finally {
    Object.values(textures).forEach((t) => gl.deleteTexture(t));
    free();
  }
}

// The eight tie rules differ only on pixels exactly on an edge; tie-rules.json holds the
// coverage hash each rule gives for three scenes. Same hash as tools/tie-rules.mjs.
function fnv1a(u8) {
  let h = 0x811c9dc5;
  for (const b of u8) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function countHash(gl, fixed, n, tris) {
  const clip = ([x, y]) => [(2 * x) / n - 1, (2 * y) / n - 1, 0, 1];
  const scene = { width: n, height: n, tris: tris.map((t, id) => ({ id, v: t.map((p) => ({ c: clip(p) })) })) };
  const free = target(gl, n, n);
  try {
    const px = pass(gl, fixed, scene, 1, 2, {});
    return fnv1a(px.filter((_, i) => i % 4 === 0));
  } finally { free(); }
}

// The snap grid: the probe's coverage differs between 1/16, 1/32, ... 1/1024 of a pixel.
function detectSnapGrid(gl, fixed, snap) {
  const hash = countHash(gl, fixed, snap.size, snap.tris);
  return { hash, grid: snap.grids.find((g) => g.hash === hash) ?? null };
}

function detectTieRule(gl, fixed, rules) {
  const hashes = rules.scenes.map((s) => countHash(gl, fixed, rules.size, s.tris));
  const rule = rules.rules.find((r) => r.hashes.every((h, i) => h === hashes[i])) ?? null;
  return { hashes, rule };
}

// ------------------------------------------------------------------ pictures

function paint(canvas, w, h, rgba) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) img.data.set([rgba[src + x], rgba[src + x + 1], rgba[src + x + 2], 255], y * w * 4 + x);
  }
  ctx.putImageData(img, 0, 0);
}

const SWATCH = { cover: [200, 20, 40], colour: [235, 120, 20], level: [250, 214, 92] };

// Grey (a pale copy of WebGL's picture) where the pictures agree; colours where they do not.
// marks: the red and orange pixels, which the page rings so a single one can be seen.
function differences(w, h, mine, theirs, ids) {
  const out = new Uint8Array(w * h * 4);
  const marks = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(mine.rgba[o + c] - theirs[o + c]));
    const kind = mine.ids && mine.ids[i] !== ids[i] ? 'cover' : d > 1 ? 'colour' : d === 1 ? 'level' : null;
    const g = Math.round(225 + ((theirs[o] + theirs[o + 1] + theirs[o + 2]) / 765) * 30);
    out.set(kind ? [...SWATCH[kind], 255] : [g, g, g, 255], o);
    if (kind === 'cover' || kind === 'colour') marks.push(i);
  }
  return { px: out, marks };
}

const SVG = 'http://www.w3.org/2000/svg';
const RINGS = 24; // more than this and the colours show by themselves

// Rings round the first red and orange pixels, over the Difference picture, and the first one's
// coordinates (x, y from the bottom left, as the verdict gives them). Hidden from screen
// readers: the verdict lists the same pixels in words.
function ringOverlay(w, h, marks) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('rings');
  const r = Math.max(2.5, w / 48);
  for (const i of marks.slice(0, RINGS)) {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', i % w + 0.5);
    c.setAttribute('cy', h - 1 - Math.floor(i / w) + 0.5);
    c.setAttribute('r', r);
    svg.append(c);
  }
  if (marks.length) {
    const i = marks[0];
    const x = i % w;
    const y = Math.floor(i / w);
    const t = document.createElementNS(SVG, 'text');
    const right = x < w * 0.6;
    t.setAttribute('x', right ? x + r + 1.5 : x - r - 1);
    t.setAttribute('y', Math.min(h - 2, Math.max(r + 4, h - 1 - y + 0.5 - r)));
    t.setAttribute('text-anchor', right ? 'start' : 'end');
    t.setAttribute('font-size', Math.max(6, w / 22));
    t.textContent = `(${x}, ${y})`;
    svg.append(t);
  }
  return svg;
}

const decodeIds = (px) => Int32Array.from({ length: px.length / 4 }, (_, i) => (px[i * 4] | (px[i * 4 + 1] << 8) | (px[i * 4 + 2] << 16)) - 1);

function figure(label, about) {
  const t = $('picture').content.cloneNode(true);
  t.querySelector('b').textContent = label;
  t.querySelector('.about').textContent = about;
  return t;
}

// Under each scene's pictures, a place for the lab's verdict on that scene.
const sceneVerdicts = [];

function showScene(scene, glPixels, info) {
  const sec = document.createElement('section');
  sec.className = 'scene';
  const h = document.createElement('h2');
  h.textContent = `Scene: ${scene.name} (${scene.width} × ${scene.height})`;
  sec.append(h);
  const mine = { rgba: bytes(scene.mine.rgba), ids: scene.mine.ids ? new Int32Array(bytes(scene.mine.ids).buffer) : null };
  const diff = differences(scene.width, scene.height, mine, glPixels.rgba, decodeIds(glPixels.ids));
  const parts = [
    ['Your GPU', 'Drawn by your gpu/pipeline.mjs in Node.', mine.rgba],
    ['WebGL', `Drawn by this browser: ${info.renderer}.`, glPixels.rgba],
    ['Difference', 'Grey: the same. Red: another triangle owns the pixel. Orange: colour differs by more than 1 level. Yellow: by exactly 1. A ring marks each of the first red and orange pixels, with the first one\'s position. The verdict below says which sit beside an edge or a texel edge, where a GPU may choose.', diff.px],
  ];
  for (const [label, about, px] of parts) {
    const f = figure(label, about);
    const c = f.querySelector('canvas');
    paint(c, scene.width, scene.height, px);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', label === 'Difference'
      ? `Difference: ${scene.name}, ${diff.marks.length ? `${diff.marks.length} red or orange pixels` : 'no red or orange pixels'}`
      : `${label}: ${scene.name}`);
    if (label === 'Difference') f.querySelector('.wrap').append(ringOverlay(scene.width, scene.height, diff.marks));
    sec.append(f);
  }
  const v = document.createElement('div');
  v.className = 'scene-verdict';
  v.dataset.marks = diff.marks.length;
  v.innerHTML = '<h3>Verdict on this scene</h3><p class="short">Waiting for the lab’s verdict…</p>';
  sec.append(v);
  sceneVerdicts.push(v);
  if (scene.glsl) {
    const d = document.createElement('details');
    d.innerHTML = '<summary>The GLSL shader WebGL ran</summary><pre></pre>';
    d.querySelector('pre').textContent = scene.glsl;
    sec.append(d);
  }
  if (scene.note) {
    const p = document.createElement('p');
    p.textContent = scene.note;
    sec.append(p);
  }
  $('scenes').append(sec);
}

// ------------------------------------------------------------------ the run

function say(text) { $('status').textContent = text; }

async function post(body, path = 'result') {
  const r = await fetch(`${path}?t=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Error(`the lab answered ${r.status}: ${await r.text()}`);
  return r.json();
}

async function getJob() {
  const r = await fetch(`job?t=${encodeURIComponent(token)}`);
  if (!r.ok) throw Error('this page was not opened by node lab.mjs compare, or the lab has stopped');
  return r.json();
}

async function run() {
  const [job, rules] = await Promise.all([getJob(), fetch('tie-rules.json').then((r) => r.json())]);
  $('unit').textContent = `Unit ${job.unit}: ${job.title}`;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, depth: true, premultipliedAlpha: false });
  if (!gl) throw Error('this browser has no WebGL2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const info = { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), subpixel: gl.getParameter(gl.SUBPIXEL_BITS), ua: navigator.userAgent };
  const fixed = program(gl, FIXED);
  say('Finding the tie rule…');
  const tie = detectTieRule(gl, fixed, rules);
  say('Finding the grid this GPU snaps vertices to…');
  const snap = detectSnapGrid(gl, fixed, rules.snap);
  const grid = { hash: snap.hash, sub: snap.grid?.sub ?? null };
  say('Your GPU is drawing the scenes on that grid…');
  const yours = await post({ info, tie: { hashes: tie.hashes, rule: tie.rule?.id ?? null }, grid }, 'probe');
  $('grid').textContent = yours.line;
  job.scenes.forEach((scene, k) => { scene.mine = yours.mine[k]; });
  const results = [];
  for (const scene of job.scenes) {
    say(`Drawing ${scene.name}…`);
    const px = renderScene(gl, fixed, scene, job);
    results.push({ name: scene.name, rgba: base64(px.rgba), ids: base64(px.ids) });
    showScene(scene, px, info);
  }
  say('Waiting for the lab’s verdict…');
  const verdict = await post({ info, tie: { hashes: tie.hashes, rule: tie.rule?.id ?? null }, grid, scenes: results });
  showVerdict(verdict, job.scenes);
  say(verdict.ok ? 'Done: the pictures agree.' : 'Done: the pictures differ. The verdict says where.');
}

// At the top, a short verdict: the overall line, the GPU and its tie rule, and one line per
// scene. Each scene's full lines go under that scene's pictures, folded away when it matches.
function showVerdict(verdict, scenes) {
  const page = verdict.page;
  if (!page) { $('verdict').textContent = verdict.text; return; }
  const one = (sc, k) => {
    const r = page.scenes[k];
    if (!r) return `${sc.name}: no verdict`;
    return `${sc.name}: ${r.ok ? (r.convention ? 'differs only by the tie convention' : 'matches') : 'differs (see the verdict under its pictures)'}`;
  };
  // The grid line already shows under the unit's name.
  const head = page.head.filter((l) => l && l !== $('grid').textContent);
  $('verdict').textContent = [page.summary, ...head, ...scenes.map(one)].join('\n');
  sceneVerdicts.forEach((box, k) => {
    const r = page.scenes[k];
    if (!r) return;
    const ringed = +box.dataset.marks > 0;
    box.querySelector('.short').textContent = r.convention
      ? 'Every difference sits on an edge: another tie convention, not a fault.'
      : r.ok ? `Matches WebGL.${ringed ? ' The ringed pixels sit beside an edge or a texel edge, where a GPU may choose; the lab’s lines say which.' : ''}`
        : 'Differs from WebGL. The lab’s lines for this scene:';
    const pre = document.createElement('pre');
    pre.className = 'lines';
    pre.textContent = r.lines.join('\n');
    if (r.ok) {
      const d = document.createElement('details');
      const s = document.createElement('summary');
      s.textContent = 'The lab’s lines for this scene';
      d.append(s, pre);
      box.append(d);
    } else box.append(pre);
  });
}

// One name; aria-pressed says whether the pictures show their actual pixels.
function setZoom(fit) {
  document.body.classList.toggle('actual', !fit);
  $('zoom').setAttribute('aria-pressed', String(!fit));
}

$('zoom').addEventListener('click', () => setZoom(document.body.classList.contains('actual')));
setZoom(true);

run().then(() => { window.__tinyGpuDone = true; }, async (e) => {
  say(`Stopped: ${e.message}`);
  $('verdict').textContent = e.message;
  window.__tinyGpuError = e.message;
  try { await post({ error: e.message }); } catch {}
  window.__tinyGpuDone = true;
});
