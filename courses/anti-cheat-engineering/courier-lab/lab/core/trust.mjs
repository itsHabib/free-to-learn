import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export const REFERENCE_PATH = 'lab/core/reference.json';
export const REFERENCE_SCHEMA = 'courier-core-reference-v1';
const FILE_LIMIT = 4 * 1024 * 1024;
const BUNDLE_LIMIT = 32 * 1024 * 1024;
const FILE_COUNT_LIMIT = 1000;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const saveJson = (path, value) => writeFile(path, jsonBytes(value), { flag: 'wx', mode: 0o600 });

async function boundedRead(file, relative) {
  const chunks = [];
  let length = 0;
  while (length <= FILE_LIMIT) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, FILE_LIMIT + 1 - length));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, length);
    if (!bytesRead) return Buffer.concat(chunks, length);
    chunks.push(buffer.subarray(0, bytesRead));
    length += bytesRead;
  }
  throw new Error(`Not a bounded regular file: ${relative}`);
}

export function safePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || /[\u0000-\u001f]/.test(path)) throw new Error('Invalid relative file path.');
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Invalid relative file path: ${path}`);
  return path;
}

/** Refuse symlinks at every component and files replaced during a read. */
export async function regularFile(root, relative) {
  safePath(relative);
  const base = await realpath(root);
  const path = resolve(base, relative);
  if (!path.startsWith(base + sep)) throw new Error(`File escapes its root: ${relative}`);
  const parts = relative.split('/');
  let initial;
  for (let i = 1; i <= parts.length; i += 1) {
    const stat = await lstat(join(base, ...parts.slice(0, i)), { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not accepted: ${relative}`);
    initial = stat;
  }
  if (!initial.isFile() || initial.size > BigInt(FILE_LIMIT)) throw new Error(`Not a bounded regular file: ${relative}`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(FILE_LIMIT)) throw new Error(`Not a bounded regular file: ${relative}`);
    if (before.dev !== initial.dev || before.ino !== initial.ino) throw new Error(`File changed during capture: ${relative}`);
    const bytes = await boundedRead(file, relative);
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink()) throw new Error(`File changed during capture: ${relative}`);
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== after[key] || before[key] !== current[key]) throw new Error(`File changed during capture: ${relative}`);
    }
    return bytes;
  } finally {
    await file.close();
  }
}

export async function readBundle(root, paths) {
  if (paths.length > FILE_COUNT_LIMIT) throw new Error('File count exceeds the bundle limit.');
  const bundle = Object.create(null);
  let total = 0;
  for (const path of [...paths].sort()) {
    const bytes = await regularFile(root, path);
    total += bytes.length;
    if (total > BUNDLE_LIMIT) throw new Error('Bundle exceeds its byte limit.');
    bundle[path] = bytes;
  }
  return bundle;
}

export function hashBundle(bundle) {
  return Object.fromEntries(Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, sha256(bytes)]));
}

export async function writeBundle(root, bundle) {
  for (const [path, bytes] of Object.entries(bundle)) {
    safePath(path);
    await mkdir(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(root, path), bytes, { flag: 'wx', mode: 0o600 });
  }
}

/** Double reads detect ordinary concurrent edits; this is not an OS sandbox. */
export async function captureBundle(root, paths, afterRead = async () => {}) {
  const captured = await readBundle(root, paths);
  await afterRead();
  const hashes = hashBundle(captured);
  if (JSON.stringify(hashes) !== JSON.stringify(hashBundle(await readBundle(root, paths)))) throw new Error('Submission changed during capture. Save all files and retry.');
  return { captured, hashes };
}

function excluded(path) {
  const parts = path.split('/');
  if (parts.some((part) => part.startsWith('.') || ['artifacts', 'node_modules'].includes(part))) return true;
  // The old spatial/order manifests may pin each other. No generated lab seal
  // participates in another seal; actual runtime and judge source still does.
  return path.startsWith('lab/') && path.endsWith('/reference.json');
}

export async function referenceFiles(root, prefix = '') {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (excluded(path)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Reference contains a symlink: ${path}`);
    if (entry.isDirectory()) files.push(...await referenceFiles(root, path + '/'));
    if (entry.isFile() && /\.(?:mjs|cjs|js|json|md)$/i.test(path)) files.push(path);
  }
  return files.sort();
}

export async function verifyReference(root, expectedHash) {
  const bytes = await regularFile(root, REFERENCE_PATH);
  if (expectedHash && sha256(bytes) !== expectedHash) throw new Error('Reference manifest changed since preparation.');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== REFERENCE_SCHEMA || !manifest.files || Array.isArray(manifest.files) || !Object.keys(manifest.files).length) throw new Error('Core reference is not sealed. Run node lab/core/seal.mjs.');
  const paths = Object.keys(manifest.files).sort();
  for (const path of paths) {
    safePath(path);
    if (excluded(path) || !/^[a-f0-9]{64}$/.test(manifest.files[path])) throw new Error(`Invalid sealed file: ${path}`);
  }
  if (JSON.stringify(paths) !== JSON.stringify(await referenceFiles(root))) throw new Error('Trusted reference inventory changed. Review and reseal the reference.');
  const { captured: bundle, hashes } = await captureBundle(root, paths);
  for (const path of paths) {
    if (hashes[path] !== manifest.files[path]) throw new Error(`Trusted reference changed: ${path}. Review and reseal the reference.`);
  }
  return { manifest, manifestHash: sha256(bytes), manifestBytes: bytes, bundle };
}

export async function hashTree(root, prefix = '') {
  const bundle = Object.create(null);
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Execution contains a symlink: ${path}`);
    if (entry.isDirectory()) Object.assign(bundle, await hashTree(root, path + '/'));
    if (entry.isFile()) bundle[path] = sha256(await regularFile(root, path));
  }
  return bundle;
}
