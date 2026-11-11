const DIGEST = /^[a-fA-F0-9]{64}$/;

function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (/[\\:\x00-\x1f\x7f]/.test(path) || path.startsWith('/')) return false;
  return path.split('/').every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..');
}

function validInventory(files) {
  if (!Array.isArray(files) || files.length === 0) return false;
  const seen = new Set();
  for (const file of files) {
    if (!record(file, ['path', 'sha256']) || !safePath(file.path)) return false;
    if (typeof file.sha256 !== 'string' || !DIGEST.test(file.sha256) || seen.has(file.path.toLowerCase())) return false;
    seen.add(file.path.toLowerCase());
  }
  return true;
}

/** Pure policy: compare an approved reference with a separately observed inventory. */
export function checkPackage(input) {
  if (!record(input, ['manifest', 'observed', 'supported'])) return { ok: false, reason: 'schema' };
  const { manifest, observed, supported } = input;
  if (!record(manifest, ['schema', 'packageId', 'release', 'files'])) return { ok: false, reason: 'schema' };
  if (manifest.schema !== 1 || manifest.packageId !== 'courier-runtime') return { ok: false, reason: 'schema' };
  if (typeof manifest.release !== 'string' || manifest.release.trim().length === 0) return { ok: false, reason: 'schema' };
  if (!validInventory(manifest.files)) return { ok: false, reason: 'schema' };
  if (!Array.isArray(supported) || supported.some((release) => typeof release !== 'string' || !release.trim())) {
    return { ok: false, reason: 'schema' };
  }
  if (!supported.includes(manifest.release)) return { ok: false, reason: 'unsupported-release' };
  if (!validInventory(observed) || observed.length !== manifest.files.length) return { ok: false, reason: 'inventory' };
  const actual = new Map(observed.map((file) => [file.path, file.sha256.toLowerCase()]));
  if (manifest.files.some((file) => !actual.has(file.path))) return { ok: false, reason: 'inventory' };
  if (manifest.files.some((file) => actual.get(file.path) !== file.sha256.toLowerCase())) return { ok: false, reason: 'digest' };
  return { ok: true, reason: 'verified' };
}
