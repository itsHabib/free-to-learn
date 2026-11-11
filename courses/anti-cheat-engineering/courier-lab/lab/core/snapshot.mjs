import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REFERENCE_PATH, verifyReference, writeBundle } from './trust.mjs';

async function directory(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Reference snapshot directory is not a regular directory: ${current}`);
  }
  return current;
}

async function verifySnapshot(path, hash) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Reference snapshot must be a directory without symlinks.');
  await verifyReference(path, hash);
  return path;
}

/** Publish once by atomic directory rename. A concurrent publisher must match. */
export async function snapshotReference({ root, bundle, manifestHash, manifestBytes }) {
  const references = await directory(root, 'artifacts/core/references');
  const destination = join(references, manifestHash);
  let existing;
  try { existing = await lstat(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) return verifySnapshot(destination, manifestHash);
  const staging = await mkdtemp(join(references, '.pending-'));
  try {
    await writeBundle(staging, bundle);
    await writeFile(join(staging, REFERENCE_PATH), manifestBytes, { flag: 'wx', mode: 0o600 });
    await verifySnapshot(staging, manifestHash);
    try { await rename(staging, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      // Another prepare has published this same digest. Never overwrite it.
    }
    return await verifySnapshot(destination, manifestHash);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
