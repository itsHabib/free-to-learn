import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { regularFile, sha256, verifyReference, writeBundle } from './trust.mjs';

async function verifySnapshot(path, hash) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Legacy reference snapshot must be a directory without symlinks.');
  await verifyReference(path, hash);
  return path;
}

/** New preparations pin bytes once; old sessions and attempts are never changed. */
export async function snapshotReference(source, trusted) {
  const root = await realpath(source);
  let parent = root;
  for (const name of ['artifacts', 'legacy-references']) {
    parent = join(parent, name);
    try { await mkdir(parent, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Legacy snapshot parent must be a directory without symlinks.');
  }
  const destination = join(parent, trusted.manifestHash);
  let exists;
  try { exists = await lstat(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) return verifySnapshot(destination, trusted.manifestHash);
  const bytes = await regularFile(root, 'lab/order/reference.json');
  if (sha256(bytes) !== trusted.manifestHash) throw new Error('Legacy reference changed while preparing its snapshot.');
  const staging = await mkdtemp(join(parent, '.pending-'));
  try {
    await writeBundle(staging, { ...trusted.bundle, 'lab/order/reference.json': bytes });
    await verifySnapshot(staging, trusted.manifestHash);
    try { await rename(staging, destination); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    return await verifySnapshot(destination, trusted.manifestHash);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
