// Unit 1: edge functions and the fill rule.
// Window coordinates: origin bottom-left, x right, y up. Points are
// integers in 1/SUB of a pixel. Pixel (x, y) samples at its centre.

// region: SUB
export let SUB = 16; // WebGL reports 4 subpixel bits: 1/16 pixel
// endregion: SUB

// region: setSubpixelBits
// The comparison runs your pipeline on the browser GPU's own grid:
// 2 ** bits steps a pixel (4 bits = 1/16). Code that reads SUB when
// it runs sees the new value. Up to 10 bits, edge values on the
// course's scenes stay exact integers in a JavaScript number.
export function setSubpixelBits(bits) {
  if (!Number.isInteger(bits) || bits < 4 || bits > 10) {
    throw new Error(`setSubpixelBits: 4 to 10 bits, not ${bits}`);
  }
  SUB = 2 ** bits;
}
// endregion: setSubpixelBits

// region: snap2
// Pixel-unit [x, y] points to integer subpixel points.
export function snap2(tri) {
  const snap = (v) => Math.round(v * SUB);
  return tri.map(([x, y]) => [snap(x), snap(y)]);
}
// endregion: snap2

// region: fullRect
export function fullRect(W, H) {
  return { x0: 0, y0: 0, x1: W, y1: H };
}
// endregion: fullRect

// region: edge
// Twice the signed area of triangle a, b, p: positive when p is to
// the left of the line a -> b (y up), zero on the line.
export function edge(a, b, p) {
  throw new Error('edge: not written yet');
}
// endregion: edge

// region: owns
// A centre exactly on edge a -> b of a counter-clockwise triangle
// belongs to the triangle if nudging it right by a tiny e and up by
// e * e moves it inside: the edge's inward normal points right, or
// straight up when the edge is horizontal.
export function owns(a, b) {
  throw new Error('owns: not written yet');
}
// endregion: owns

// region: rasterize
export function rasterize(tri, rect, emit) {
  throw new Error('rasterize: not written yet');
}
// endregion: rasterize
