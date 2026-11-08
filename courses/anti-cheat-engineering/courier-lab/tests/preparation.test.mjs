import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withServer } from './harness.mjs';
import { join as joinGame, state, request } from '../clients/http-client.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
async function cli(cwd, file, ...args) {
  const env = { ...process.env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
  try { return { code: 0, ...await execute(process.execPath, [file, ...args], { cwd, env, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function reference(t) {
  const root = await mkdtemp(join(tmpdir(), 'ivy-preparation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of await readdir(project)) {
    if (['artifacts', 'node_modules'].includes(entry)) continue;
    await cp(join(project, entry), join(root, entry), { recursive: true });
  }
  const sealed = await cli(root, 'lab/order/seal.mjs');
  assert.equal(sealed.code, 0, sealed.stderr);
  return root;
}
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(root, path + '/'));
    if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
async function commitCalibrationPredictions(workspace) {
  const path = join(workspace, 'predictions.json');
  const predictions = JSON.parse(await readFile(path));
  predictions.predictions.forEach((item) => {
    item.skipReason = 'Author calibration checks source custody rather than written reasoning.';
  });
  await writeFile(path, JSON.stringify(predictions, null, 2) + '\n');
}

async function attemptNames(workspace) {
  try { return await readdir(join(workspace, 'artifacts/attempts')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

test('spatial preparation has an explicit answer-free inventory and the game still serves real HTTP', async (t) => {
  const root = await reference(t);
  assert.equal((await cli(root, 'lab/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/workspace');
  assert.deepEqual(await files(workspace), [
    'admission.mjs', 'clients/http-client.mjs', 'clock.mjs', 'defense.mjs', 'engine.mjs',
    'lab/LEARNER.md', 'lab/check.mjs', 'lab/prompt.json', 'lab/response.md', 'lab/session.json',
    'learning/grade.mjs', 'learning/runtime.mjs', 'learning/service.mjs',
    'learning-support/README.md', 'learning-support/capstone-receipts.md',
    'learning-support/http-tests.md', 'learning-support/timing-predictor.md', 'package.json', 'predictions.json',
    'protocol.mjs', 'public/app.js', 'public/index.html', 'public/style.css', 'server.mjs', 'telemetry/runtime.mjs',
  ].sort());
  const guard = JSON.parse(await readFile(join(root, 'lab/reference.json'), 'utf8')).guard;
  assert.equal((await readFile(join(workspace, 'defense.mjs'), 'utf8')).includes(guard), false);
  const bootstrap = await readFile(join(workspace, 'lab/check.mjs'), 'utf8');
  assert.doesNotMatch(bootstrap, /OWNER_CHECK|export async function checkSubmission|captureBundle|spatial boundary reasons|62,500|tests\/proximity\.test/);
  assert.deepEqual(JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8')).scripts, { start: 'node server.mjs', 'lab:check': 'node lab/check.mjs', 'lab:practice': 'node lab/check.mjs --fresh' });
  const guide = await readFile(join(workspace, 'lab/LEARNER.md'), 'utf8');
  const firstPrediction = guide.indexOf('Record the required first answers');
  assert.ok(firstPrediction >= 0 && firstPrediction < guide.indexOf('npm run lab:check'));
  await withServer(async (server) => {
    const page = await request(server.base, '/');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /npm run (?:ci|lab:prepare|test:mutants)|href="\/(?:order|course)"/);
    const player = await joinGame(server.base);
    assert.equal((await state(server.base, player.token)).actor.id, player.id);
    for (const path of ['/app.js', '/style.css']) assert.equal((await request(server.base, path)).status, 200);
  }, { entry: join(workspace, 'server.mjs') });
});

test('spatial prompt changes are refused before an attempt while the exact original stays usable', async (t) => {
  const root = await reference(t);
  assert.equal((await cli(root, 'lab/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/workspace');
  const original = await readFile(join(workspace, 'lab/prompt.json'));
  const parsed = JSON.parse(original);
  for (const update of [{ id: 'another-exercise' }, { version: parsed.version + 1 }, { question: parsed.question + ' Changed.' }]) {
    await writeFile(join(workspace, 'lab/prompt.json'), JSON.stringify({ ...parsed, ...update }));
    const rejected = await cli(workspace, 'lab/check.mjs', '--assistance', 'author test');
    assert.equal(rejected.code, 2);
    assert.match(rejected.stderr, /Prompt changed/);
    assert.deepEqual(await attemptNames(workspace), []);
  }
  await writeFile(join(workspace, 'lab/prompt.json'), original);
  await writeFile(join(workspace, 'lab/response.md'), 'First predictions recorded before checker feedback.');
  await commitCalibrationPredictions(workspace);
  const checked = await cli(workspace, 'lab/check.mjs', '--assistance', 'author test');
  assert.equal(checked.code, 1, checked.stdout + checked.stderr);
  const [attempt] = await attemptNames(workspace);
  const metadata = JSON.parse(await readFile(join(workspace, 'artifacts/attempts', attempt, 'submission.json')));
  assert.deepEqual(metadata.prompt, JSON.parse(await readFile(join(workspace, 'lab/session.json'))).prompt);
  assert.equal(await readFile(join(workspace, 'artifacts/attempts', attempt, 'response.md'), 'utf8'), 'First predictions recorded before checker feedback.');
  assert.ok(checked.stdout.indexOf('Saved attempt:') < checked.stdout.indexOf('spatial boundary reasons'));
  const paths = await files(workspace);
  assert.equal(paths.some((path) => /(?:^|\/)execution(?:\/|$)|(?:^|\/)author(?:\/|$)|(?:^|\/)reference\.json$/.test(path)), false);
});

test('spatial sessions without optional prompt metadata preserve the new prediction contract and earlier attempts', async (t) => {
  const root = await reference(t);
  assert.equal((await cli(root, 'lab/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/workspace');
  const sessionPath = join(workspace, 'lab/session.json');
  const session = JSON.parse(await readFile(sessionPath));
  // Exercise the historical optional-prompt shape without pretending this newly
  // prepared workspace predates structured predictions or removing its contract.
  assert.equal(session.predictionContract, 'courier-predictions-v1');
  delete session.prompt;
  await writeFile(sessionPath, JSON.stringify(session));
  await commitCalibrationPredictions(workspace);
  await writeFile(join(workspace, 'defense.mjs'), await readFile(join(root, 'defense.mjs')));
  const first = await cli(workspace, 'lab/check.mjs', '--assistance', 'worked reference consulted');
  assert.equal(first.code, 0, first.stdout + first.stderr);
  const [attempt] = await attemptNames(workspace);
  const original = await readFile(join(workspace, 'artifacts/attempts', attempt, 'prompt.json'));
  await writeFile(join(workspace, 'lab/prompt.json'), '{}');
  assert.equal((await cli(workspace, 'lab/check.mjs', '--assistance', 'author test')).code, 2);
  assert.deepEqual(await attemptNames(workspace), [attempt]);
  assert.deepEqual(await readFile(join(workspace, 'artifacts/attempts', attempt, 'prompt.json')), original);
});

test('the learner bootstrap refuses changed trusted owner code before importing it', async (t) => {
  const root = await reference(t);
  assert.equal((await cli(root, 'lab/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/workspace');
  const session = JSON.parse(await readFile(join(workspace, 'lab/session.json')));
  await writeFile(join(session.referenceRoot, 'lab/check.mjs'), "throw new Error('untrusted execution');");
  const result = await cli(workspace, 'lab/check.mjs', '--assistance', 'author test');
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Trusted reference changed: lab\/check\.mjs/);
  assert.doesNotMatch(result.stderr, /untrusted execution/);
  assert.deepEqual(await attemptNames(workspace), []);
});

test('prepared order package exposes start, submission and fresh practice without an answer-bearing test suite', async (t) => {
  const root = await reference(t);
  assert.equal((await cli(root, 'lab/order/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/order-workspace');
  const manifest = JSON.parse(await readFile(join(workspace, 'package.json')));
  assert.deepEqual(manifest.scripts, { start: 'node server.mjs', 'order:check': 'node lab/order/check.mjs', 'order:practice': 'node lab/order/check.mjs --fresh' });
  assert.equal((await files(workspace)).some((path) => path.startsWith('tests/')), false);
  await assert.rejects(execute('npm', ['test'], { cwd: workspace }), /Missing script/);
  await assert.rejects(execute('npm', ['run', 'ci'], { cwd: workspace }), /Missing script/);
  for (const command of Object.values(manifest.scripts)) assert.ok((await files(workspace)).includes(command.split(' ')[1]));
});
