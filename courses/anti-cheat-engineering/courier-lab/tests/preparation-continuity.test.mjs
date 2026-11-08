import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { prepareSpatialWorkspace } from '../lab/prepare.mjs';
import { executeSpatialTests } from '../lab/check.mjs';
import { snapshotReference } from '../lab/reference-snapshot.mjs';
import { verifyReference } from '../lab/trust.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
async function cli(cwd, file, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try { return { code: 0, ...await execute(process.execPath, [file, ...args], { cwd, env, timeout: 60000, maxBuffer: 3 * 1024 * 1024 }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}

async function reference(t, change = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'ivy-legacy-continuity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of await readdir(project)) {
    if (['artifacts', 'node_modules'].includes(name)) continue;
    await cp(join(project, name), join(root, name), { recursive: true });
  }
  await change(root);
  const seal = await cli(root, 'lab/order/seal.mjs');
  assert.equal(seal.code, 0, seal.stderr);
  return root;
}

async function commitCalibrationPredictions(workspace) {
  const path = join(workspace, 'predictions.json');
  const predictions = JSON.parse(await readFile(path));
  predictions.predictions.forEach((item) => {
    item.skipReason = 'Author calibration checks source custody rather than written reasoning.';
  });
  await writeFile(path, JSON.stringify(predictions, null, 2) + '\n');
}

async function attempts(workspace) {
  return (await readdir(join(workspace, 'artifacts/attempts'))).sort();
}

test('new spatial and order preparations retain sealed bytes after source reseal', async (t) => {
  const root = await reference(t);
  const { destination: workspace } = await prepareSpatialWorkspace({ root });
  assert.equal((await cli(root, 'lab/order/prepare.mjs')).code, 0);
  const spatialSession = JSON.parse(await readFile(join(workspace, 'lab/session.json')));
  const orderSession = JSON.parse(await readFile(join(root, 'artifacts/order-workspace/lab/order/session.json')));
  assert.equal(spatialSession.referenceRoot, orderSession.referenceRoot);
  assert.ok(spatialSession.referenceRoot.includes('/artifacts/legacy-references/'));
  const oldServer = await readFile(join(spatialSession.referenceRoot, 'server.mjs'));
  await writeFile(join(root, 'server.mjs'), Buffer.concat([oldServer, Buffer.from('\n// reviewed later runtime\n')]));
  assert.equal((await cli(root, 'lab/order/seal.mjs')).code, 0);
  const current = await verifyReference(root);
  assert.notEqual(current.manifestHash, spatialSession.referenceManifest);
  const next = await snapshotReference(root, current);
  assert.notEqual(next, spatialSession.referenceRoot);
  await verifyReference(spatialSession.referenceRoot, spatialSession.referenceManifest);
  await verifyReference(orderSession.referenceRoot, orderSession.referenceManifest);
  assert.deepEqual(await readFile(join(spatialSession.referenceRoot, 'server.mjs')), oldServer);
  await commitCalibrationPredictions(workspace);
  const checked = await cli(workspace, 'lab/check.mjs', '--assistance', 'continuity regression');
  assert.equal(checked.code, 1, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /Criterion summary: FAIL/);
  assert.doesNotMatch(checked.stderr, /Reference manifest changed/);
  await assert.rejects(prepareSpatialWorkspace({ root }), /preserved/);
});

test('spatial first and revised attempts preserve bytes and record feedback before test output', async (t) => {
  const root = await reference(t);
  const { destination: workspace } = await prepareSpatialWorkspace({ root });
  await commitCalibrationPredictions(workspace);
  const first = await cli(workspace, 'lab/check.mjs', '--assistance', 'none');
  assert.equal(first.code, 1, first.stdout + first.stderr);
  assert.ok(first.stdout.indexOf('Saved attempt:') < first.stdout.indexOf('TAP version'));
  const [firstId] = await attempts(workspace);
  const directory = join(workspace, 'artifacts/attempts', firstId);
  const firstBytes = await readFile(join(directory, 'submission.json'));
  const metadata = JSON.parse(firstBytes);
  assert.equal(metadata.attemptKind, 'first');
  assert.equal(metadata.previousAttemptId, null);
  assert.equal(metadata.priorFeedbackExposure, false);
  assert.equal(JSON.parse(await readFile(join(directory, 'result.json'))).kind, 'behavior-failure');
  const firstResult = JSON.parse(await readFile(join(directory, 'result.json')));
  assert.equal(firstResult.structuredReportPath, await realpath(join(directory, 'structured-events.jsonl')));
  assert.ok(firstResult.testEvents.some((event) => event.type === 'test:fail'));
  const executionHashes = JSON.parse(await readFile(join(directory, 'execution-hashes.json')));
  assert.equal(executionHashes['structured-events.jsonl'], undefined);
  assert.ok(executionHashes['lab/spatial-reporter.mjs']);
  await readFile(join(directory, 'feedback-started.json'));
  await writeFile(join(workspace, 'defense.mjs'), await readFile(join(root, 'defense.mjs')));
  const second = await cli(workspace, 'lab/check.mjs', '--assistance', 'after feedback');
  assert.equal(second.code, 0, second.stdout + second.stderr);
  const secondId = (await attempts(workspace)).find((id) => id !== firstId);
  const revised = JSON.parse(await readFile(join(workspace, 'artifacts/attempts', secondId, 'submission.json')));
  assert.equal(revised.attemptKind, 'revision');
  assert.equal(revised.previousAttemptId, firstId);
  assert.equal(revised.priorFeedbackExposure, true);
  assert.deepEqual(await readFile(join(directory, 'submission.json')), firstBytes);
  assert.ok(!revised.ownerExecutionRoot.startsWith(workspace + '/'));
});

test('startup failures remain runner failures and old feedback remains unknown', async (t) => {
  const root = await reference(t, (root) => writeFile(join(root, 'server.mjs'), 'throw new Error("simulated startup failure");'));
  const { destination: workspace } = await prepareSpatialWorkspace({ root });
  const legacy = join(workspace, 'artifacts/attempts/0000-legacy');
  await mkdir(legacy, { recursive: true });
  const oldBytes = '{"attemptId":"0000-legacy","assistance":"unknown old record"}\n';
  await writeFile(join(legacy, 'submission.json'), oldBytes);
  await commitCalibrationPredictions(workspace);
  const checked = await cli(workspace, 'lab/check.mjs', '--assistance', 'startup regression');
  assert.equal(checked.code, 2, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /RUNNER FAILURE/);
  assert.doesNotMatch(checked.stdout, /Post-submission assistance/);
  const newest = (await attempts(workspace)).find((id) => id !== '0000-legacy');
  const metadata = JSON.parse(await readFile(join(workspace, 'artifacts/attempts', newest, 'submission.json')));
  assert.equal(metadata.attemptKind, 'revision');
  assert.equal(metadata.previousAttemptId, '0000-legacy');
  assert.equal(metadata.priorFeedbackExposure, null);
  assert.equal(JSON.parse(await readFile(join(workspace, 'artifacts/attempts', newest, 'result.json'))).kind, 'runner-failure');
  assert.equal(await readFile(join(legacy, 'submission.json'), 'utf8'), oldBytes);
});

test('spatial worker separates assertions from crashes and bounds timeout and output', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-spatial-worker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'tests'));
  const sources = [
    ["import test from 'node:test';import assert from 'node:assert/strict';test('behavior',()=>assert.equal(1,2));", 'behavior-failure'],
    ["import test from 'node:test';test('crash',()=>{throw new Error('startup error');});", 'runner-failure'],
    ["import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});", 'runner-failure'],
    ["console.log('x'.repeat(100000));", 'runner-failure'],
  ];
  for (const [source, expected] of sources) {
    await writeFile(join(root, 'tests/proximity.test.mjs'), source);
    const result = await executeSpatialTests({ execution: root, timeoutMs: 500, outputLimit: 4096 });
    assert.equal(result.kind, expected);
    assert.ok(Buffer.byteLength(result.output) <= 4096);
  }
});

test('assertion values cannot classify a separate infrastructure failure as behavior', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-spatial-typed-events-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const execution = join(root, 'execution');
  await mkdir(join(execution, 'tests'), { recursive: true });
  await writeFile(join(execution, 'tests/proximity.test.mjs'), `
    import test from 'node:test';
    import assert from 'node:assert/strict';
    test('behavior mismatch', () => assert.deepEqual({code:'ERR_ASSERTION'}, {}));
    test('infrastructure failed', () => { throw Object.assign(new Error('ECONNREFUSED: server did not start'), {code:'ECONNREFUSED'}); });
  `);
  const reportPath = join(root, 'structured-events.jsonl');
  const result = await executeSpatialTests({ execution, reportPath });
  assert.equal(result.kind, 'runner-failure');
  assert.equal(result.healthy, false);
  const failures = result.testEvents.filter((event) => event.type === 'test:fail');
  assert.equal(failures.length, 2);
  assert.deepEqual(failures.map((event) => event.details.error.cause.code), ['ERR_ASSERTION', 'ECONNREFUSED']);
  assert.deepEqual(failures[0].details.error.cause.actual, { code: 'ERR_ASSERTION' });
  const raw = (await readFile(reportPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(raw, result.testEvents);
  await assert.rejects(executeSpatialTests({ execution, reportPath: join(execution, 'report.jsonl') }), /outside the execution tree/);
});
