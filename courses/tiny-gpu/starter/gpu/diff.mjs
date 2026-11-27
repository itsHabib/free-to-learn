// Unit 4: compare two pictures the way the course judges them.
// An image is { w, h, rgba: Uint8Array, ids: Int32Array }; ids[i] is
// the triangle that wrote pixel i, or -1.

// region: diffImages
// Coverage first: a pixel owned by different triangles is a coverage
// mismatch and its colour is not compared. Colour is compared (r, g,
// b) only where both pictures drew the same triangle.
export function diffImages(mine, theirs, ties) {
  throw new Error('diffImages: not written yet');
}

function channelGap(a, b, i) {
  let gap = 0;
  for (let k = 0; k < 3; k++) {
    gap = Math.max(gap, Math.abs(a[i * 4 + k] - b[i * 4 + k]));
  }
  return gap;
}
// endregion: diffImages
