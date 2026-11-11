// This self-contained bootstrap is the only runner source copied to a learner.
// Authenticate the owner-side modules before importing any of them.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FILE_LIMIT = 4 * 1024 * 1024;

async function read(root, path) {
  if (typeof path !== 'string' || path.includes('\\') || /[\u0000-\u001f]/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid reference path.');
  const parts = path.split('/');
  let initial;
  for (let index = 1; index <= parts.length; index += 1) {
    const stat = await lstat(join(root, ...parts.slice(0, index)), { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not accepted: ${path}`);
    initial = stat;
  }
  if (!initial.isFile() || initial.size > BigInt(FILE_LIMIT)) throw new Error(`Not a bounded regular file: ${path}`);
  const file = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(FILE_LIMIT)) throw new Error(`Not a bounded regular file: ${path}`);
    if (before.dev !== initial.dev || before.ino !== initial.ino) throw new Error(`File changed during capture: ${path}`);
    const chunks = [];
    let length = 0;
    while (length <= FILE_LIMIT) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, FILE_LIMIT + 1 - length));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, length);
      if (!bytesRead) break;
      chunks.push(buffer.subarray(0, bytesRead));
      length += bytesRead;
    }
    if (length > FILE_LIMIT) throw new Error(`Not a bounded regular file: ${path}`);
    const after = await file.stat({ bigint: true });
    const current = await lstat(join(root, path), { bigint: true });
    if (!current.isFile() || current.isSymbolicLink()) throw new Error(`File changed during capture: ${path}`);
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      if (before[key] !== after[key] || before[key] !== current[key]) throw new Error(`File changed during capture: ${path}`);
    }
    return Buffer.concat(chunks, length);
  } finally {
    await file.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args[0] === '--fresh';
  if (fresh) args.shift();
  if (args.length !== 2 || args[0] !== '--assistance' || !args[1].trim() || args[1].length > 10000) throw new Error('Record help used: npm run core:check -- --assistance "none" (or describe it).');
  const workspace = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const sessionBytes = await read(workspace, 'lab/core/session.json');
  const session = JSON.parse(sessionBytes);
  if (session.schema !== 'courier-core-session-v1' || !/^[a-f0-9-]{36}$/.test(session.sessionId) || !/^[a-z][a-z0-9-]{0,39}$/.test(session.module) || !/^[a-f0-9]{64}$/.test(session.referenceManifest)) throw new Error('Invalid prepared session.');
  const root = await realpath(session.referenceRoot);
  const manifestBytes = await read(root, 'lab/core/reference.json');
  if (hash(manifestBytes) !== session.referenceManifest) throw new Error('Reference manifest changed since preparation.');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'courier-core-reference-v1' || !manifest.files || !Object.keys(manifest.files).length) throw new Error('Invalid reference manifest.');
  for (const path of ['lab/core/trust.mjs', 'lab/core/grade.mjs', 'lab/core/registry.mjs', 'lab/core/worker.mjs']) {
    if (!Object.hasOwn(manifest.files, path)) throw new Error(`Missing trusted runner: ${path}`);
  }
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (!/^[a-f0-9]{64}$/.test(expected) || hash(await read(root, path)) !== expected) throw new Error(`Trusted reference changed: ${path}`);
  }
  const owner = JSON.parse(await read(root, `artifacts/core/sessions/${session.sessionId}/session.json`));
  if (owner.workspace !== workspace || owner.referenceRoot !== root || owner.sessionHash !== hash(sessionBytes)) throw new Error('Prepared session identity changed. Restore the original session.');
  const { checkSubmission } = await import(pathToFileURL(join(root, 'lab/core/grade.mjs')));
  const result = await checkSubmission({ workspace, session, assistance: args[1], fresh });
  process.exitCode = ['runner-failure', 'submission-refused'].includes(result.kind) ? 2 : Number(!result.passed);
}

try { await main(); }
catch (error) {
  console.error(`Submission refused: ${error.message}\nPrepare a workspace from the sealed reference with node lab/core/prepare.mjs <module>.`);
  process.exitCode = 2;
}
