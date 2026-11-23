// Once the sound is on, the tower strikes the hour that bellStrikes gives, louder the nearer you are.
(() => {
  let last = -1;
  let free = 0;
  onTick(() => {
    const C = audio.ctx;
    if (!C || C.state !== 'running' || !W.S) return;
    const hour = Math.floor((dayAngle(day) * 12) / Math.PI + 6) % 24;
    const was = last;
    last = hour;
    if (was === -1 || was === hour) return;
    const V = W.S.village;
    const far = Math.sqrt((cam.eye[0] - V[0]) ** 2 + (cam.eye[2] - V[1]) ** 2);
    const begin = Math.max(C.currentTime + 0.05, free);
    for (const [at, f, level] of bellStrikes(hour)) {
      const t0 = begin + at;
      free = t0 + 1.5;
      for (const [ratio, amount] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) {
        const o = C.createOscillator();
        const g = C.createGain();
        o.frequency.value = f * ratio;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime((0.12 * level * amount) / (1 + far / 250), t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
        o.connect(g);
        g.connect(audio.out);
        o.start(t0);
        o.stop(t0 + 3.1);
      }
    }
  });
})();
