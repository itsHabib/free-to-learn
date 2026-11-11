// Supplied platform code. Do not implement your own cryptographic primitive.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class LabError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'LabError'; this.code = code; }
}
export const requireThat = (condition, code, detail) => {
  if (!condition) throw new LabError(code, detail);
};

// Key material stays in this process and is never written into reports or exports.
const materials = new WeakMap();
export function freshKey() {
  const handle = Object.freeze({ kind: 'ephemeral-toy-key' });
  materials.set(handle, { bytes: randomBytes(32), used: new Set() });
  return handle;
}
export function destroyKey(handle) {
  const material = materials.get(handle);
  if (material) material.bytes.fill(0);
  materials.delete(handle);
  // JS/crypto-library copies may remain: this is NOT a secure-erasure guarantee.
}
export function context(circuitId, relayId, direction, seq) {
  requireThat(typeof circuitId === 'string' && typeof relayId === 'string', 'BAD_CONTEXT');
  requireThat(['forward', 'backward'].includes(direction), 'BAD_DIRECTION');
  requireThat(Number.isSafeInteger(seq) && seq >= 0 && seq < 1024, 'BAD_SEQUENCE');
  return { protocol: 'onion-process-lab-v1', circuitId, relayId, direction, seq };
}
function aad(ctx) {
  // Canonical construction prevents object-key order from changing authentication.
  return Buffer.from(JSON.stringify(context(ctx.circuitId, ctx.relayId, ctx.direction, ctx.seq)));
}
function materialFor(handle) {
  const material = materials.get(handle);
  requireThat(material, 'KEY_UNAVAILABLE', 'Key handle is unknown or its circuit is closed.');
  return material;
}
function nonceFor(seq) {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(seq, 8);
  return nonce;
}
export function seal(handle, ctx, value) {
  const authenticated = aad(ctx);
  const material = materialFor(handle);
  // Every handle belongs to one hop and one direction of one circuit.
  // Reject reuse even with changed associated data: GCM needs unique key/nonce pairs.
  requireThat(!material.used.has(ctx.seq), 'NONCE_REUSE', 'Use a fresh sequence or rebuild with fresh keys.');
  const plaintext = Buffer.from(JSON.stringify(value));
  requireThat(plaintext.length <= 262144, 'OVERSIZE');
  const cipher = createCipheriv('aes-256-gcm', material.bytes, nonceFor(ctx.seq));
  cipher.setAAD(authenticated);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  material.used.add(ctx.seq);
  return { seq: ctx.seq, ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function open(handle, ctx, packet) {
  const authenticated = aad(ctx);
  const material = materialFor(handle);
  requireThat(packet && packet.seq === ctx.seq && typeof packet.ciphertext === 'string'
    && typeof packet.tag === 'string', 'BAD_PACKET');
  requireThat(packet.ciphertext.length <= 350000, 'OVERSIZE');
  try {
    const tag = Buffer.from(packet.tag, 'base64');
    requireThat(tag.length === 16, 'AUTH_FAILED');
    const decipher = createDecipheriv('aes-256-gcm', material.bytes, nonceFor(ctx.seq));
    decipher.setAAD(authenticated);
    decipher.setAuthTag(tag);
    // No plaintext escapes until final() has authenticated the complete packet.
    const plaintext = Buffer.concat([decipher.update(Buffer.from(packet.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new LabError('AUTH_FAILED', 'Ciphertext, tag, context or key did not authenticate.');
  }
}

// Trusted local setup only: a fresh secret is sent over parent-child IPC.
export const freshSecret = () => randomBytes(32).toString('hex');
export function importSecret(hex) {
  requireThat(typeof hex === 'string' && /^[a-f0-9]{64}$/.test(hex), 'BAD_KEY');
  const handle = Object.freeze({kind: 'ephemeral-process-lab-key'});
  materials.set(handle, {bytes: Buffer.from(hex, 'hex'), used: new Set()});
  return handle;
}
