// Twelve fish off the jetty, moved by schoolStep and drawn with the gulls' shape, because the page has no fish.
(() => {
  const n = 12;
  const B = new Float32Array(n * 8);
  const r = rng(hash2(seed, 7, 9));
  let quay = null;
  let t = 0;
  onTick((dt) => {
    if (!W.S) return;
    if (!quay) {
      quay = [W.S.beach[0] + W.S.sea[0] * 90, W.S.beach[1] + W.S.sea[1] * 90];
      for (let i = 0; i < n; i++)
        B.set([quay[0] + (r() - 0.5) * 12, -1.5 - r(), quay[1] + (r() - 0.5) * 12, r() - 0.5, 0, r() - 0.5, 0, r()], i * 8);
    }
    t += dt;
    schoolStep(B, n, Math.min(dt, 0.05) || 1 / 60, t, quay, W.H);
  });
  onDraw(52, () => {
    if (!quay) return;
    gl.useProgram(W.pBird);
    gl.bindVertexArray(W.bird.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, W.birdBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, Float32Array.from(B, (v, i) => (i % 8 < 3 ? v : v * 0.5)));
    draw(gl.TRIANGLES, W.bird.count, gl.UNSIGNED_SHORT, 0, n);
  });
})();
