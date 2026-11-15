// Small shared helpers: a seeded random number generator, a seed mixer, and the
// statistics the course uses (median, quantile, mean, sd, correlation).
// Nothing in the course calls Math.random or reads the clock for a result, so every
// run with the same seeds prints the same numbers.

// A seeded generator (mulberry32). Same seed, same sequence, on every machine.
export function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    // Box-Muller: two uniforms make one standard normal.
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,                                                   // uniform in [0, 1)
    uniform: (lo, hi) => lo + (hi - lo) * next(),           // uniform in [lo, hi)
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // integer in lo..hi
    chance: (p) => next() < p,
    normal,
    lognormal: (median, sigma) => median * Math.exp(sigma * normal()),
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

// Mix two numbers into a new 32-bit seed (murmur3's finalizer over a simple combination).
export function mixSeed(a, b = 0) {
  let h = (Math.imul(a >>> 0, 0x9e3779b1) + Math.imul((b >>> 0) ^ 0x85ebca6b, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function mean(values) {
  if (!values.length) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Population standard deviation (divide by n).
export function sd(values) {
  const m = mean(values);
  if (m === null) return null;
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return Math.sqrt(sum / values.length);
}

// Quantile with linear interpolation between the two nearest ranks
// (position (n - 1) * q in the sorted list).
export function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values) {
  return quantile(values, 0.5);
}

// Pearson correlation of two equal-length lists; null when it is undefined
// (fewer than two pairs, or either list has no variance).
export function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
