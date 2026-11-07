// Supplied mechanism. Learners implement the separate admission policy.
import { createHash, createPublicKey, verify } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const LAB_KEY = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
export const OTHER_LAB_KEY = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c';
export function verifySignature(message, signatureHex, publicHex) {
  if (!Buffer.isBuffer(message)) throw new TypeError('message must be exact bytes');
  if (!/^[a-f0-9]{128}$/.test(signatureHex) || !/^[a-f0-9]{64}$/.test(publicHex)) return false;
  const key = createPublicKey({key: Buffer.from('302a300506032b6570032100' + publicHex, 'hex'), format:'der', type:'spki'});
  return verify(null, message, key, Buffer.from(signatureHex, 'hex'));
}
export function evidence(capture, manifestBytes, signature, publicKey, minimumRelease) {
  if (!Number.isSafeInteger(minimumRelease) || minimumRelease < 1) throw new Error('minimum release must be a positive safe integer');
  // Signature covers exact bytes. JSON parsing does not canonicalize the signed data.
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 1 || manifest.format !== 'EDUFW1' || !Number.isSafeInteger(manifest.release) || manifest.release < 1 || !/^[a-f0-9]{64}$/.test(manifest.container_sha256)) throw new Error('Unsupported signed-manifest shape');
  return {
    signature: signature === null ? 'absent' : verifySignature(manifestBytes, signature, publicKey) ? 'valid' : 'invalid',
    key: publicKey === LAB_KEY ? 'pinned' : 'unknown',
    capture: sha256(capture) === manifest.container_sha256 ? 'match' : 'mismatch',
    release: manifest.release,
    minimumRelease,
  };
}
