// Where screeAt says loose stone lies, the land's cover becomes bare stone in place of grass.
coverMasks = ((plain) => (H, L, E) => {
  const M = plain(H, L, E);
  for (let i = 0, p = 0; i < N * N; i++, p += 4) {
    const steep = 1 - 1 / Math.sqrt(1 + L[p + 1] * L[p + 1] + L[p + 2] * L[p + 2]);
    const on = screeAt(H[i], steep);
    M[p] *= 1 - on;
    M[p + 2] = Math.max(M[p + 2], on * 255);
  }
  return M;
})(coverMasks);
