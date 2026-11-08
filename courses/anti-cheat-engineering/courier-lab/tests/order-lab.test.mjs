import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureBundle, sha256, verifyReference } from '../lab/trust.mjs';
import { assessResults, executeVariant } from '../lab/order/grade.mjs';
import { assertionEvidence } from '../author/order/worker.mjs';
import { CORRECT_VARIANTS, WRONG_VARIANTS } from '../author/order/variants.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
async function cli(cwd, script, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try { return { code: 0, ...await execute(process.execPath, [script, ...args], { cwd, env, timeout: 90000, maxBuffer: 4 * 1024 * 1024 }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
async function reference(t) {
  const root = await mkdtemp(join(tmpdir(), 'ivy-order-lab-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of await readdir(project)) {
    if (['artifacts', 'node_modules'].includes(entry)) continue;
    await cp(join(project, entry), join(root, entry), { recursive: true });
  }
  const sealed = await cli(root, 'lab/order/seal.mjs');
  assert.equal(sealed.code, 0, sealed.stderr);
  return { root, ...await verifyReference(root) };
}
async function commitPredictions(workspace) {
  const path = join(workspace, 'predictions.json');
  const document = JSON.parse(await readFile(path));
  document.predictions.forEach((item) => { item.answer = 'Captured author calibration prediction.'; });
  await writeFile(path, JSON.stringify(document, null, 2) + '\n');
}

async function adequate(bundle) {
  return {
    'admission.mjs': bundle['admission.mjs'],
    'learner-scenario.mjs': Buffer.from(bundle['author/order/adequate-scenario.mjs'].toString().replace('../../clients/http-client.mjs', './clients/http-client.mjs')),
  };
}

async function treeFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await treeFiles(root, path + '/'));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

async function assertNoReferenceSources(workspace) {
  const files = await treeFiles(workspace);
  assert.deepEqual(files.filter((path) => path.includes('/author/') || path.startsWith('author/') || path.endsWith('/adequate-scenario.mjs') || path.endsWith('/reference-admission.mjs')), []);
  assert.equal(files.some((path) => path.includes('/execution/')), false, 'owner runtime copies must stay outside the learner workspace');
}

// assessment-09: accept independent correct solutions and detect causal wrongs.
test('inverse checker calibration accepts two correct policies and detects all seven wrongs for all seeds', async (t) => {
  const { root, bundle } = await reference(t);
  const captured = await adequate(bundle);
  const component = [];
  for (const seed of [17, 31, 99]) component.push(await executeVariant({ destination: join(root, 'calibration'), bundle, captured, mode: 'component', variant: 'submitted-component', seed }));
  const scenarios = [];
  for (const variant of [...CORRECT_VARIANTS, ...WRONG_VARIANTS]) {
    for (const seed of [17, 31, 99]) {
      const result = await executeVariant({ destination: join(root, 'calibration'), bundle, captured, mode: 'scenario', variant, seed });
      scenarios.push(result);
      assert.equal(result.kind, CORRECT_VARIANTS.includes(variant) ? 'pass' : 'assertion', `${variant}/${seed}: ${JSON.stringify(result.error)}`);
      assert.equal(result.healthy, true);
      assert.equal(result.trace.dropped, 0);
      assert.ok(result.hashes['admission.mjs']);
      assert.deepEqual(result.hashes, result.afterHashes);
    }
  }
  assert.ok(component.every((result) => result.kind === 'pass'), JSON.stringify(component.map((result) => result.criteria?.filter((item) => !item.passed))));
  assert.equal(assessResults(component, scenarios).passed, true);
  assert.equal(assessResults(component, scenarios.filter((item) => item.variant !== 'alternate-correct')).passed, false);
});

test('string-valued authoritative-state assertions pass both corrects and detect every wrong', async (t) => {
  const { root, bundle } = await reference(t);
  const captured = await adequate(bundle);
  const original = captured['learner-scenario.mjs'].toString();
  captured['learner-scenario.mjs'] = Buffer.from(original.replaceAll('seen.lastDecision, null', "seen.lastDecision?.reason ?? 'none', 'none'"));
  assert.notEqual(captured['learner-scenario.mjs'].toString(), original);
  const scenarios = [];
  for (const variant of [...CORRECT_VARIANTS, ...WRONG_VARIANTS]) {
    const result = await executeVariant({ destination: join(root, 'string-state'), bundle, captured, mode: 'scenario', variant, seed: 17 });
    scenarios.push(result);
    assert.equal(result.kind, CORRECT_VARIANTS.includes(variant) ? 'pass' : 'assertion', `${variant}: ${JSON.stringify(result.error)}`);
    assert.equal(result.healthy, true);
  }
  const staleInteraction = scenarios.find((result) => result.variant === 'stale-interact');
  assert.equal(staleInteraction.error.actual, 'range');
  assert.equal(staleInteraction.error.expected, 'none');
  assert.equal(assessResults([{ seed: 17, kind: 'pass' }], scenarios, [17]).scenarioPassed, true);
});

test('empty, always-failing and error-string-only scenarios cannot pass the inverse judge', async (t) => {
  const { root, bundle } = await reference(t);
  const sources = {
    empty: 'export async function scenario() {}',
    always: "import assert from 'node:assert/strict'; export async function scenario() { assert.equal(1, 2); }",
    strings: "import assert from 'node:assert/strict'; import { join, input } from './clients/http-client.mjs'; export async function scenario({base}) { const a = await join(base); await input(base,a.token,10); const r = await input(base,a.token,10); assert.equal(r.data.status, 'stale'); }",
  };
  for (const [name, source] of Object.entries(sources)) {
    const captured = { ...await adequate(bundle), 'learner-scenario.mjs': Buffer.from(source) };
    const scenarios = [];
    for (const variant of [...CORRECT_VARIANTS, ...WRONG_VARIANTS]) scenarios.push(await executeVariant({ destination: join(root, name), bundle, captured, mode: 'scenario', variant, seed: 17 }));
    assert.equal(assessResults([{ seed: 17, kind: 'pass' }], scenarios, [17]).scenarioPassed, false, name);
    if (name === 'empty') assert.ok(scenarios.every((item) => item.kind === 'pass'));
    if (name === 'always') assert.ok(scenarios.every((item) => item.kind === 'assertion'));
    if (name === 'strings') assert.equal(scenarios.find((item) => item.variant === 'equal-seq-admitted').kind, 'assertion');
  }
});

test('imports, crashes, timeouts and assertion lookalikes never count as detected variants', async (t) => {
  const { root, bundle } = await reference(t);
  const sources = {
    import: "import './missing.mjs'; export async function scenario() {}",
    crash: 'export async function scenario() { process.exit(1); }',
    timeout: 'export async function scenario() { await new Promise(() => {}); }',
    fake: "export async function scenario() { throw Object.assign(new Error('wrong'), {name:'AssertionError',code:'ERR_ASSERTION',actual:1,expected:2}); }",
  };
  for (const [name, source] of Object.entries(sources)) {
    const captured = { ...await adequate(bundle), 'learner-scenario.mjs': Buffer.from(source) };
    const result = await executeVariant({ destination: join(root, name), bundle, captured, mode: 'scenario', variant: 'equal-seq-admitted', seed: 17, timeout: 1500 });
    assert.equal(result.kind, 'runner-failure', name);
  }
  let normal;
  try { assert.equal(1, 2); } catch (error) { normal = error; }
  assert.equal(assertionEvidence(normal), true);
  let textOnly;
  try { assert.equal('admitted', 'stale'); } catch (error) { textOnly = error; }
  assert.equal(assertionEvidence(textOnly), true);
  assert.equal(assertionEvidence(Object.assign(new Error('fake'), { name: 'AssertionError', code: 'ERR_ASSERTION', actual: 'range', expected: 'none' })), false);
});

test('capture rejects changing files and symlinks, and exclusive writes preserve prior bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-order-capture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'source.mjs'), 'original');
  await assert.rejects(captureBundle(root, ['source.mjs'], join(root, 'first'), () => writeFile(join(root, 'source.mjs'), 'changed')), /changed during capture/);
  await symlink(join(root, 'source.mjs'), join(root, 'link.mjs'));
  await assert.rejects(captureBundle(root, ['link.mjs'], join(root, 'second')), /Symlinks/);
  await captureBundle(root, ['source.mjs'], join(root, 'saved'));
  await writeFile(join(root, 'source.mjs'), 'revision');
  await assert.rejects(captureBundle(root, ['source.mjs'], join(root, 'saved')), /EEXIST/);
  assert.equal(await readFile(join(root, 'saved/source.mjs'), 'utf8'), 'changed');
});

test('prepared workflow strips answers, preserves first and revised attempts, and ignores workspace judges/runtime', async (t) => {
  const { root, bundle } = await reference(t);
  const prepared = await cli(root, 'lab/order/prepare.mjs');
  assert.equal(prepared.code, 0, prepared.stderr);
  assert.equal((await cli(root, 'lab/order/prepare.mjs')).code, 1);
  const workspace = join(root, 'artifacts/order-workspace');
  const session = JSON.parse(await readFile(join(workspace, 'lab/order/session.json')));
  for (const path of ['author', 'tests', 'clients/scenarios.mjs', 'clients/schedules.mjs', 'reference-admission.mjs']) await assert.rejects(readFile(join(workspace, path)), /ENOENT|EISDIR/);
  const starter = await readFile(join(workspace, 'admission.mjs'));
  assert.match(starter.toString(), /TODO/);
  const solution = await adequate(bundle);
  await writeFile(join(workspace, 'learner-scenario.mjs'), solution['learner-scenario.mjs']);
  await mkdir(join(workspace, 'tests'));
  await writeFile(join(workspace, 'tests/proximity.test.mjs'), "throw new Error('untrusted test')");
  await writeFile(join(workspace, 'engine.mjs'), "throw new Error('untrusted runtime')");
  await writeFile(join(workspace, 'response.md'), 'My first prediction.');
  await commitPredictions(workspace);
  const firstRun = await cli(workspace, 'lab/order/check.mjs', '--assistance', 'none');
  assert.equal(firstRun.code, 1, firstRun.stdout + firstRun.stderr);
  const attempts = join(workspace, 'artifacts/order-attempts');
  const [first] = await readdir(attempts);
  const firstMeta = JSON.parse(await readFile(join(attempts, first, 'submission.json')));
  assert.equal(firstMeta.attemptKind, 'first');
  assert.equal(firstMeta.priorFeedbackExposure, false);
  assert.equal(await readFile(join(attempts, first, 'submitted/response.md'), 'utf8'), 'My first prediction.');
  assert.equal(firstMeta.hashes['admission.mjs'], sha256(starter));
  await assertNoReferenceSources(workspace);
  assert.equal(firstMeta.ownerExecutionRoot, join(session.referenceRoot, 'artifacts/order-executions', first));
  assert.equal(await readFile(join(firstMeta.ownerExecutionRoot, 'scenario/baseline/17/reference-admission.mjs'), 'utf8'), bundle['admission.mjs'].toString());
  assert.equal(await readFile(join(firstMeta.ownerExecutionRoot, 'scenario/baseline/17/author/order/adequate-scenario.mjs'), 'utf8'), bundle['author/order/adequate-scenario.mjs'].toString());
  const firstResult = JSON.parse(await readFile(join(attempts, first, 'result.json')));
  assert.equal(firstResult.componentPassed, false);
  assert.equal(firstResult.scenarioPassed, true, 'broken submitted policy must not mask an adequate scenario');
  await writeFile(join(workspace, 'admission.mjs'), solution['admission.mjs']);
  await writeFile(join(workspace, 'learner-scenario.mjs'), solution['learner-scenario.mjs']);
  await writeFile(join(workspace, 'response.md'), 'My revision after feedback.');
  const secondRun = await cli(workspace, 'lab/order/check.mjs', '--assistance', 'author calibration');
  assert.equal(secondRun.code, 0, secondRun.stdout + secondRun.stderr);
  const second = (await readdir(attempts)).find((id) => id !== first);
  const secondMeta = JSON.parse(await readFile(join(attempts, second, 'submission.json')));
  assert.equal(secondMeta.attemptKind, 'revision');
  assert.equal(secondMeta.previousAttemptId, first);
  assert.equal(secondMeta.priorFeedbackExposure, true);
  await assertNoReferenceSources(workspace);
  assert.equal(secondMeta.ownerExecutionRoot, join(session.referenceRoot, 'artifacts/order-executions', second));
  assert.equal(await readFile(join(secondMeta.ownerExecutionRoot, 'scenario/baseline/17/reference-admission.mjs'), 'utf8'), bundle['admission.mjs'].toString());
  assert.deepEqual(secondMeta.seeds, [17, 31, 99]);
  assert.equal(await readFile(join(attempts, first, 'submitted/response.md'), 'utf8'), 'My first prediction.');
  const result = JSON.parse(await readFile(join(attempts, second, 'result.json')));
  assert.equal(result.passed, true);
  assert.equal(result.scenarios.length, 27);
  await writeFile(join(session.referenceRoot, 'author/order/variants.mjs'), '// changed reference');
  const refused = await cli(workspace, 'lab/order/check.mjs', '--assistance', 'none');
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /Trusted reference changed/);
  assert.equal((await readdir(attempts)).length, 2, 'reference mismatch must not run or create an attempt');
});

test('spatial checker uses sealed fixtures and reveals boundary feedback only after saving', async (t) => {
  const { root, bundle } = await reference(t);
  assert.equal((await cli(root, 'lab/prepare.mjs')).code, 0);
  const workspace = join(root, 'artifacts/workspace');
  const session = JSON.parse(await readFile(join(workspace, 'lab/session.json')));
  await writeFile(join(workspace, 'defense.mjs'), bundle['defense.mjs']);
  await mkdir(join(workspace, 'tests'));
  await writeFile(join(workspace, 'tests/proximity.test.mjs'), "throw new Error('not a trusted fixture');");
  await writeFile(join(workspace, 'engine.mjs'), "throw new Error('not the reference runtime');");
  await commitPredictions(workspace);
  const checked = await cli(workspace, 'lab/check.mjs', '--assistance', 'author calibration');
  assert.equal(checked.code, 0, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /Criterion summary: PASS/);
  assert.ok(checked.stdout.indexOf('Saved attempt:') < checked.stdout.indexOf('spatial boundary reasons'));
  assert.match(checked.stdout, /150² \+ 200² = 62,500/);
  assert.match(checked.stdout, /assistance, ungraded/);
  const attempts = join(workspace, 'artifacts/attempts');
  const [attempt] = await readdir(attempts);
  const submission = JSON.parse(await readFile(join(attempts, attempt, 'submission.json')));
  assert.equal(submission.ownerExecutionRoot.startsWith(join(session.referenceRoot, 'artifacts/spatial-executions')), true);
  await assertNoReferenceSources(workspace);
});
