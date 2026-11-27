// Unit 2: from a 3D point to a snapped window position.
// A clip vertex is { c: [x, y, z, w], a: [attributes] }.
import { SUB } from './raster.mjs';

// region: transform
// m is column-major: row r, column c sits at m[c * 4 + r].
export function transform(m, p) {
  throw new Error('transform: not written yet');
}
// endregion: transform

// region: clipNear
// Keep the part of a triangle in front of the near plane z = -w.
export function clipNear(tri) {
  throw new Error('clipNear: not written yet');
}

function between(s, e, t) {
  const mix = (from, to) => from.map((x, i) => x + t * (to[i] - x));
  return { c: mix(s.c, e.c), a: mix(s.a, e.a) };
}
// endregion: clipNear

// region: toWindow
// Divide by w, map -1..1 to the picture, snap to 1/16 of a pixel.
export function toWindow(c, W, H) {
  throw new Error('toWindow: not written yet');
}
// endregion: toWindow
