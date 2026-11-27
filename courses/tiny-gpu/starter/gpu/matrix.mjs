// Supplied: 4x4 matrices and the camera.
// Column-major, as WebGL stores them: row r, column c is m[c * 4 + r].
// The camera looks down its own -z axis with y up.

export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalize3(a) {
  const len = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function identity() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

// region: mul4
// a * b: a point is moved by b first, then by a.
export function mul4(a, b) {
  const m = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = s;
    }
  }
  return m;
}
// endregion: mul4

// region: perspective
// fovY in degrees. A point at distance near lands on z = -w, a point
// at distance far on z = w; w is the distance in front of the eye.
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan((fovY * Math.PI) / 360);
  const m = new Float64Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
// endregion: perspective

// region: lookAt
// World to camera: the eye moves to the origin, looking down -z.
export function lookAt(eye, target, up) {
  const f = normalize3(sub3(target, eye));
  const s = normalize3(cross3(f, up));
  const u = cross3(s, f);
  const m = identity();
  for (let c = 0; c < 3; c++) {
    m[c * 4 + 0] = s[c];
    m[c * 4 + 1] = u[c];
    m[c * 4 + 2] = -f[c];
  }
  m[12] = -dot3(s, eye);
  m[13] = -dot3(u, eye);
  m[14] = dot3(f, eye);
  return m;
}
// endregion: lookAt

// The scene camera's view-projection matrix for a W x H picture.
export function viewProjection(camera, W, H) {
  const { eye, target, up, fovY, near, far } = camera;
  const proj = perspective(fovY, W / H, near, far);
  return mul4(proj, lookAt(eye, target, up));
}

// The lab's own matrix product, kept apart from the learner's
// transform so the WebGL page never depends on learner code.
// p is [x, y, z] (w = 1) or [x, y, z, w]. Same sum order as WebGL.
export function apply4(m, p) {
  const w = p.length > 3 ? p[3] : 1;
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2]
      + m[12 + r] * w;
  }
  return out;
}
