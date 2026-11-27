// Unit 4: textures. A texture is { w, h, data: Uint8Array } RGBA8,
// row 0 at v = 0. u and v run 0..1 across it and repeat beyond.

// region: makeTexture
// fn(x, y) returns [r, g, b, a] as 0..255 levels.
export function makeTexture(w, h, fn) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  }
  return { w, h, data };
}
// endregion: makeTexture

// region: checker
// Squares of `cell` texels, colours a and b (RGBA levels).
export function checker(w, h, cell, a, b) {
  const odd = (x, y) =>
    (Math.floor(x / cell) + Math.floor(y / cell)) & 1;
  return makeTexture(w, h, (x, y) => (odd(x, y) ? b : a));
}
// endregion: checker

// region: sample
export function sample(tex, u, v, mode) {
  throw new Error('sample: not written yet');
}

// Repeat wrapping: texel -1 is the last one, texel w the first.
function texel(tex, x, y) {
  const tx = ((x % tex.w) + tex.w) % tex.w;
  const ty = ((y % tex.h) + tex.h) % tex.h;
  const i = (ty * tex.w + tx) * 4;
  const d = tex.data;
  return [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, d[i + 3] / 255];
}
// endregion: sample
