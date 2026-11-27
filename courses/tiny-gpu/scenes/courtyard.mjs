// Supplied: the courtyard, the course's own 3D scene. A tiled floor
// inside low plaster walls with a doorway, four stone columns under
// a pergola, a wooden crate, a lamp post and a planted pot. World
// units are metres, y up; the default camera looks down -z.
//
// Vertex colours carry the lighting, baked in by the builder: a sun
// from the upper left, a little darker where a wall meets the
// ground. Normals are kept for the shader units.

import { withShader } from './programs.mjs';

const SKY = [0.8, 0.89, 0.97];
const SUN = norm([-0.45, 0.8, 0.4]);

function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const round6 = (x) => Math.round(x * 1e6) / 1e6;

function lit(base, n, y, look) {
  if (look.glow) return base;
  const light = 0.7 + 0.3 * Math.max(0, dotV(n, SUN));
  const ao = look.ao && y < 0.01 ? 0.8 : 1;
  return base.map((c) => round6(Math.min(1, c * light * ao)));
}

// A flat polygon (3 or 4 corners) facing away from `inside`.
function face(out, corners, uvs, look, inside) {
  let n = norm(crossV(sub(corners[1], corners[0]),
    sub(corners[2], corners[0])));
  if (inside && dotV(n, sub(corners[0], inside)) < 0) {
    n = n.map((x) => -x);
  }
  const vert = (k) => ({
    p: corners[k].map(round6),
    c: lit(look.colour, n, corners[k][1], look),
    uv: uvs[k],
    n: n.map(round6),
  });
  const tex = look.tex;
  out.push({ tex, v: [vert(0), vert(1), vert(2)] });
  if (corners.length === 4) {
    out.push({ tex, v: [vert(0), vert(2), vert(3)] });
  }
}

const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

// A box standing on y0, centred on (cx, cz), turned by rotY degrees.
function box(out, { at: [cx, y0, cz], size: [sx, sy, sz], rotY = 0 },
  look) {
  const a = (rotY * Math.PI) / 180;
  const corner = (dx, dz, y) => [
    cx + dx * Math.cos(a) + dz * Math.sin(a), y,
    cz - dx * Math.sin(a) + dz * Math.cos(a)];
  const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
  const ring = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]];
  const inside = [cx, y0 + sy / 2, cz];
  for (let k = 0; k < 4; k++) {
    const [p, q] = [ring[k], ring[(k + 1) % 4]];
    face(out, [corner(...p, y0), corner(...q, y0), corner(...q, y1),
      corner(...p, y1)], QUAD_UV, look, inside);
  }
  const top = look.top ? { ...look, colour: look.top } : look;
  face(out, ring.map(([dx, dz]) => corner(dx, dz, y1)), QUAD_UV, top,
    inside);
  if (y0 > 0.01) {
    face(out, ring.map(([dx, dz]) => corner(dx, dz, y0)), QUAD_UV, look,
      inside);
  }
}

// An upright prism with `sides` flat faces (a column shaft).
function prism(out, { at: [cx, y0, cz], radius, height, sides }, look) {
  const pt = (k, y) => {
    const a = ((k + 0.5) / sides) * 2 * Math.PI;
    return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
  };
  const inside = [cx, y0 + height / 2, cz];
  for (let k = 0; k < sides; k++) {
    face(out, [pt(k, y0), pt(k + 1, y0), pt(k + 1, y0 + height),
      pt(k, y0 + height)], QUAD_UV, look, inside);
  }
}

// A low-poly ball (icosahedron): the bush in the pot.
function ball(out, [cx, cy, cz], r, look) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t],
    [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1],
    [-t, 0, -1], [-t, 0, 1]]
    .map((p) => norm(p).map((x, i) => [cx, cy, cz][i] + x * r));
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
    [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (const [a, b, c] of f) {
    face(out, [v[a], v[b], v[c]], [[0, 0], [1, 0], [0, 1]], look,
      [cx, cy, cz]);
  }
}

// A four-sided pyramid roof over the lantern.
function roof(out, [cx, y0, cz], half, height, look) {
  const apex = [cx, y0 + height, cz];
  const ring = [[-half, half], [half, half], [half, -half],
    [-half, -half]].map(([dx, dz]) => [cx + dx, y0, cz + dz]);
  for (let k = 0; k < 4; k++) {
    face(out, [ring[k], ring[(k + 1) % 4], apex],
      [[0, 0], [1, 0], [0.5, 1]], look, [cx, y0, cz]);
  }
}

function floorTiles(out, look) {
  const xs = [-6, -2, 2, 6];
  const zs = [-9, -5, -1, 3, 7];
  for (let j = 0; j + 1 < zs.length; j++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const c = [[xs[i], 0, zs[j + 1]], [xs[i + 1], 0, zs[j + 1]],
        [xs[i + 1], 0, zs[j]], [xs[i], 0, zs[j]]];
      // One checker square per metre: uv 0.5 = 1 m.
      const uv = c.map(([x, , z]) => [(x + 6) / 2, (7 - z) / 2]);
      face(out, c, uv, look, [0, -1, 0]);
    }
  }
}

const PLASTER = { colour: [0.98, 0.92, 0.82], top: [0.86, 0.56, 0.42],
  ao: true };
const STONE = { colour: [0.96, 0.94, 0.89], ao: true };
const BEAM = { colour: [0.66, 0.5, 0.36] };
const WOOD = { colour: [1, 1, 1], tex: 'crate', ao: true };
const IRON = { colour: [0.32, 0.38, 0.36] };
const GLOW = { colour: [1, 0.9, 0.55], glow: true };
const POT = { colour: [0.82, 0.5, 0.36], ao: true };
const LEAF = { colour: [0.5, 0.72, 0.42] };
const TILE = { colour: [1, 1, 1], tex: 'floor' };

function walls(out) {
  const h = 2;
  const back = [[-6, -3], [-3, -1.2], [1.2, 3], [3, 6]];
  for (const [x0, x1] of back) {
    box(out, { at: [(x0 + x1) / 2, 0, -9], size: [x1 - x0, h, 0.4] },
      PLASTER);
  }
  box(out, { at: [0, 1.75, -9], size: [2.4, 0.35, 0.5] }, PLASTER);
  for (const side of [-6, 6]) {
    for (const z0 of [-9, -6, -3, 0]) {
      box(out, { at: [side, 0, z0 + 1.5], size: [0.4, h, 3] }, PLASTER);
    }
  }
}

function column(out, x, z) {
  box(out, { at: [x, 0, z], size: [0.8, 0.2, 0.8] }, STONE);
  prism(out, { at: [x, 0.2, z], radius: 0.3, height: 2.35, sides: 8 },
    STONE);
  box(out, { at: [x, 2.55, z], size: [0.72, 0.25, 0.72] }, STONE);
}

function lamp(out, x, z) {
  box(out, { at: [x, 0, z], size: [0.36, 0.12, 0.36] }, IRON);
  box(out, { at: [x, 0.12, z], size: [0.1, 2.1, 0.1] }, IRON);
  box(out, { at: [x, 2.22, z], size: [0.34, 0.4, 0.34] }, GLOW);
  roof(out, [x, 2.62, z], 0.24, 0.22, IRON);
}

export function courtyardTextures() {
  const floor = { w: 16, h: 16, data: new Uint8Array(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const odd = ((x >> 3) + (y >> 3)) & 1;
      const grout = x % 8 === 0 || y % 8 === 0;
      let c = odd ? [222, 196, 160] : [244, 236, 220];
      if (grout) c = c.map((v) => v - 18);
      floor.data.set([...c, 255], (y * 16 + x) * 4);
    }
  }
  const crate = { w: 16, h: 16, data: new Uint8Array(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const frame = x < 2 || x > 13 || y < 2 || y > 13;
      const brace = Math.abs(x - y) < 1.5;
      const seam = y % 4 === 1;
      let c = (y >> 2) & 1 ? [196, 146, 92] : [210, 162, 106];
      if (seam) c = [170, 122, 74];
      if (frame || brace) c = [150, 104, 62];
      crate.data.set([...c, 255], (y * 16 + x) * 4);
    }
  }
  return { floor, crate };
}

// Camera stops. `column` stands 4 cm from a column's face, closer
// than the near plane (10 cm): that face crosses the near plane.
export const courtyardStops = {
  gate: { eye: [0.05, 2.1, 4.6], target: [0, 0.9, -5] },
  corner: { eye: [5.2, 2.6, 2.2], target: [-1, 0.6, -5.5] },
  low: { eye: [-4.6, 0.4, 1.5], target: [1.5, 0.3, -7] },
  crate: { eye: [3.4, 1.4, -0.6], target: [1.5, 0.5, -3.2] },
  'lamp-behind': { eye: [-4.7, 1.5, 2.2], target: [-1.8, 1.4, -4.2] },
  column: { eye: [2.95, 1.5, -1.66], target: [1.2, 1.3, -6] },
};

// opts.shader names a program in scenes/shaders (none by default).
export function courtyard(opts = {}) {
  const { width = 160, height = 120, stop = 'gate', shader } = opts;
  const view = courtyardStops[stop];
  if (!view) throw new Error(`courtyard: no camera stop ${stop}`);
  const tris = [];
  floorTiles(tris, TILE);
  walls(tris);
  box(tris, { at: [3.9, 0, -7.6], size: [0.9, 0.6, 0.9], rotY: 10 },
    POT);
  ball(tris, [3.9, 1.05, -7.6], 0.55, LEAF);
  for (const z of [-6, -2]) for (const x of [-3, 3]) column(tris, x, z);
  for (const x of [-3, 3]) {
    box(tris, { at: [x, 2.8, -4], size: [0.3, 0.2, 5.2] }, BEAM);
  }
  for (const z of [-6, -2]) {
    box(tris, { at: [0, 3, z], size: [6.6, 0.18, 0.26] }, BEAM);
  }
  box(tris, { at: [1.5, 0, -3.2], size: [0.9, 0.9, 0.9], rotY: 25 },
    WOOD);
  lamp(tris, -1.8, -4.2);
  const scene = {
    name: stop === 'gate' ? 'courtyard' : `courtyard-${stop}`,
    width, height,
    camera: { ...view, up: [0, 1, 0], fovY: 60, near: 0.1, far: 100 },
    clear: SKY,
    textures: courtyardTextures(),
    tris: tris.map((t, id) => ({ id, ...t })),
  };
  return shader ? withShader(scene, shader) : scene;
}
