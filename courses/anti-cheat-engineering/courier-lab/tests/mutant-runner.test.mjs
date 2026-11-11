import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runNegativeControls } from './mutants.mjs';
import { withServer } from './harness.mjs';

test('a server that exits at startup is a runner failure, never a mutant kill', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'anti-cheat-broken-start-'));
  const entry = join(directory, 'exit-immediately.mjs');
  try {
    await writeFile(entry, 'process.exit(1);\n');
    await assert.rejects(runNegativeControls({ entry }), /exited before ready/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an unexpected runtime crash fails teardown even after the callback returns', async () => {
  // Uses the same real server as the other E2E tests; no substitute game engine.
  await assert.rejects(withServer(async (server) => {
    server.child.kill('SIGKILL');
    await server.waitForExit();
  }), /did not exit cleanly/);
});
