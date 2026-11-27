// Supplied: unit 8's scenes. overdrawScene: six sheets of coloured
// paper, each a ragged twelve-sided shape a little larger than the
// picture, stacked and drawn from the back sheet to the front one,
// so most pixels are drawn about six times. A 2D scene: p = [x, y,
// z], the back sheet at depth 0.9, each sheet in front 0.12 nearer.
import { flatScene, seeded } from './flat2d.mjs';
import { withShader } from './programs.mjs';

const SHEETS = [
  [0.86, 0.62, 0.5], [0.94, 0.8, 0.52], [0.6, 0.76, 0.62],
  [0.55, 0.7, 0.86], [0.78, 0.64, 0.86], [0.95, 0.72, 0.7],
];

// Every sheet faces lambert.asm's light, so it shows its own colour.
const LIT = [0.30305, 0.80812, 0.50508];

export function overdrawScene(opts = {}) {
  const { width = 160, height = 120, seed = 6 } = opts;
  const r = seeded(seed);
  const q16 = (v) => Math.round(v * 16) / 16;
  const tris = [];
  SHEETS.forEach((c, s) => {
    const z = 0.9 - 0.12 * s;
    const cx = width / 2 + (r() - 0.5) * 30;
    const cy = height / 2 + (r() - 0.5) * 24;
    const ring = [];
    for (let k = 0; k < 12; k++) {
      const a = ((k + r() * 0.6) / 12) * 2 * Math.PI;
      const rad = 90 + r() * 24;
      ring.push([q16(cx + rad * Math.cos(a)),
        q16(cy + 0.8 * rad * Math.sin(a)), z]);
    }
    const mid = [q16(cx), q16(cy), z];
    for (let k = 0; k < 12; k++) {
      const v = [mid, ring[k], ring[(k + 1) % 12]];
      tris.push({ id: tris.length,
        v: v.map((p) => ({ p, c, n: LIT })) });
    }
  });
  const scene = {
    name: 'overdraw', width, height, clear: [0.97, 0.96, 0.93], tris,
  };
  return withShader(scene, 'lambert');
}

// Triangles laid across tile borders: corners on tile edges, on
// pixel centres beside them, and a sixteenth of a pixel either side,
// so the fill rule decides many pixels exactly at a border. 2D,
// 64 x 64 (a 4 x 4 grid of 16-pixel tiles).
export function tileBorderScene(seed) {
  const r = seeded(seed * 7907 + 3);
  const spots = [0, 0.5, -0.5, 1 / 16, -1 / 16];
  const near = () => 16 * (1 + Math.floor(r() * 3))
    + spots[Math.floor(r() * spots.length)];
  const anywhere = () => Math.round(r() * 64 * 16) / 16;
  const tris = [];
  for (let k = 0; k < 24; k++) {
    const p = () => [r() < 0.6 ? near() : anywhere(),
      r() < 0.6 ? near() : anywhere(), 0.2 + 0.6 * r()];
    tris.push([p(), p(), p()]);
  }
  return flatScene(`tile-borders-${seed}`, tris);
}

// Unit 8's transfer: 20,000 triangles of about one pixel each, at
// random places and depths, in random order. 2D, 160 x 120.
export function dustScene(seed = 1, opts = {}) {
  const { width = 160, height = 120, count = 20000 } = opts;
  const r = seeded(seed * 104729 + 11);
  const tris = [];
  for (let k = 0; k < count; k++) {
    // around the centre of pixel (x, y): it covers that centre only
    const x = Math.floor(r() * width) + 0.5;
    const y = Math.floor(r() * height) + 0.5;
    const z = 0.05 + 0.9 * r();
    tris.push([[x - 0.75, y - 0.5, z], [x + 0.75, y - 0.5, z],
      [x, y + 0.75, z]]);
  }
  return flatScene(`dust-${seed}`, tris, { width, height });
}
