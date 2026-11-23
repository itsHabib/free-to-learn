// After the world has placed its own things, a kiosk stands wherever kioskAt says so, on a grid of 34 m.
placeThings = ((plain) => (H, L, M, P, S, village, seed) => {
  const lists = plain(H, L, M, P, S, village, seed);
  const g = 34;
  const n = Math.floor(WORLD / g);
  for (let gz = 2; gz < n - 2; gz++)
    for (let gx = 2; gx < n - 2; gx++) {
      const h = hash2(gx, gz, seed + 77);
      const x = (gx + (h & 255) / 256) * g - HALF;
      const z = (gz + ((h >>> 8) & 255) / 256) * g - HALF;
      const i = (Math.floor(z / CELL + N / 2) * N + Math.floor(x / CELL + N / 2)) * 4;
      const steep = 1 - 1 / Math.sqrt(1 + L[i + 1] * L[i + 1] + L[i + 2] * L[i + 2]);
      if (!kioskAt(L[i], M[i + 2] / 255, steep, (h >>> 16) / 65536)) continue;
      const a = (h & 1023) / 512 - 1;
      const b = ((h >>> 10) & 1023) / 512 - 1;
      const l = 1 / Math.sqrt(a * a + b * b + 1e-6);
      lists[17].push(x, heightAt(H, x, z) - 0.1, z, 0.9, a * l, b * l, 0.4, 0.5);
    }
  return lists;
})(placeThings);
