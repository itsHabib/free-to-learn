/** Supplied: canonical JSON identity for data, never an authenticity claim. */
import { createHash } from 'node:crypto';

export function canonicalJSON(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Identity data must contain only finite numbers.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${Array.from(value, canonicalJSON).join(',')}]`;
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Identity data must be plain JSON values.');
  }
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
}

export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonicalJSON(value)).digest('hex');

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const copyData = value => JSON.parse(canonicalJSON(value));

