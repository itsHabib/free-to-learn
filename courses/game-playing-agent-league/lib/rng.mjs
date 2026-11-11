/** Supplied deterministic PRNG. Not suitable for security or secret generation. */
import { sha256 } from './identity.mjs';

export function uint32(value, label = 'seed') {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be a uint32.`);
  return value;
}

export function createRng(seed = 0) {
  let state = uint32(seed);
  const random = () => {
    // A documented 32-bit LCG; all integer arithmetic wraps modulo 2^32.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  random.state = () => state;
  return random;
}

export const deriveSeed = (...parts) => Number.parseInt(sha256(parts).slice(0, 8), 16) >>> 0;

export function shuffle(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

