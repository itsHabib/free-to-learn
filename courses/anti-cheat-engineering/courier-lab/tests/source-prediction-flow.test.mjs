import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareWorkspace } from '../lab/core/prepare.mjs';
import { checkSubmission } from '../lab/core/grade.mjs';
import { sealReference } from '../lab/core/seal.mjs';
import { PREDICTION_CONTRACT, predictionTemplate, validatePredictions } from '../lab/core/predictions.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const listing = async (path) => readdir(path).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });

async function cli(root, script, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try { return { code: 0, ...await execute(process.execPath, [script, ...args], { cwd: root, env, timeout: 90000, maxBuffer: 4 * 1024 * 1024 }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}

async function reference(t) {
  const root = await mkdtemp(join(tmpdir(), 'ivy-prediction-flow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(project, root, { recursive: true, filter: (path) => !['artifacts', 'node_modules'].includes(path.split('/').at(-1)) });
  assert.equal((await cli(root, 'lab/order/seal.mjs')).code, 0);
  await sealReference(root);
  return root;
}

async function answer(path, { skip = false, text = 'My prediction before feedback.' } = {}) {
  const document = await json(path);
  document.predictions.forEach((item, index) => {
    item.answer = skip && index === 0 ? '' : text;
    item.skipReason = skip && index === 0 ? 'I need the worked explanation before answering this case.' : '';
  });
  await save(path, document);
  return document;
}

// practice-08 / feedback-01: a prediction commit precedes its keyed outcome.
test('all seven core modules refuse untouched predictions, preserve drafts, then capture skipped/answered and fresh revisions', async (t) => {
  const root = await reference(t);
  for (const id of ['integrity', 'telemetry', 'evaluation', 'retention', 'timing', 'recovery', 'capstone']) {
    await t.test(id, async () => {
      const { workspace, sessionId, referenceRoot } = await prepareWorkspace({ root, id });
      const session = await json(join(workspace, 'lab/core/session.json'));
      assert.equal(session.predictionContract, PREDICTION_CONTRACT);
      const args = { workspace, session, assistance: 'none' };
      const attempts = join(referenceRoot, 'artifacts/core/attempts', sessionId);
      const template = await readFile(join(workspace, 'predictions.json'), 'utf8');
      const expected = await import(new URL(`../${id}/feedback.mjs`, import.meta.url));
      assert.deepEqual(JSON.parse(template), predictionTemplate(expected.postCheckFeedback(), id));
      assert.equal(await readFile(join(workspace, 'fresh-practice.json')).catch(() => null), null);
      const early = await checkSubmission({ ...args, fresh: true });
      assert.equal(early.kind, 'submission-refused');
      const refused = await checkSubmission(args);
      assert.equal(refused.kind, 'submission-refused');
      assert.equal(refused.graded, false);
      assert.deepEqual(await listing(attempts), []);
      assert.equal(await readFile(join(refused.destination, 'submitted/predictions.json'), 'utf8'), template);
      assert.equal(await readFile(join(refused.destination, 'feedback-started.json')).catch(() => null), null);
      await writeFile(join(workspace, 'predictions.json'), '{unfinished draft');
      const malformed = await checkSubmission(args);
      assert.equal(malformed.kind, 'submission-refused');
      assert.equal(await readFile(join(malformed.destination, 'submitted/predictions.json'), 'utf8'), '{unfinished draft');
      await writeFile(join(workspace, 'predictions.json'), template);
      const predictions = await answer(join(workspace, 'predictions.json'), { skip: true });
      await cp(join(root, id, 'policy.mjs'), join(workspace, id, 'policy.mjs'));
      if (id === 'capstone') await cp(join(root, id, 'author-scenario.mjs'), join(workspace, id, 'scenario.mjs'));
      const first = await checkSubmission(args);
      assert.equal(first.passed, true, id + ': source grading is independent of arbitrary prose or explicit skips');
      const submission = await json(join(first.destination, 'submission.json'));
      assert.equal(submission.attemptKind, 'first');
      assert.equal(submission.assistanceClass, 'assisted');
      assert.equal(submission.predictionStatus, 'assisted-skipped');
      assert.deepEqual(submission.predictions, predictions);
      assert.equal(submission.proseGraded, false);
      const feedback = await json(join(first.destination, 'prediction-feedback.json'));
      assert.deepEqual(feedback.submittedPredictions, predictions);
      assert.equal(feedback.freshVariantAnswers, undefined);
      assert.equal(feedback.freshVariants, undefined);
      const blankFresh = await readFile(join(workspace, 'fresh-practice.json'), 'utf8');
      const freshRefused = await checkSubmission({ ...args, fresh: true });
      assert.equal(freshRefused.kind, 'submission-refused');
      assert.equal(await readFile(join(freshRefused.destination, 'submitted/fresh-practice.json'), 'utf8'), blankFresh);
      const freshAnswers = await answer(join(workspace, 'fresh-practice.json'));
      const fresh = await checkSubmission({ ...args, fresh: true });
      const freshSubmission = await json(join(fresh.destination, 'submission.json'));
      assert.equal(freshSubmission.attemptKind, 'first');
      assert.equal(freshSubmission.sourceAttemptId, first.attemptId);
      assert.deepEqual(freshSubmission.predictions, freshAnswers);
      assert.equal(fresh.graded, false);
      const freshFeedback = await json(join(fresh.destination, 'prediction-feedback.json'));
      assert.equal(freshFeedback.freshVariantAnswers.length, predictions.predictions.length);
      assert.ok(freshFeedback.freshVariantAnswers.every((item) => item.reason && item.answer && item.question));
      // Emulate interruption after a committed fresh submission: its identity and
      // feedback exposure must still survive if the feedback file is absent.
      await rm(join(fresh.destination, 'prediction-feedback.json'));
      await answer(join(workspace, 'fresh-practice.json'), { skip: true });
      const revision = await checkSubmission({ ...args, fresh: true });
      const revised = await json(join(revision.destination, 'submission.json'));
      assert.equal(revised.attemptKind, 'revision');
      assert.equal(revised.priorFeedbackExposure, true);
      assert.equal(revised.assistanceClass, 'assisted');
      assert.deepEqual(await json(join(fresh.destination, 'submitted/fresh-practice.json')), freshAnswers);
      await answer(join(workspace, 'predictions.json'));
      const sourceRevision = await checkSubmission(args);
      assert.equal((await json(join(sourceRevision.destination, 'submission.json'))).attemptKind, 'revision');
      assert.deepEqual(await json(join(first.destination, 'submitted/predictions.json')), predictions);
    });
  }
});

test('exact questions, all responses, and explicit mutually exclusive skips are required', async () => {
  const { postCheckFeedback } = await import('../timing/feedback.mjs');
  const template = predictionTemplate(postCheckFeedback(), 'timing');
  const completed = structuredClone(template);
  completed.predictions.forEach((item) => { item.answer = 'A committed prediction.'; });
  assert.equal(validatePredictions(JSON.stringify(completed), template).answeredCount, 4);
  for (const mutate of [
    (doc) => { doc.predictions[0].question += ' changed'; },
    (doc) => { doc.predictions[0].id = 'replacement'; },
    (doc) => { doc.predictions[0].answer = ' '; },
    (doc) => { doc.predictions[0].skipReason = 'Need help'; },
    (doc) => { doc.predictions.pop(); },
  ]) {
    const document = structuredClone(completed);
    mutate(document);
    assert.throws(() => validatePredictions(JSON.stringify(document), template));
  }
});

test('legacy spatial and order CLIs enforce the same prediction and fresh-practice commits', async (t) => {
  const root = await reference(t);
  for (const [id, prepare, workspacePath, check, attemptsName] of [
    ['spatial', 'lab/prepare.mjs', 'artifacts/workspace', 'lab/check.mjs', 'attempts'],
    ['order', 'lab/order/prepare.mjs', 'artifacts/order-workspace', 'lab/order/check.mjs', 'order-attempts'],
  ]) {
    await t.test(id, async () => {
      assert.equal((await cli(root, prepare)).code, 0);
      const workspace = join(root, workspacePath);
      const blank = await cli(workspace, check, '--assistance', 'none');
      assert.equal(blank.code, 2, blank.stderr);
      assert.match(blank.stdout, /without grading or answer release/);
      assert.deepEqual(await listing(join(workspace, 'artifacts', attemptsName)), []);
      await answer(join(workspace, 'predictions.json'), { skip: true });
      const checked = await cli(workspace, check, '--assistance', 'none');
      assert.ok([0, 1, 2].includes(checked.code), checked.stderr);
      const [first] = await listing(join(workspace, 'artifacts', attemptsName));
      assert.ok(first, checked.stderr);
      const submission = await json(join(workspace, 'artifacts', attemptsName, first, 'submission.json'));
      assert.equal(submission.attemptKind, 'first');
      assert.equal(submission.assistanceClass, 'assisted');
      assert.equal((await cli(workspace, check, '--fresh', '--assistance', 'none')).code, 2);
      await answer(join(workspace, 'fresh-practice.json'));
      const practice = await cli(workspace, check, '--fresh', '--assistance', 'none');
      assert.equal(practice.code, 0, practice.stderr);
      assert.match(practice.stdout, /Fresh practice saved before feedback/);
      const sessionPath = id === 'spatial' ? 'lab/session.json' : 'lab/order/session.json';
      const session = await json(join(workspace, sessionPath));
      delete session.predictionContract;
      await save(join(workspace, sessionPath), session);
      const downgrade = await cli(workspace, check, '--assistance', 'none');
      assert.equal(downgrade.code, 2);
      assert.match(downgrade.stderr, /prediction contract changed/);
    });
  }
});

test('capstone final source is an unimplemented export while author controls stay complete', async () => {
  const template = await import('../capstone/template.mjs');
  assert.throws(() => template.repair({}, 'actor', {}), /Implement the repair policy/);
  const { repair } = await import('../capstone/policy.mjs');
  const { initialState, addActor } = await import('../capstone/state.mjs');
  assert.equal(repair(addActor(initialState(), 'actor'), 'actor', { requestId: 'A', stationId: 'alpha' }).reason, 'repaired');
});
