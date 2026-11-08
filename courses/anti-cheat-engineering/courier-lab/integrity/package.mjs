import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const DEFAULT_LIMITS = Object.freeze({ maxFiles: 64, maxFileBytes: 1_048_576, maxTotalBytes: 8_388_608 });

function fail(message) {
  throw new Error(`Package observation refused: ${message}`);
}

function safePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (/[\\:\x00-\x1f\x7f]/.test(path) || path.startsWith('/')) return false;
  return path.split('/').every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..');
}

function limitsFor(options) {
  const limits = { ...DEFAULT_LIMITS };
  for (const name of Object.keys(limits)) {
    if (options[name] === undefined) continue;
    if (!Number.isSafeInteger(options[name]) || options[name] < 1) fail(`${name} must be a positive safe integer`);
    limits[name] = options[name];
  }
  return limits;
}

function sameIdentity(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function unchanged(first, second) {
  return sameIdentity(first, second) && first.size === second.size
    && first.mtimeNs === second.mtimeNs && first.ctimeNs === second.ctimeNs;
}

function inside(root, path) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

async function inspectPath(root, path) {
  const ancestry = [];
  const parts = path.split('/');
  let location = root;
  for (const [index, part] of parts.entries()) {
    location = resolve(location, part);
    const stat = await lstat(location, { bigint: true });
    if (stat.isSymbolicLink()) fail(`symbolic link at ${path}`);
    if (index < parts.length - 1 && !stat.isDirectory()) fail(`non-directory parent at ${path}`);
    ancestry.push({ location, stat });
  }
  if (!ancestry.at(-1).stat.isFile()) fail(`not a regular file: ${path}`);
  if (!inside(root, await realpath(location))) fail(`path escapes the package: ${path}`);
  return ancestry;
}

async function stableAncestry(ancestry, path) {
  for (const item of ancestry) {
    const now = await lstat(item.location, { bigint: true });
    if (now.isSymbolicLink() || !sameIdentity(item.stat, now)) fail(`path changed while reading ${path}`);
  }
}

async function digestFile(root, path, limits, remaining) {
  const ancestry = await inspectPath(root, path);
  const before = ancestry.at(-1).stat;
  if (before.size > BigInt(limits.maxFileBytes)) fail(`file size limit exceeded: ${path}`);
  if (before.size > BigInt(remaining)) fail('total size limit exceeded');
  const handle = await open(resolve(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !unchanged(before, opened)) fail(`file changed before reading ${path}`);
    const digest = createHash('sha256');
    const buffer = Buffer.alloc(65_536);
    let bytes = 0;
    for (;;) {
      const read = await handle.read(buffer, 0, Math.min(buffer.length, limits.maxFileBytes - bytes + 1), bytes);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > limits.maxFileBytes || bytes > remaining) fail(`size limit exceeded while reading ${path}`);
      digest.update(buffer.subarray(0, read.bytesRead));
    }
    if (BigInt(bytes) !== opened.size || !unchanged(opened, await handle.stat({ bigint: true }))) fail(`file changed while reading ${path}`);
    await stableAncestry(ancestry, path);
    if (!inside(root, await realpath(resolve(root, path)))) fail(`path escapes the package: ${path}`);
    return { bytes, sha256: digest.digest('hex') };
  } finally {
    await handle.close();
  }
}

/**
 * Hash an explicit, independently chosen runtime inventory. Paths must not be
 * derived from an unapproved manifest. Non-inventoried files are outside this check.
 * Callers must keep the package unchanged between observation and import.
 */
export async function observePackage(root, options = {}) {
  if (typeof root !== 'string' || !root) fail('root must be a directory path');
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('options must be an object');
  const limits = limitsFor(options);
  const { paths } = options;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > limits.maxFiles) fail('invalid file inventory or file count limit');
  if (paths.some((path) => !safePath(path)) || new Set(paths.map(path => path.toLowerCase())).size !== paths.length) fail('unsafe or duplicate relative path');
  const absoluteRoot = resolve(root);
  const rootStat = await lstat(absoluteRoot, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('root must be a real directory');
  const canonicalRoot = await realpath(absoluteRoot);
  if (canonicalRoot !== absoluteRoot) fail('root has a symbolic-link ancestor; use its real path');
  const observed = [];
  let total = 0;
  for (const path of [...paths].sort()) {
    const result = await digestFile(canonicalRoot, path, limits, limits.maxTotalBytes - total);
    total += result.bytes;
    observed.push({ path, sha256: result.sha256 });
  }
  const after = await lstat(absoluteRoot, { bigint: true });
  if (!after.isDirectory() || !sameIdentity(rootStat, after)) fail('root changed while reading');
  return observed;
}
