import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const saveJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

export async function regularFile(root, relative) {
  const path = resolve(root, relative);
  if (!path.startsWith(resolve(root) + sep)) throw new Error(`File escapes the bundle: ${relative}`);
  const parts = relative.split('/');
  for (let index = 1; index <= parts.length; index += 1) {
    const info = await lstat(join(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not submitted: ${relative}`);
  }
  if (!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${relative}`);
  return readFile(path);
}

export async function readBundle(root, paths) {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await regularFile(root, path)])));
}

export function hashBundle(bundle) {
  return Object.fromEntries(Object.entries(bundle).sort().map(([path, bytes]) => [path, sha256(bytes)]));
}

export async function writeBundle(root, bundle) {
  for (const [path, bytes] of Object.entries(bundle)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes, { flag: 'wx' });
  }
}

/** Double-read custody detects normal concurrent edits; it is not an owner-hostile sandbox. */
export async function captureBundle(root, paths, destination, afterRead = async () => {}) {
  const captured = await readBundle(root, paths);
  await afterRead();
  const second = await readBundle(root, paths);
  const hashes = hashBundle(captured);
  if (JSON.stringify(hashes) !== JSON.stringify(hashBundle(second))) throw new Error('Submission changed during capture. Save all files and retry.');
  await writeBundle(destination, captured);
  return { captured, hashes };
}

export async function verifyReference(root, expectedManifestHash) {
  const bytes = await regularFile(root, 'lab/order/reference.json');
  if (expectedManifestHash && sha256(bytes) !== expectedManifestHash) throw new Error('Reference manifest changed since preparation.');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 'courier-order-reference-v1' || !manifest.files || !Object.keys(manifest.files).length) throw new Error('Reference is not sealed. Run node lab/order/seal.mjs in the reference checkout.');
  const bundle = await readBundle(root, Object.keys(manifest.files));
  const actual = hashBundle(bundle);
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (actual[path] !== hash) throw new Error(`Trusted reference changed: ${path}. Reseal only after reviewing the change.`);
  }
  return { manifest, manifestHash: sha256(bytes), bundle };
}

export async function hashTree(root, prefix = '') {
  const hashes = {};
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Execution contains a symlink: ${path}`);
    if (entry.isDirectory()) Object.assign(hashes, await hashTree(root, path + '/'));
    if (entry.isFile()) hashes[path] = sha256(await readFile(join(root, path)));
  }
  return hashes;
}
