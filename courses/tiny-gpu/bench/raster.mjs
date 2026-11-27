// Written by tools/bench-data.mjs from unit 1 of the course's rasterizer; do not edit by hand.
// Window coordinates: origin bottom-left, x right, y up. Points are integers in 1/SUB of a
// pixel. Pixel (x, y) samples at its centre.

export let SUB = 16; // WebGL reports 4 subpixel bits: 1/16 pixel

// Pixel-unit [x, y] points to integer subpixel points.
export function snap2(tri) {
  const snap = (v) => Math.round(v * SUB);
  return tri.map(([x, y]) => [snap(x), snap(y)]);
}

// Twice the signed area of triangle a, b, p: positive when p is to
// the left of the line a -> b (y up), zero on the line.
export function edge(a, b, p) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

// A centre exactly on edge a -> b of a counter-clockwise triangle
// belongs to the triangle if nudging it right by a tiny e and up by
// e * e moves it inside: the edge's inward normal points right, or
// straight up when the edge is horizontal.
export function owns(a, b) {
  const gx = -(b[1] - a[1]);
  const gy = b[0] - a[0];
  return gx > 0 || (gx === 0 && gy > 0);
}

export function rasterize(tri, rect, emit) {
  let [v0, v1, v2] = tri;
  const area = edge(v0, v1, v2);
  if (area === 0) return 0;
  // Work counter-clockwise; remember to hand weights back unswapped.
  const swapped = area < 0;
  if (swapped) [v1, v2] = [v2, v1];

  const xs = [v0[0], v1[0], v2[0]];
  const ys = [v0[1], v1[1], v2[1]];
  const x0 = Math.max(rect.x0, Math.floor(Math.min(...xs) / SUB));
  const x1 = Math.min(rect.x1, Math.ceil(Math.max(...xs) / SUB));
  const y0 = Math.max(rect.y0, Math.floor(Math.min(...ys) / SUB));
  const y1 = Math.min(rect.y1, Math.ceil(Math.max(...ys) / SUB));

  const own = [owns(v1, v2), owns(v2, v0), owns(v0, v1)];
  const inside = (w, k) => w > 0 || (w === 0 && own[k]);
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = [x * SUB + SUB / 2, y * SUB + SUB / 2];
      const w0 = edge(v1, v2, p);
      const w1 = edge(v2, v0, p);
      const w2 = edge(v0, v1, p);
      if (!inside(w0, 0) || !inside(w1, 1) || !inside(w2, 2)) continue;
      if (swapped) emit(x, y, w0, w2, w1);
      else emit(x, y, w0, w1, w2);
      count++;
    }
  }
  return count;
}
