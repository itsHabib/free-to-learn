import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { regularFile, saveJson } from './trust.mjs';

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function lockOwner(lock) {
  let owner;
  try { owner = JSON.parse(await regularFile(lock, 'owner.json')); }
  catch (error) {
    throw new Error(`Check lock metadata is incomplete. Retry shortly; no work was removed. (${error.message})`);
  }
  if (owner.schema !== 'courier-core-lock-v1' || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || !/^[a-f0-9-]{36}$/.test(owner.token)) throw new Error('Check lock metadata is incomplete. Retry shortly; no work was removed.');
  return owner;
}

async function recordInterruption({ root, sessionId, owner }) {
  const attempts = join(root, 'artifacts/core/attempts', sessionId);
  let entries;
  try { entries = await readdir(attempts, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const interrupted = [];
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    let submission;
    try { submission = JSON.parse(await regularFile(attempts, `${entry.name}/submission.json`)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (submission.checkId !== owner.token) continue;
    try { await regularFile(attempts, `${entry.name}/result.json`); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const record = {
      schema: 'courier-core-interruption-v1', attemptId: submission.attemptId,
      checkId: owner.token, ownerPid: owner.pid, recordedAt: new Date().toISOString(),
      reason: 'The previous checker process is no longer running. Its saved submission and any feedback exposure remain unchanged.',
    };
    try { await saveJson(join(attempts, entry.name, 'interrupted.json'), record); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    interrupted.push(submission.attemptId);
  }
  return interrupted;
}

async function recoverLock({ lock, ownerSession, root, sessionId }) {
  const recovery = join(lock, 'recovery');
  const recoveryToken = randomUUID();
  try { await mkdir(recovery, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    if (error.code === 'EEXIST') throw new Error('Check lock recovery is already in progress or has incomplete metadata. Retry shortly; no work was removed.');
    throw error;
  }
  let moved = false;
  try {
    await saveJson(join(recovery, 'owner.json'), { token: recoveryToken, pid: process.pid });
    // Read the owner only after claiming this lock generation. A competing
    // recovery may have replaced the path before this claim was acquired.
    const owner = await lockOwner(lock);
    if (alive(owner.pid)) throw new Error(`A check is already running for this session (PID ${owner.pid}). Retry when it finishes; no work was removed.`);
    const interrupted = await recordInterruption({ root, sessionId, owner });
    await saveJson(join(recovery, 'recovery.json'), {
      schema: 'courier-core-lock-recovery-v1', recoveredAt: new Date().toISOString(),
      previousOwner: owner, recoveredByPid: process.pid, interruptedAttempts: interrupted,
    });
    const archives = join(ownerSession, 'recovered-locks');
    await mkdir(archives, { recursive: true, mode: 0o700 });
    await rename(lock, join(archives, `${owner.token}-${recoveryToken}`));
    moved = true;
  } finally {
    if (!moved) {
      let current;
      try { current = JSON.parse(await regularFile(recovery, 'owner.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (current?.token === recoveryToken) await rm(recovery, { recursive: true });
    }
  }
}

export async function acquireCheckLock({ ownerSession, root, sessionId }) {
  const lock = join(ownerSession, 'checking');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(lock, { mode: 0o700 });
      const owner = { schema: 'courier-core-lock-v1', pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() };
      await saveJson(join(lock, 'owner.json'), owner);
      const stat = await lstat(lock);
      return { lock, token: owner.token, inode: stat.ino };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    await recoverLock({ lock, ownerSession, root, sessionId });
  }
  throw new Error('Another checker acquired this session. Retry shortly; no work was removed.');
}

export async function releaseCheckLock(lease) {
  let owner;
  try { owner = await lockOwner(lease.lock); }
  catch { return; }
  if (owner.token !== lease.token || (await lstat(lease.lock)).ino !== lease.inode) return;
  await rm(lease.lock, { recursive: true });
}
