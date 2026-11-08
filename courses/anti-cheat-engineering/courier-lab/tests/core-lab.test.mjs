import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkSubmission } from '../lab/core/grade.mjs';
import { prepareWorkspace } from '../lab/core/prepare.mjs';
import { recoverWorkspace } from '../lab/core/recover.mjs';
import { sealReference } from '../lab/core/seal.mjs';
import { captureBundle, hashBundle, referenceFiles, regularFile, sha256, verifyReference, writeBundle } from '../lab/core/trust.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const correct = 'export function decide(value) { return value % 2 === 0; }\n';
const alternate = 'export const decide = value => [0, 2, 4, 6, 8].includes(value % 10);\n';
const fixtures = `import assert from 'node:assert/strict';
import { examples } from '../runtime.mjs';
export async function assess(candidate) {
  const criteria = [];
  for (const [value, expected] of examples) {
    try {
      assert.equal(candidate.decide(value), expected);
      criteria.push({name:'classify ' + value, passed:true});
    } catch (error) {
      criteria.push({name:'classify ' + value, passed:false, error});
    }
  }
  return {passed:criteria.every(c => c.passed), criteria};
}
`;

async function cli(cwd, script, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try { return { code: 0, ...await execute(process.execPath, [script, ...args], { cwd, env, timeout: 15000, maxBuffer: 2 * 1024 * 1024 }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}

async function reference(t) {
  const root = await mkdtemp(join(tmpdir(), 'ivy-core-lab-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(project, 'lab/core'), join(root, 'lab/core'), { recursive: true, filter: (path) => !path.endsWith('/reference.json') });
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(root, 'runtime.mjs'), 'export const examples = [[1,false],[2,true]];\n');
  for (const id of ['integrity', 'telemetry', 'evaluation', 'retention']) {
    await mkdir(join(root, id));
    await writeFile(join(root, id, 'policy.mjs'), correct);
    await writeFile(join(root, id, 'template.mjs'), 'export function decide() { return false; } // TODO\n');
    await writeFile(join(root, id, 'fixtures.mjs'), fixtures);
    await writeFile(join(root, id, 'prompt.json'), JSON.stringify({ id: `core-${id}`, version: 1, wording: 'Classify each number by its parity.' }));
    await writeFile(join(root, id, 'LEARNER.md'), '# Decide\nRecord a prediction before the first run.\n');
    await writeFile(join(root, id, 'response-template.md'), 'My prediction:\nMy repair:\n');
  }
  await mkdir(join(root, 'author'));
  await writeFile(join(root, 'author/solution.mjs'), correct);
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public/viewer.js'), 'export const view = true;');
  await sealReference(root);
  return root;
}

async function prepared(t, id = 'integrity') {
  const root = await reference(t);
  const { workspace, sessionId } = await prepareWorkspace({ root, id });
  const session = JSON.parse(await readFile(join(workspace, 'lab/core/session.json')));
  return { root: session.referenceRoot, sourceRoot: root, workspace, sessionId, session };
}

async function attemptList(root, sessionId) {
  try { return (await readdir(join(root, 'artifacts/core/attempts', sessionId))).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

// assessment-09: calibrate the harness with genuine behavioral failures and
// independently expressed correct policies, not crashes presented as detections.
test('seal covers real source files, detects additions and has no generated-manifest cycle', async (t) => {
  const root = await reference(t);
  await mkdir(join(root, 'lab/order'));
  await writeFile(join(root, 'lab/order/reference.json'), '{"old":"seal"}');
  await writeFile(join(root, 'lab/reference.json'), '{"spatial":"seal"}');
  await mkdir(join(root, 'artifacts'));
  await writeFile(join(root, 'artifacts/not-sealed.mjs'), 'throw 1;');
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules/not-sealed.mjs'), 'throw 1;');
  const before = await readFile(join(root, 'lab/core/reference.json'));
  await sealReference(root);
  assert.deepEqual(await readFile(join(root, 'lab/core/reference.json')), before);
  const { manifest } = await verifyReference(root);
  for (const file of ['runtime.mjs', 'public/viewer.js', 'integrity/fixtures.mjs', 'integrity/template.mjs', 'telemetry/prompt.json', 'lab/core/worker.mjs']) assert.ok(manifest.files[file], file);
  assert.equal(Object.keys(manifest.files).some((file) => /reference\.json$/.test(file)), false);
  assert.deepEqual(Object.keys(manifest.files).sort(), await referenceFiles(root));
  await writeFile(join(root, 'runtime-helper.mjs'), 'export const newFile = true;');
  await assert.rejects(verifyReference(root), /inventory changed/);
  await rm(join(root, 'runtime-helper.mjs'));
  await writeFile(join(root, 'public/viewer.js'), 'changed bytes');
  await assert.rejects(verifyReference(root), /Trusted reference changed: public\/viewer.js/);
});

test('prepare copies only the incomplete learner surface and a usable package, preserving existing work', async (t) => {
  const root = await reference(t);
  const { workspace, sessionId, referenceRoot } = await prepareWorkspace({ root, id: 'telemetry' });
  assert.match(await readFile(join(workspace, 'telemetry/policy.mjs'), 'utf8'), /TODO/);
  for (const file of ['author/solution.mjs', 'runtime.mjs', 'telemetry/fixtures.mjs', 'telemetry/template.mjs', 'lab/core/grade.mjs']) await assert.rejects(readFile(join(workspace, file)), /ENOENT/);
  const pkg = JSON.parse(await readFile(join(workspace, 'package.json')));
  assert.deepEqual(pkg.scripts, { 'core:check': 'node lab/core/check.mjs' });
  assert.equal(pkg.private, true);
  const owner = JSON.parse(await readFile(join(referenceRoot, 'artifacts/core/sessions', sessionId, 'session.json')));
  assert.equal(owner.workspace, workspace);
  await writeFile(join(workspace, 'response.md'), 'Keep my work.');
  await assert.rejects(prepareWorkspace({ root, id: 'telemetry' }), /Existing work was preserved/);
  assert.equal(await readFile(join(workspace, 'response.md'), 'utf8'), 'Keep my work.');
  await assert.rejects(prepareWorkspace({ root, id: '../integrity' }), /Unknown core module/);
});

test('old workspaces retain pinned grading after source changes while new preparations use the new seal', async (t) => {
  const { root: pinned, sourceRoot, workspace, session, sessionId } = await prepared(t);
  const first = await checkSubmission({ workspace, session, assistance: 'none' });
  const firstBytes = await readFile(join(first.destination, 'submission.json'));
  const originalManifest = await readFile(join(pinned, 'lab/core/reference.json'));
  await writeFile(join(sourceRoot, 'runtime.mjs'), 'export const examples = [[1,true],[2,false]];\n');
  await writeFile(join(sourceRoot, 'integrity/prompt.json'), JSON.stringify({ id: 'core-integrity', version: 2, wording: 'A later exercise.' }));
  await writeFile(join(sourceRoot, 'lab/core/worker.mjs'), await readFile(join(pinned, 'lab/core/worker.mjs'), 'utf8') + '\n// Next reference runner revision.\n');
  await sealReference(sourceRoot);
  // The workspace bootstrap imports its pinned runner, even after the mutable
  // original runner changes. New preparations capture the new source bytes.
  await writeFile(join(workspace, 'integrity/policy.mjs'), correct);
  const oldCheck = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'prior feedback');
  assert.equal(oldCheck.code, 0, oldCheck.stdout + oldCheck.stderr);
  const { workspace: fresh, referenceRoot: newPinned } = await prepareWorkspace({ root: sourceRoot, id: 'telemetry' });
  assert.notEqual(newPinned, pinned);
  await writeFile(join(fresh, 'telemetry/policy.mjs'), correct);
  const newCheck = await cli(fresh, 'lab/core/check.mjs', '--assistance', 'author calibration');
  assert.equal(newCheck.code, 1, newCheck.stdout + newCheck.stderr);
  assert.deepEqual(await readFile(join(first.destination, 'submission.json')), firstBytes);
  assert.deepEqual(await readFile(join(pinned, 'lab/core/reference.json')), originalManifest);
  const ids = await attemptList(pinned, sessionId);
  assert.equal(ids.length, 2);
  const latest = JSON.parse(await readFile(join(pinned, 'artifacts/core/attempts', sessionId, ids[1], 'submission.json')));
  assert.equal(latest.previousAttemptId, first.attemptId);
  assert.equal(latest.prompt.version, 1);
  assert.equal(latest.priorFeedbackExposure, true);
  await assert.rejects(readFile(join(workspace, 'author/solution.mjs')), /ENOENT/);
});

test('concurrent preparations publish one snapshot and refuse tampering instead of replacing it', async (t) => {
  const root = await reference(t);
  const [integrity, telemetry] = await Promise.all([
    prepareWorkspace({ root, id: 'integrity' }), prepareWorkspace({ root, id: 'telemetry' }),
  ]);
  assert.equal(integrity.referenceRoot, telemetry.referenceRoot);
  const entries = await readdir(join(root, 'artifacts/core/references'));
  assert.deepEqual(entries, [integrity.referenceRoot.split('/').at(-1)]);
  await verifyReference(integrity.referenceRoot);
  await writeFile(join(integrity.referenceRoot, 'runtime.mjs'), 'tampered snapshot');
  const refused = await cli(integrity.workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /Trusted reference changed/);
  await assert.rejects(prepareWorkspace({ root, id: 'integrity' }), /Trusted reference changed/);
  assert.equal(await readFile(join(integrity.referenceRoot, 'runtime.mjs'), 'utf8'), 'tampered snapshot');
});

test('preexisting incomplete or symlinked snapshots are refused and left intact', async (t) => {
  const root = await reference(t);
  const { manifestHash } = await verifyReference(root);
  const snapshots = join(root, 'artifacts/core/references');
  const destination = join(snapshots, manifestHash);
  await mkdir(destination, { recursive: true });
  await assert.rejects(prepareWorkspace({ root, id: 'integrity' }), /ENOENT/);
  assert.deepEqual(await readdir(destination), []);
  await rm(destination, { recursive: true });
  await symlink(root, destination);
  await assert.rejects(prepareWorkspace({ root, id: 'integrity' }), /without symlinks/);
  await assert.rejects(readFile(join(root, 'artifacts/core/integrity-workspace/package.json')), /ENOENT/);
});

// practice-10, feedback-01, assessment-13: first responses and later repairs
// retain their own bytes, question identity, help and prior-feedback exposure.
test('real prepare/edit/check path preserves first and revised attempts outside learner control', async (t) => {
  const { root, workspace, sessionId, session } = await prepared(t);
  const original = await readFile(join(workspace, 'integrity/policy.mjs'));
  await writeFile(join(workspace, 'response.md'), 'I predict this will reject odd numbers.');
  const firstRun = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(firstRun.code, 1, firstRun.stdout + firstRun.stderr);
  const [firstId] = await attemptList(root, sessionId);
  const firstDir = join(root, 'artifacts/core/attempts', sessionId, firstId);
  const first = JSON.parse(await readFile(join(firstDir, 'submission.json')));
  const firstResult = JSON.parse(await readFile(join(firstDir, 'result.json')));
  assert.equal(first.attemptKind, 'first');
  assert.equal(first.priorFeedbackExposure, false);
  assert.equal(first.previousAttemptId, null);
  assert.equal(first.hashes['integrity/policy.mjs'], sha256(original));
  assert.equal(firstResult.kind, 'behavior-failure');
  assert.equal(firstResult.criteria[1].error.expected, true);
  assert.equal(firstResult.criteria[1].error.actual, false);
  assert.match(firstResult.criteria[1].error.message, /false !== true/);
  assert.ok(firstRun.stdout.indexOf('Saved attempt:') < firstRun.stdout.indexOf('Criterion summary:'));
  assert.equal(first.ownerExecutionRoot.startsWith(workspace + '/'), false);
  assert.deepEqual(firstResult.hashes, firstResult.afterHashes);
  await mkdir(join(workspace, 'artifacts/core-attempts'), { recursive: true });
  await writeFile(join(workspace, 'artifacts/core-attempts/forged.json'), '{"passed":true}');
  // These files are preserved as submitted bytes, but cannot replace the
  // runtime or judge imported from the separate trusted execution tree.
  await writeFile(join(workspace, 'runtime.mjs'), 'throw new Error("untrusted runtime");');
  await writeFile(join(workspace, 'integrity/fixtures.mjs'), 'throw new Error("untrusted fixture");');
  await writeFile(join(workspace, 'integrity/helper.mjs'), 'export const isEven = value => value % 2 === 0;');
  await writeFile(join(workspace, 'integrity/policy.mjs'), 'import {isEven} from "./helper.mjs"; export const decide = isEven;');
  await writeFile(join(workspace, 'response.md'), 'I repaired the even branch after feedback.');
  const help = { consulted: ['Checker feedback'], note: 'No other help.' };
  await writeFile(join(workspace, 'lab/core/help.json'), JSON.stringify(help));
  const revisionRun = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'checker feedback');
  assert.equal(revisionRun.code, 0, revisionRun.stdout + revisionRun.stderr);
  const secondId = (await attemptList(root, sessionId)).find((id) => id !== firstId);
  const secondDir = join(root, 'artifacts/core/attempts', sessionId, secondId);
  const second = JSON.parse(await readFile(join(secondDir, 'submission.json')));
  assert.equal(second.attemptKind, 'revision');
  assert.equal(second.previousAttemptId, firstId);
  assert.equal(second.priorFeedbackExposure, true);
  assert.deepEqual(second.help, help);
  assert.deepEqual(second.prompt, { id: 'core-integrity', version: 1, sha256: sha256(await readFile(join(root, 'integrity/prompt.json'))) });
  assert.equal(second.referenceManifest, session.referenceManifest);
  assert.ok(second.hashes['integrity/helper.mjs']);
  assert.equal(second.hashes['artifacts/core-attempts/forged.json'], undefined);
  assert.equal(await readFile(join(firstDir, 'submitted/response.md'), 'utf8'), 'I predict this will reject odd numbers.');
  assert.deepEqual(await readFile(join(firstDir, 'submitted/integrity/policy.mjs')), original);
  assert.equal(await readFile(join(second.ownerExecutionRoot, 'trusted/runtime.mjs'), 'utf8'), 'export const examples = [[1,false],[2,true]];\n');
  const firstMeta = await readFile(join(firstDir, 'submission.json'));
  assert.deepEqual(firstMeta, Buffer.from(JSON.stringify(first, null, 2) + '\n'));
});

test('both independently expressed correct policies pass the same sealed fixture', async (t) => {
  const { root, workspace, sessionId, session } = await prepared(t, 'telemetry');
  for (const source of [correct, alternate]) {
    await writeFile(join(workspace, 'telemetry/policy.mjs'), source);
    const result = await checkSubmission({ workspace, session, assistance: 'author calibration' });
    assert.equal(result.kind, 'pass');
    assert.equal(result.criteria.length, 2);
  }
  assert.equal((await attemptList(root, sessionId)).length, 2);
});

test('changed source, prompt, help, missing file and symlink refuse before feedback without erasing prior attempts', async (t) => {
  const { root, workspace, sessionId, session } = await prepared(t);
  const options = { workspace, session, assistance: 'none' };
  await assert.rejects(checkSubmission({ ...options, afterCaptureRead: () => writeFile(join(workspace, 'response.md'), 'A concurrent edit.') }), /changed during capture/);
  assert.equal((await attemptList(root, sessionId)).length, 0);
  const prompt = await readFile(join(workspace, 'integrity/prompt.json'));
  await writeFile(join(workspace, 'integrity/prompt.json'), '{"id":"easier","version":1}');
  await assert.rejects(checkSubmission(options), /Prompt changed/);
  await writeFile(join(workspace, 'integrity/prompt.json'), prompt);
  await writeFile(join(workspace, 'lab/core/help.json'), '{"consulted":"none"}');
  await assert.rejects(checkSubmission(options), /Help metadata/);
  await writeFile(join(workspace, 'lab/core/help.json'), '{"consulted":[]}');
  await checkSubmission(options);
  const [first] = await attemptList(root, sessionId);
  await rm(join(workspace, 'integrity/policy.mjs'));
  await assert.rejects(checkSubmission(options), /Missing submitted file/);
  await symlink(join(root, 'author/solution.mjs'), join(workspace, 'integrity/policy.mjs'));
  await assert.rejects(checkSubmission(options), /Symlinks are not submitted/);
  assert.deepEqual(await attemptList(root, sessionId), [first]);
});

test('capture rejects added files, path escapes and exclusive writes preserve original bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-core-capture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'source.mjs'), 'original');
  const { captured, hashes } = await captureBundle(root, ['source.mjs']);
  assert.deepEqual(hashes, hashBundle(captured));
  await assert.rejects(captureBundle(root, ['../escape']), /Invalid relative file path/);
  await assert.rejects(captureBundle(root, ['/absolute']), /Invalid relative file path/);
  await writeBundle(join(root, 'saved'), captured);
  await assert.rejects(writeBundle(join(root, 'saved'), { 'source.mjs': Buffer.from('new') }), /EEXIST/);
  assert.equal(await readFile(join(root, 'saved/source.mjs'), 'utf8'), 'original');
  const { workspace, session, sessionId, root: referenceRoot } = await prepared(t);
  await assert.rejects(checkSubmission({ workspace, session, assistance: 'none', afterCaptureRead: () => writeFile(join(workspace, 'extra.txt'), 'added') }), /inventory changed/);
  assert.deepEqual(await attemptList(referenceRoot, sessionId), []);
});

test('bounded reads accept the byte boundary and refuse oversized files and directories', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-core-file-limit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const atLimit = Buffer.alloc(4 * 1024 * 1024, 97);
  await writeFile(join(root, 'at-limit.bin'), atLimit);
  assert.deepEqual(await regularFile(root, 'at-limit.bin'), atLimit);
  await writeFile(join(root, 'too-large.bin'), Buffer.alloc(atLimit.length + 1));
  await assert.rejects(regularFile(root, 'too-large.bin'), /Not a bounded regular file/);
  await mkdir(join(root, 'directory'));
  await assert.rejects(regularFile(root, 'directory'), /Not a bounded regular file/);
});

test('POSIX FIFOs are refused before open by both helper and bootstrap', { skip: process.platform === 'win32' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ivy-core-fifo-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await execute('mkfifo', [join(root, 'pipe')]);
  const helper = new URL('../lab/core/trust.mjs', import.meta.url).href;
  const script = `import {regularFile} from ${JSON.stringify(helper)}; try { await regularFile(process.argv[1], 'pipe'); process.exitCode=1; } catch (error) { console.log(error.message); }`;
  const refused = await execute(process.execPath, ['--input-type=module', '-e', script, root], { timeout: 1500 });
  assert.match(refused.stdout, /Not a bounded regular file: pipe/);
  const { workspace } = await prepared(t);
  await rm(join(workspace, 'lab/core/session.json'));
  await execute('mkfifo', [join(workspace, 'lab/core/session.json')]);
  const bootstrap = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(bootstrap.code, 2);
  assert.match(bootstrap.stderr, /Not a bounded regular file/);
});

test('reference or session identity changes cannot run a submission', async (t) => {
  const { root, workspace, session, sessionId } = await prepared(t);
  const sessionPath = join(workspace, 'lab/core/session.json');
  const sessionBytes = await readFile(sessionPath);
  await writeFile(sessionPath, JSON.stringify({ ...session, module: 'telemetry' }));
  const changedSession = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(changedSession.code, 2);
  assert.match(changedSession.stderr, /session identity changed/);
  await writeFile(sessionPath, sessionBytes);
  await writeFile(join(root, 'integrity/fixtures.mjs'), 'export const assess = () => ({passed:true, criteria:[]});');
  const changedFixture = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(changedFixture.code, 2);
  assert.match(changedFixture.stderr, /Trusted reference changed/);
  assert.deepEqual(await attemptList(root, sessionId), []);
});

test('a session admits one check at a time and keeps partial pre-submission directories intact', async (t) => {
  const { root, workspace, session, sessionId } = await prepared(t);
  const partial = join(root, 'artifacts/core/attempts', sessionId, 'interrupted-before-submission');
  await mkdir(partial, { recursive: true });
  await writeFile(join(partial, 'partial.txt'), 'Keep these interrupted capture bytes.');
  let enteredCapture;
  const entered = new Promise((resolve) => { enteredCapture = resolve; });
  let finishCapture;
  const held = new Promise((resolve) => { finishCapture = resolve; });
  const running = checkSubmission({
    workspace, session, assistance: 'none',
    afterCaptureRead: async () => { enteredCapture(); await held; },
  });
  await entered;
  try {
    await assert.rejects(checkSubmission({ workspace, session, assistance: 'none' }), /already running/);
  } finally {
    finishCapture();
  }
  const first = await running;
  assert.equal(first.kind, 'behavior-failure');
  const next = await checkSubmission({ workspace, session, assistance: 'prior feedback' });
  const metadata = JSON.parse(await readFile(join(next.destination, 'submission.json')));
  assert.equal(metadata.previousAttemptId, first.attemptId);
  assert.equal(await readFile(join(partial, 'partial.txt'), 'utf8'), 'Keep these interrupted capture bytes.');
});

test('killed checker locks recover while preserving interrupted submissions and feedback exposure', async (t) => {
  const { root, workspace, sessionId } = await prepared(t);
  await writeFile(join(workspace, 'integrity/policy.mjs'), 'setInterval(() => {}, 1000); await new Promise(() => {});');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['lab/core/check.mjs', '--assistance', 'none'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  const output = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Checker did not save its attempt.')); }, 10000);
    child.stdout.on('data', (bytes) => {
      output += bytes;
      if (output.includes('Saved attempt:')) child.kill('SIGKILL');
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', () => { clearTimeout(timer); resolve(output); });
  });
  assert.match(output, /Saved attempt:/);
  const [firstId] = await attemptList(root, sessionId);
  const firstDirectory = join(root, 'artifacts/core/attempts', sessionId, firstId);
  const original = await readFile(join(firstDirectory, 'submission.json'));
  const saved = JSON.parse(original);
  const ownerSession = join(root, 'artifacts/core/sessions', sessionId);
  const lockOwner = JSON.parse(await readFile(join(ownerSession, 'checking/owner.json')));
  assert.equal(lockOwner.pid, child.pid);
  assert.equal(lockOwner.token, saved.checkId);
  await assert.rejects(readFile(join(firstDirectory, 'result.json')), /ENOENT/);
  await writeFile(join(workspace, 'integrity/policy.mjs'), correct);
  const retry = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'retry after interrupted check');
  assert.equal(retry.code, 0, retry.stdout + retry.stderr);
  const interruption = JSON.parse(await readFile(join(firstDirectory, 'interrupted.json')));
  assert.equal(interruption.ownerPid, child.pid);
  assert.equal(interruption.checkId, saved.checkId);
  assert.deepEqual(await readFile(join(firstDirectory, 'submission.json')), original);
  const nextId = (await attemptList(root, sessionId)).find((id) => id !== firstId);
  const next = JSON.parse(await readFile(join(root, 'artifacts/core/attempts', sessionId, nextId, 'submission.json')));
  assert.equal(next.attemptKind, 'revision');
  assert.equal(next.previousAttemptId, firstId);
  assert.equal(next.priorFeedbackExposure, true);
  assert.equal((await readdir(join(ownerSession, 'recovered-locks'))).length, 1);
  await assert.rejects(readFile(join(ownerSession, 'checking/owner.json')), /ENOENT/);
});

test('incomplete lock metadata refuses clearly and is never deleted', async (t) => {
  const { root, workspace, session, sessionId } = await prepared(t);
  const lock = join(root, 'artifacts/core/sessions', sessionId, 'checking');
  await mkdir(lock);
  await writeFile(join(lock, 'partial.txt'), 'An interrupted lock initializer.');
  await assert.rejects(checkSubmission({ workspace, session, assistance: 'none' }), /metadata is incomplete.*Retry shortly/);
  assert.equal(await readFile(join(lock, 'partial.txt'), 'utf8'), 'An interrupted lock initializer.');
  assert.deepEqual(await attemptList(root, sessionId), []);
});

test('explicit lock maintenance refuses known live check and recovery owners', async (t) => {
  const { root, workspace, sessionId } = await prepared(t);
  const lock = join(root, 'artifacts/core/sessions', sessionId, 'checking');
  await mkdir(lock);
  await assert.rejects(recoverWorkspace({ workspace }), /Stop all checks.*--stopped/);
  await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(recoverWorkspace({ workspace, stopped: true }), /still alive/);
  // A partial JSON owner record must not bypass the known-live-PID refusal.
  await writeFile(join(lock, 'owner.json'), `{"pid":${process.pid},`);
  await assert.rejects(recoverWorkspace({ workspace, stopped: true }), /still alive/);
  await writeFile(join(lock, 'owner.json'), '{}');
  await mkdir(join(lock, 'recovery'));
  await writeFile(join(lock, 'recovery/owner.json'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(recoverWorkspace({ workspace, stopped: true }), /still alive/);
  assert.equal(await readFile(join(lock, 'recovery/owner.json'), 'utf8'), JSON.stringify({ pid: process.pid }));
});

test('explicit maintenance archives empty, partial and dead-recovery locks without changing history', async (t) => {
  const { root, workspace, session, sessionId } = await prepared(t);
  const first = await checkSubmission({ workspace, session, assistance: 'none' });
  const firstBytes = await readFile(join(first.destination, 'submission.json'));
  const feedback = await readFile(join(first.destination, 'feedback-started.json'));
  const ownerSession = join(root, 'artifacts/core/sessions', sessionId);
  const lock = join(ownerSession, 'checking');
  await mkdir(lock);
  const empty = await recoverWorkspace({ workspace, stopped: true });
  assert.equal(empty.recovered, true);
  assert.deepEqual(await readdir(empty.archive), []);
  const exited = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve, reject) => { exited.once('exit', resolve); exited.once('error', reject); });
  await mkdir(join(lock, 'recovery'), { recursive: true });
  const partial = '{"createdAt":';
  const deadOwner = JSON.stringify({ pid: exited.pid, token: 'interrupted-recovery' });
  await writeFile(join(lock, 'owner.json'), partial);
  await writeFile(join(lock, 'recovery/owner.json'), deadOwner);
  await writeFile(join(lock, 'recovery/partial.txt'), 'Preserve recovery evidence.');
  const archived = await cli(project, 'lab/core/recover.mjs', workspace, '--stopped');
  assert.equal(archived.code, 0, archived.stdout + archived.stderr);
  assert.match(archived.stdout, /Archived check lock:.*manual-/);
  const archives = (await readdir(ownerSession)).filter((name) => name.startsWith('checking-recovered-manual-'));
  assert.equal(archives.length, 2);
  const newest = join(ownerSession, archives.find((name) => name !== empty.archive.split('/').at(-1)));
  assert.equal(await readFile(join(newest, 'owner.json'), 'utf8'), partial);
  assert.equal(await readFile(join(newest, 'recovery/owner.json'), 'utf8'), deadOwner);
  assert.equal(await readFile(join(newest, 'recovery/partial.txt'), 'utf8'), 'Preserve recovery evidence.');
  assert.deepEqual(await readFile(join(first.destination, 'submission.json')), firstBytes);
  assert.deepEqual(await readFile(join(first.destination, 'feedback-started.json')), feedback);
  assert.deepEqual(await attemptList(root, sessionId), [first.attemptId]);
  const missing = await recoverWorkspace({ workspace, stopped: true });
  assert.equal(missing.recovered, false);
});

test('structured fixture error source reaches both saved evidence and useful terminal feedback', async (t) => {
  const root = await reference(t);
  const source = { path: 'telemetry/LEARNER.md', anchor: 'replay-window' };
  const error = { message: 'Replay needs a complete window.', code: 'ERR_ASSERTION', operator: 'deepStrictEqual', expected: { ok: false }, actual: { ok: true }, source };
  await writeFile(join(root, 'telemetry/fixtures.mjs'), `export async function assess() {return ${JSON.stringify({ passed: false, criteria: [{ name: 'complete window', passed: false, error }] })};}`);
  await sealReference(root);
  const { workspace, referenceRoot, sessionId } = await prepareWorkspace({ root, id: 'telemetry' });
  const checked = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'fixture calibration');
  assert.equal(checked.code, 1, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /Replay needs a complete window/);
  assert.match(checked.stdout, /Source:.*telemetry\/LEARNER\.md.*replay-window/);
  const [id] = await attemptList(referenceRoot, sessionId);
  const result = JSON.parse(await readFile(join(referenceRoot, 'artifacts/core/attempts', sessionId, id, 'result.json')));
  assert.deepEqual(result.criteria[0].error, error);
});

test('imports, crashes, timeouts and output overruns remain saved runner failures', async (t) => {
  const { workspace, session, root, sessionId } = await prepared(t);
  const sources = [
    ["import './missing.mjs';", /Cannot find module/],
    ['process.exit(0);', /without a complete result/],
    ['setInterval(() => {}, 1000); await new Promise(() => {});', /timed out/],
    ['console.log("x".repeat(100000)); export const decide = () => true;', /output budget/],
  ];
  for (const [source, reason] of sources) {
    await writeFile(join(workspace, 'integrity/policy.mjs'), source);
    const result = await checkSubmission({ workspace, session, assistance: 'harness calibration', timeout: 500, outputLimit: 2048 });
    assert.equal(result.kind, 'runner-failure');
    assert.equal(result.passed, false);
    assert.match(result.error.message, reason);
    assert.ok(Buffer.byteLength(result.output) <= 2048);
    const saved = JSON.parse(await readFile(join(result.destination, 'result.json')));
    assert.equal(saved.kind, 'runner-failure');
  }
  assert.equal((await attemptList(root, sessionId)).length, sources.length);
});

test('modification of the captured execution tree invalidates an otherwise passing policy', async (t) => {
  const { workspace, session } = await prepared(t);
  await writeFile(join(workspace, 'integrity/policy.mjs'), `import {writeFileSync} from 'node:fs';
writeFileSync(new URL('../changed.txt', import.meta.url), 'changed');
${correct}`);
  const result = await checkSubmission({ workspace, session, assistance: 'harness calibration' });
  assert.equal(result.kind, 'runner-failure');
  assert.match(result.error.message, /Execution files changed/);
});

test('invalid fixture summaries and uncaught fixture errors are runner failures', async (t) => {
  const root = await reference(t);
  await writeFile(join(root, 'integrity/fixtures.mjs'), 'export async function assess() { return {passed:true,criteria:[{name:"false pass",passed:false}]}; }');
  await writeFile(join(root, 'telemetry/fixtures.mjs'), 'export async function assess() { throw new Error("fixture crashed"); }');
  await sealReference(root);
  for (const id of ['integrity', 'telemetry']) {
    const { workspace } = await prepareWorkspace({ root, id });
    const session = JSON.parse(await readFile(join(workspace, 'lab/core/session.json')));
    const result = await checkSubmission({ workspace, session, assistance: 'harness calibration' });
    assert.equal(result.kind, 'runner-failure');
    assert.match(result.error.message, /disagrees|fixture crashed/);
  }
});

test('CLI clearly requires assistance declaration and reports runner failure with exit code two', async (t) => {
  const { workspace, sessionId, root } = await prepared(t);
  const missing = await cli(workspace, 'lab/core/check.mjs');
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /Record help used/);
  assert.deepEqual(await attemptList(root, sessionId), []);
  await writeFile(join(workspace, 'integrity/policy.mjs'), 'throw new Error("learner import crashed");');
  const failed = await cli(workspace, 'lab/core/check.mjs', '--assistance', 'none');
  assert.equal(failed.code, 2, failed.stdout + failed.stderr);
  assert.match(failed.stdout, /RUNNER FAILURE/);
  assert.equal((await attemptList(root, sessionId)).length, 1);
});

for (const id of ['evaluation', 'retention']) test(`actual ${id} bootstrap reaches and preserves behavioral verdict`, async t => {
 const {root,workspace,sessionId}=await prepared(t,id);
 const result=await cli(workspace,'lab/core/check.mjs','--assistance','test fixture');
 assert.equal(result.code,1,result.stderr);
 assert.match(result.stdout,/Criterion summary: FAIL/);
 assert.equal((await attemptList(root,sessionId)).length,1);
});

test('named preparation creates a fresh personal workspace without changing prior runs', async t=>{
 const root=await reference(t);
 const first=await prepareWorkspace({root,id:'evaluation'});
 const named=await prepareWorkspace({root,id:'evaluation',name:'my-run'});
 assert.notEqual(first.workspace,named.workspace);
 assert.match(named.workspace,/evaluation-my-run-workspace$/);
 await assert.rejects(prepareWorkspace({root,id:'evaluation',name:'my-run'}),/already exists/);
 await assert.rejects(prepareWorkspace({root,id:'evaluation',name:'..\/escape'}),/Workspace name/);
});

// Opus F5: normal completion must reap children too, not just timeout paths.
test('successful worker completion reaps an unrefed child in its process group', { skip: process.platform === 'win32' }, async t => {
 const {workspace,session}=await prepared(t);
 await writeFile(join(workspace,'integrity/policy.mjs'), `import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();console.log('DESCENDANT_PID='+child.pid);
${correct}`);
 const result=await checkSubmission({workspace,session,assistance:'runner cleanup regression'});
 assert.equal(result.kind,'pass');
 const pid=Number(result.output.match(/DESCENDANT_PID=(\d+)/)?.[1]);
 assert.ok(pid>0);
 t.after(()=>{try{process.kill(pid,'SIGKILL');}catch{}});
 let live=true;
 for(let attempt=0;attempt<30;attempt+=1){
  try{const {stdout}=await execute('ps',['-o','stat=','-p',String(pid)]);live=Boolean(stdout.trim())&&!stdout.trim().startsWith('Z');}
  catch{live=false;}
  if(!live)break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(live,false,'successful check left a live descendant');
});
