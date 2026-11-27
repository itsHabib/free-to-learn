// Supplied: the capstone's hall. hallScene(seed) builds a hall of
// arches: a row of stone screens, each pierced by a round-headed
// arch, standing one behind another down the hall, with a flight of
// steps and a back wall at the far end, where a doorway opens on the
// night (no triangle covers it). Each screen carries a tablet laid
// twice in the same place, first in gilt and then in plain stone.
// The seed changes the number of arches, their spacing, size and
// colour, and where the camera stands.
//
// Draw order: the screens, the stair and the back wall arrive from
// the back of the hall to the front; the floor is laid last.
//
// Every face is built so the camera sees its front: faces it could
// only see from behind are left out. Faces that meet share their
// corners exactly, so no pixel is covered twice at nearly the same
// depth, except the two tablets, which share all three corners of
// every triangle.
import { seeded } from './flat2d.mjs';
import { withShader } from './programs.mjs';

const X = 40; // half the width of a screen, metres
const Y = 30; // its height: wide and tall enough to fill the view
const T = 0.3; // its thickness
const ARC = 8; // segments in an arch's half circle
const RISE = 0.17; // one step of the stair
const TREAD = 0.3;
const DOOR = [0.6, 2]; // the doorway's half width and height
const LIFT = 0.08; // how far a tablet stands in front of its screen
const GILT = [0.9, 0.72, 0.34];

// Ashlar: courses of blocks, every other course shifted half a block.
export function hallTexture() {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const shift = (y >> 3) & 1 ? 8 : 0;
      const joint = y % 8 === 0 || (x + shift) % 16 === 0;
      const grain = ((x * 5 + y * 3) % 7) * 3;
      const c = joint ? [168, 156, 142]
        : [236 - grain, 228 - grain, 214 - grain];
      data.set([...c, 255], (y * n + x) * 4);
    }
  }
  return { w: n, h: n, data };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Ladder triangles between two rows of floor points sorted by x,
// near at z = zA and far at z = zB (y = 0 for both).
function ladder(xsA, zA, xsB, zB) {
  const A = xsA.map((x) => [x, 0, zA]);
  const B = xsB.map((x) => [x, 0, zB]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < A.length - 1 || j < B.length - 1) {
    const stepA = j === B.length - 1 ||
      (i < A.length - 1 && A[i + 1][0] <= B[j + 1][0]);
    if (stepA) {
      out.push([A[i], A[i + 1], B[j]]);
      i += 1;
    } else {
      out.push([A[i], B[j + 1], B[j]]);
      j += 1;
    }
  }
  return out;
}

export function hallScene(seed, opts = {}) {
  const { width = 160, height = 120 } = opts;
  const r = seeded(seed * 2654435761 + 97);
  const pick = (lo, hi) => lo + (hi - lo) * r();
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const eye = [round3(pick(-0.35, 0.35)), round3(pick(1.3, 1.7)), 2];
  const target = [round3(eye[0] * 0.4 + pick(-0.2, 0.2)),
    round3(pick(1.1, 1.5)), -20];

  const count = 7 + Math.floor(r() * 3);
  const gap = pick(2.1, 2.9);
  const first = -pick(1.6, 2.4);
  const tones = [[0.95, 0.88, 0.78], [0.86, 0.79, 0.72]]
    .map((c) => c.map((v) => round3(v - pick(0, 0.06))));
  const screens = [];
  for (let k = 0; k < count; k++) {
    const a = round3(pick(0.9, 1.3));
    const ox = round3(pick(-0.25, 0.25));
    screens.push({ z: round3(first - k * gap), a, ox,
      h: round3(pick(1.7, 2.3)), tone: tones[k % 2] });
  }

  const faces = []; // { pts: [3 points], n, c, floor }
  const add = (pts, n, c, floor = false) => {
    // keep a face only if the camera sees its front
    if (dot(n, sub(eye, pts[0])) > 1e-9) {
      faces.push({ pts, n, c, floor });
    }
  };
  const quad = (p, n, c, floor = false) => {
    add([p[0], p[1], p[2]], n, c, floor);
    add([p[0], p[2], p[3]], n, c, floor);
  };
  const FLOOR = [0.72, 0.64, 0.57];
  const front = [0, 0, 1];
  const up = [0, 1, 0];

  for (const s of screens) {
    const { z, a, ox, h, tone } = s;
    const L = ox - a;
    const R = ox + a;
    const zb = round3(z - T);
    const side = tone.map((v) => v * 0.92);
    const P = (x, y, zz = z) => [round3(x), round3(y), zz];
    add([P(-X, 0), P(L, 0), P(L, h)], front, tone);
    add([P(-X, 0), P(L, h), P(L, Y)], front, tone);
    add([P(-X, 0), P(L, Y), P(-X, Y)], front, tone);
    add([P(X, 0), P(X, Y), P(R, Y)], front, tone);
    add([P(X, 0), P(R, Y), P(R, h)], front, tone);
    add([P(X, 0), P(R, h), P(R, 0)], front, tone);
    const arc = [];
    for (let i = 0; i <= ARC; i++) {
      const t = Math.PI * (1 - i / ARC);
      arc.push([ox + a * Math.cos(t), h + a * Math.sin(t), t]);
    }
    arc[0][0] = L; // the ends meet the jambs exactly
    arc[ARC][0] = R;
    arc[ARC][1] = h;
    for (let i = 0; i < ARC; i++) {
      const [x0, y0] = arc[i];
      const [x1, y1, t1] = arc[i + 1];
      quad([P(x0, y0), P(x1, y1), P(x1, Y), P(x0, Y)], front, tone);
      // the underside of the arch, facing its centre
      const tm = (arc[i][2] + t1) / 2;
      const n = [-Math.cos(tm), -Math.sin(tm), 0].map(round3);
      const under = [P(x0, y0), P(x0, y0, zb), P(x1, y1, zb),
        P(x1, y1)];
      quad(under, n, side);
    }
    // the sides of the opening, facing into it
    quad([P(L, 0), P(L, 0, zb), P(L, h, zb), P(L, h)], [1, 0, 0], side);
    quad([P(R, 0), P(R, h), P(R, h, zb), P(R, 0, zb)], [-1, 0, 0],
      side);
    quad([P(L, 0), P(R, 0), P(R, 0, zb), P(L, 0, zb)], up, FLOOR,
      true);
    // the tablet, on the pier left or right of the arch, laid twice
    const k = screens.indexOf(s);
    const tx = k % 2 ? R + 0.35 : L - 1.15;
    const zt = round3(z + LIFT);
    const tab = [P(tx, 1.1, zt), P(tx + 0.8, 1.1, zt),
      P(tx + 0.8, 1.7, zt), P(tx, 1.7, zt)];
    quad(tab, front, GILT);
    quad(tab, front, tone.map((v) => v * 0.85));
  }

  // the floor between screens, sharing every corner along its edges
  const edge = (s) => [-X, round3(s.ox - s.a), round3(s.ox + s.a), X];
  const last = screens[count - 1];
  const stairZ = round3(last.z - T - pick(1.4, 2.4));
  const strips = [[[-X, X], 1, edge(screens[0]), screens[0].z]];
  for (let k = 0; k < count; k++) {
    const next = screens[k + 1];
    strips.push([edge(screens[k]), round3(screens[k].z - T),
      next ? edge(next) : [-X, X], next ? next.z : stairZ]);
  }
  for (const [xa, za, xb, zb] of strips) {
    for (const t of ladder(xa, za, xb, zb)) add(t, up, FLOOR, true);
  }

  // the stair, as wide as the screens, then the back wall
  const steps = 6 + Math.floor(r() * 4);
  const STAIR = [0.96, 0.93, 0.87];
  const backZ = round3(stairZ - steps * TREAD);
  const topY = round3(steps * RISE);
  const dx = round3(pick(-0.3, 0.3));
  const [dl, dr] = [round3(dx - DOOR[0]), round3(dx + DOOR[0])];
  const dt = round3(topY + DOOR[1]);
  for (let k = 0; k < steps; k++) {
    const z0 = round3(stairZ - k * TREAD);
    const top = k === steps - 1; // meets the back wall exactly
    const z1 = top ? backZ : round3(z0 - TREAD);
    const y0 = round3(k * RISE);
    const y1 = top ? topY : round3(y0 + RISE);
    const tread = STAIR.map((v) => v * 0.94);
    quad([[-X, y0, z0], [X, y0, z0], [X, y1, z0], [-X, y1, z0]],
      front, STAIR);
    if (!top) {
      quad([[-X, y1, z0], [X, y1, z0], [X, y1, z1], [-X, y1, z1]],
        up, tread);
      continue;
    }
    // the top tread meets the doorway's sill: its back edge has the
    // doorway's corners too
    const a = [-X, y1, z0];
    const back = [[X, y1, z1], [dr, y1, z1], [dl, y1, z1],
      [-X, y1, z1]];
    add([a, [X, y1, z0], back[0]], up, tread);
    for (let i = 0; i < 3; i++) {
      add([a, back[i], back[i + 1]], up, tread);
    }
  }
  // the back wall, round the doorway
  const W = (x, y) => [x, y, backZ];
  const wall = [0.93, 0.76, 0.62];
  add([W(-X, topY), W(dl, topY), W(dl, dt)], front, wall);
  add([W(-X, topY), W(dl, dt), W(dl, Y)], front, wall);
  add([W(-X, topY), W(dl, Y), W(-X, Y)], front, wall);
  add([W(X, topY), W(X, Y), W(dr, Y)], front, wall);
  add([W(X, topY), W(dr, Y), W(dr, dt)], front, wall);
  add([W(X, topY), W(dr, dt), W(dr, topY)], front, wall);
  quad([W(dl, dt), W(dr, dt), W(dr, Y), W(dl, Y)], front, wall);

  // from the back of the hall to the front, then the floor
  const mid = (f) => (f.pts[0][2] + f.pts[1][2] + f.pts[2][2]) / 3;
  const order = faces.map((f, i) => [f.floor ? 1 : 0, mid(f), i])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const tris = order.map(([, , i], id) => {
    const f = faces[i];
    return { id, tex: 'stone', v: f.pts.map((p) => ({
      p, c: f.c, n: f.n,
      uv: f.n[1] === 1 ? [p[0] / 2, -p[2] / 2]
        : f.n[2] === 1 ? [p[0] / 2, p[1] / 2] : [p[2] / 2, p[1] / 2],
    })) };
  });
  const scene = {
    name: `hall-${seed}`, width, height,
    camera: { eye, target, up: [0, 1, 0], fovY: 60, near: 0.1,
      far: 100 },
    clear: [0.2, 0.2, 0.22],
    textures: { stone: hallTexture() },
    tris,
  };
  return withShader(scene, 'hall');
}

// The lab's default: the first practice hall.
export function hall(seed = 1) {
  return hallScene(seed);
}
