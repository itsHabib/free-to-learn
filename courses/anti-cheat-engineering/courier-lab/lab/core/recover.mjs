import { randomUUID } from 'node:crypto';
import { lstat, realpath, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleFor } from './registry.mjs';
import { regularFile, sha256, verifyReference } from './trust.mjs';

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function knownPids(lock, relative) {
  let bytes;
  try { bytes = await regularFile(lock, relative); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  // --stopped permits recovery of incomplete JSON. Still honor any PID already
  // written by its initializer, including a valid field in a partial record.
  return [...new Set([...bytes.toString('utf8').matchAll(/"pid"\s*:\s*(\d+)/g)].map((match) => Number(match[1])))].filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

async function assertStopped(lock) {
  const owners = [
    ...await knownPids(lock, 'owner.json'),
    ...await knownPids(lock, 'recovery/owner.json'),
  ];
  for (const pid of owners) {
    if (isAlive(pid)) throw new Error(`Check or recovery owner PID ${pid} is still alive. Stop all checks before using --stopped; no work was moved.`);
  }
}

async function sessionFor(workspace) {
  const bytes = await regularFile(workspace, 'lab/core/session.json');
  const session = JSON.parse(bytes);
  if (session.schema !== 'courier-core-session-v1' || !/^[a-f0-9-]{36}$/.test(session.sessionId) || !/^[a-f0-9]{64}$/.test(session.referenceManifest)) throw new Error('Invalid prepared session.');
  moduleFor(session.module);
  const root = await realpath(session.referenceRoot);
  await verifyReference(root, session.referenceManifest);
  const ownerSession = join(root, 'artifacts/core/sessions', session.sessionId);
  const owner = JSON.parse(await regularFile(ownerSession, 'session.json'));
  if (owner.workspace !== workspace || owner.referenceRoot !== root || owner.referenceManifest !== session.referenceManifest || owner.module !== session.module || owner.sessionHash !== sha256(bytes)) throw new Error('Prepared session identity changed. No work was moved.');
  return ownerSession;
}

/** Explicit maintenance only; unknown/partial owners are never auto-reaped. */
export async function recoverWorkspace({ workspace, stopped }) {
  if (stopped !== true) throw new Error('Stop all checks, then pass --stopped to confirm before recovering a lock.');
  workspace = await realpath(workspace);
  const ownerSession = await sessionFor(workspace);
  const lock = join(ownerSession, 'checking');
  let initial;
  try { initial = await lstat(lock, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return { recovered: false, workspace }; throw error; }
  if (!initial.isDirectory() || initial.isSymbolicLink()) throw new Error('Check lock must be a regular directory without symlinks. No work was moved.');
  await assertStopped(lock);
  // Recheck immediately before the one mutation; --stopped is the operator's
  // assertion that no check is starting while ambiguous metadata is examined.
  await assertStopped(lock);
  const current = await lstat(lock, { bigint: true });
  if (current.dev !== initial.dev || current.ino !== initial.ino) throw new Error('The check lock changed during recovery. Retry only after stopping all checks.');
  const archive = join(ownerSession, `checking-recovered-manual-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
  await rename(lock, archive);
  return { recovered: true, workspace, archive };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [workspace, stopped, ...extra] = process.argv.slice(2);
    if (!workspace || stopped !== '--stopped' || extra.length) throw new Error('Stop all checks, then run: node lab/core/recover.mjs <workspace> --stopped');
    const result = await recoverWorkspace({ workspace, stopped: true });
    console.log(result.recovered ? `Archived check lock: ${result.archive}\nAll attempts and feedback remain unchanged. You can retry the checker.` : `No check lock exists for ${result.workspace}. All attempts and feedback remain unchanged.`);
  } catch (error) {
    console.error(`Recovery refused: ${error.message}`);
    process.exitCode = 2;
  }
}
