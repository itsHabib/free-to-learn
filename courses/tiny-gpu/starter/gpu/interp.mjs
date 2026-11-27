// Unit 3: perspective-correct interpolation and the depth buffer.
// A window vertex is { x, y, z, invW, a: [attributes] }.

// region: toByte
// Float colour 0..1 to a stored 8-bit level.
export function toByte(c) {
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}
// endregion: toByte

// region: interpolate
// w = the three edge values rasterize handed to emit.
export function interpolate(v, w, n) {
  throw new Error('interpolate: not written yet');
}
// endregion: interpolate

// region: depthTest
// LESS: a fragment wins only if strictly nearer than what is stored.
export function depthTest(depth, i, z) {
  throw new Error('depthTest: not written yet');
}
// endregion: depthTest
