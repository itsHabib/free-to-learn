// Geometry the checks share. The camera matrices come from the course's own copy of stage 1, never from the
// learner's file, so a fault in the learner's aim or boxHidden is not hidden by a change elsewhere.

export const PLANE_NAMES = ['left', 'right', 'bottom', 'top', 'near', 'far'];
export const PHONE = 390 / 844;
export const DESKTOP = 1440 / 900;
export const START = { eye: [0, 60, -420], yaw: 0, pitch: -0.1 }; // the stage 1 starting pose (the frame region's cam)

// The page's lens: a little longer when the screen is upright (the frame region of the world file).
export const lens = (aspect) => (0.52 / Math.sqrt(aspect)) * (aspect < 1 ? 0.88 : 1);

// A stream of numbers in [0, 1) from one integer, so every run tests the same cases.
export function stream(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The combined matrix (projection times view) and its six planes for one camera, using the course's functions.
export function camera(course, { eye, yaw, pitch, aspect = PHONE, near = 0.6, far = 20000 }) {
  const proj = course.call('perspective', new Float32Array(16), lens(aspect), aspect, near, far);
  const view = course.call('viewMatrix', new Float32Array(16), eye, yaw, pitch, [0, 0, 0], [0, 0, 0], [0, 0, 0]);
  const vp = course.call('mul4', new Float32Array(16), proj, view);
  return { view, vp, planes: course.call('frustumPlanes', new Float32Array(24), vp) };
}

// m times [x, y, z, 1], for a 16-number matrix stored column by column.
export const apply = (m, [x, y, z]) => [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
export const planeValue = (pl, i, [x, y, z]) => pl[i * 4] * x + pl[i * 4 + 1] * y + pl[i * 4 + 2] * z + pl[i * 4 + 3];

export function corners([x0, y0, z0, x1, y1, z1]) {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
}
export const centre = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];

const MARGIN = 1e-3; // values this close to a plane count as neither inside nor outside

export const inside = (pl, p) => PLANE_NAMES.every((_, i) => planeValue(pl, i, p) > MARGIN);
// The planes the whole box lies outside of.
export const outsideOf = (pl, b) => PLANE_NAMES.filter((_, i) => corners(b).every((p) => planeValue(pl, i, p) < -MARGIN));
// The planes the box crosses: some corner inside, some outside.
export const straddles = (pl, b) =>
  PLANE_NAMES.filter((_, i) => {
    const v = corners(b).map((p) => planeValue(pl, i, p));
    return v.some((x) => x > MARGIN) && v.some((x) => x < -MARGIN);
  });

// Points of a box worth testing for visibility: corners, centre, face and edge middles, and some inside.
export function samples(b, rand) {
  const [x0, y0, z0, x1, y1, z1] = b;
  const out = [];
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) out.push([x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, z0 + (z1 - z0) * fz]);
  for (let k = 0; k < 24; k++) out.push([x0 + (x1 - x0) * rand(), y0 + (y1 - y0) * rand(), z0 + (z1 - z0) * rand()]);
  return out;
}
// The first sample point of the box that lies inside every plane, or null.
export const seenPoint = (pl, b, rand) => samples(b, rand).find((p) => inside(pl, p)) ?? null;

export const fmt = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? `[${Array.from(v, fmt).join(', ')}]` : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
export const boxText = (b) => `x ${fmt(b[0])}..${fmt(b[3])}, y ${fmt(b[1])}..${fmt(b[4])}, z ${fmt(b[2])}..${fmt(b[5])}`;
