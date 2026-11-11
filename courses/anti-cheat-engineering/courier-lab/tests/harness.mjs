import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { request } from '../clients/http-client.mjs';

export const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));

export async function startServer({ seed = 17, mutant, testMode = true, entry = serverPath, extraArgs = [] } = {}) {
  const args = ['--port', '0', '--seed', String(seed)];
  if (testMode) args.push('--test');
  if (mutant) args.push('--mutant', mutant);
  args.push(...extraArgs);
  const child = fork(entry, args, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
  let stdout = '';
  let stderr = '';
  let exited = false;
  let serial = 0;
  let exitInfo;
  const pending = new Map();
  const exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
    for (const item of pending.values()) item.reject(new Error(`Server exited (${code ?? signal}). ${stderr}`));
    pending.clear();
    resolve(exitInfo);
  }));
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-16384); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-16384); });
  child.on('message', (message) => {
    const item = pending.get(message?.requestId);
    if (!item) return;
    pending.delete(message.requestId);
    item.resolve(message);
  });
  const stop = async () => {
    if (exited) return exitInfo;
    if (testMode && child.connected) {
      try { await control('shutdown'); } catch { /* Escalate below if graceful shutdown failed. */ }
    }
    if (!testMode && !exited) child.kill('SIGTERM');
    return waitForExit();
  };
  const waitForExit = async () => {
    const result = await raceTimeout(exitPromise, 3000, 'Server did not shut down.').catch(async () => {
      child.kill('SIGKILL');
      await exitPromise;
      throw new Error(`Server needed SIGKILL during cleanup. ${stderr}`);
    });
    return result;
  };
  const control = async (type, values = {}) => {
    if (!child.connected || exited) throw new Error(`No live owner IPC channel. ${stderr}`);
    const requestId = `test-${++serial}`;
    const reply = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
    child.send({ type, requestId, ...values }, (error) => {
      if (!error) return;
      pending.get(requestId)?.reject(error);
      pending.delete(requestId);
    });
    try {
      const result = await raceTimeout(reply, 5000, `Owner ${type} acknowledgement timed out.`);
      if (result.ok !== true) throw new Error(`Owner ${type} failed: ${JSON.stringify(result)}`);
      return result;
    } finally {
      pending.delete(requestId);
    }
  };
  try {
    const ready = await raceTimeout(new Promise((resolve, reject) => {
      child.on('message', function readyListener(message) {
        if (message?.type !== 'ready') return;
        child.off('message', readyListener);
        resolve(message);
      });
      child.once('error', reject);
      exitPromise.then((info) => reject(new Error(`Server exited before ready (${info.code ?? info.signal}). ${stderr}`)));
    }), 5000, 'Server ready acknowledgement timed out.');
    if (!Number.isInteger(ready.port) || ready.port < 1 || ready.port > 65535) throw new Error('Server returned an invalid port.');
    const base = `http://127.0.0.1:${ready.port}`;
    const health = await request(base, '/health');
    if (health.status !== 200 || health.data?.ok !== true) throw new Error('Ready server failed its HTTP health probe.');
    return {
      base, port: ready.port, child, control, stop, waitForExit,
      advance: (ticks) => control('advance', { ticks }),
      record: async () => (await control('record')).record,
      diagnostics: () => ({ stdout, stderr, exited, exitInfo }),
    };
  } catch (error) {
    if (!exited) child.kill('SIGTERM');
    await waitForExit();
    throw error;
  }
}

export async function withServer(callback, options) {
  const server = await startServer(options);
  try { return await callback(server); } finally {
    const exit = await server.stop();
    if (exit.code !== 0) throw new Error(`Server did not exit cleanly (${exit.code ?? exit.signal}). ${server.diagnostics().stderr}`);
  }
}

export function raceTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
