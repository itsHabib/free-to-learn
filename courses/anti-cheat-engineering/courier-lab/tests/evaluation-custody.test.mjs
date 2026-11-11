import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkSubmission } from '../lab/core/grade.mjs';
import { prepareWorkspace } from '../lab/core/prepare.mjs';
import { sealReference } from '../lab/core/seal.mjs';
import { readBundle, referenceFiles, sha256, writeBundle } from '../lab/core/trust.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const settings = { threshold: 3, windowTicks: 20, minDistanceMm: 500 };
const secondSettings = { threshold: 2, windowTicks: 8, minDistanceMm: 500 };

async function prepared(t, id = 'evaluation') {
  const root = await mkdtemp(join(tmpdir(), 'ivy-evaluation-custody-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeBundle(root, await readBundle(project, await referenceFiles(project)));
  await sealReference(root);
  const preparation = await prepareWorkspace({ root, id });
  const { workspace, referenceRoot } = preparation;
  const session = JSON.parse(await readFile(join(workspace, 'lab/core/session.json')));
  const predictions = JSON.parse(await readFile(join(workspace, 'predictions.json')));
  predictions.predictions.forEach((item) => { item.answer = 'Captured author calibration prediction.'; });
  await writeFile(join(workspace, 'predictions.json'), JSON.stringify(predictions));
  const api = await import(pathToFileURL(join(referenceRoot, 'evaluation/custody.mjs')));
  if (id === 'evaluation') await writeFile(join(workspace, 'evaluation/policy.mjs'), await readFile(join(root, 'evaluation/policy.mjs')));
  return { ...preparation, sourceRoot: root, session, api };
}

async function bytesFor(files) {
  return Promise.all(files.map(async ({ path, sha256: expected }) => {
    const bytes = await readFile(path);
    assert.equal(sha256(bytes), expected);
    return { path, bytes };
  }));
}

test('genuine preparation records every exploration, frozen plan and exposed evaluation with exact hashes', async (t) => {
  const { api, workspace, session } = await prepared(t);
  const one = await api.explore({ workspace, settings });
  const two = await api.explore({ workspace, settings: secondSettings });
  const frozen = await api.plan({ workspace, settings });
  assert.equal(one.report.split, 'exploration');
  assert.equal(Object.hasOwn(one.report, 'evaluation'), false);
  assert.equal(frozen.record.attemptKind, 'first');
  assert.equal(frozen.record.priorEvaluationExposure, false);
  const before = await bytesFor((await api.getEvidenceLinks({ workspace, session })).events.flatMap((event) => event.files));
  await writeFile(join(workspace, 'evaluation/policy.mjs'), 'throw new Error("new source must not run the old plan");');
  const result = await api.run({ workspace, planId: frozen.planId });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.report.plan, frozen.plan);
  assert.ok(result.report.evaluation);
  const links = await api.getEvidenceLinks({ workspace, session });
  assert.deepEqual(links.events.map((event) => event.kind), ['explore', 'explore', 'plan', 'run']);
  assert.deepEqual(links.events.map((event) => event.eventId), [one.eventId, two.eventId, frozen.eventId, result.eventId]);
  assert.equal(links.latestPlanId, frozen.planId);
  assert.equal(links.evaluationExposed, true);
  for (const event of links.events) {
    assert.equal(event.sessionId, session.sessionId);
    assert.equal(event.referenceManifest, session.referenceManifest);
    assert.match(event.corpusSha256, /^[a-f0-9]{64}$/);
    await bytesFor(event.files);
  }
  for (const item of before) assert.deepEqual(await readFile(item.path), item.bytes, item.path);
});

test('every subsequent plan requires a reason, preserves the first plan and declares prior exposure', async (t) => {
  const { api, workspace } = await prepared(t);
  const first = await api.plan({ workspace, settings });
  await assert.rejects(api.plan({ workspace, settings }), /declare --revision/);
  await writeFile(join(workspace, 'evaluation/policy.mjs'), (await readFile(join(workspace, 'evaluation/policy.mjs'), 'utf8')) + '\n// a revised candidate\n');
  await assert.rejects(api.plan({ workspace, settings: secondSettings }), /declare --revision/);
  await api.run({ workspace, planId: first.planId });
  const revision = await api.plan({ workspace, settings: secondSettings, revisionReason: 'Shorter window after the preserved evaluation result.' });
  assert.equal(revision.record.attemptKind, 'revision');
  assert.equal(revision.record.previousPlanId, first.planId);
  assert.equal(revision.record.priorEvaluationExposure, true);
  assert.equal(revision.record.priorRunIds.length, 1);
  assert.match(revision.record.revisionReason, /Shorter window/);
  assert.notEqual(revision.plan.sourceSha256, first.plan.sourceSha256);
  assert.deepEqual(JSON.parse(await readFile(first.path)), first.plan);
  await assert.rejects(api.run({ workspace, planId: first.planId }), /already started/);
});

test('failed evaluations keep source, exposure and failure evidence and cannot erase the first run', async (t) => {
  const { api, workspace } = await prepared(t);
  await writeFile(join(workspace, 'evaluation/policy.mjs'), 'export function evaluate() { throw new Error("learner failure"); }');
  const frozen = await api.plan({ workspace, settings });
  let failed;
  await assert.rejects(api.run({ workspace, planId: frozen.planId }), (error) => {
    failed = error.evidence;
    return /learner failure/.test(error.message);
  });
  assert.equal(failed.status, 'failed');
  const failure = JSON.parse(await readFile(failed.path));
  assert.equal(failure.message, 'learner failure');
  const links = await api.getEvidenceLinks({ workspace });
  assert.equal(links.evaluationExposed, true);
  assert.equal(links.events.at(-1).status, 'failed');
  assert.ok(links.events.at(-1).files.some(({ path }) => path.endsWith('/exposure.json')));
  await assert.rejects(api.run({ workspace, planId: frozen.planId }), /already started/);
  const revision = await api.plan({ workspace, settings, revisionReason: 'Repair the exception.' });
  assert.equal(revision.record.priorEvaluationExposure, true);
  assert.equal(revision.record.priorRunIds[0], failed.eventId);
});

test('plan IDs are session-bound identifiers and never arbitrary output paths', async (t) => {
  const first = await prepared(t);
  const second = await prepareWorkspace({ root: first.sourceRoot, id: 'evaluation', name: 'second' });
  await writeFile(join(second.workspace, 'evaluation/policy.mjs'), await readFile(join(first.workspace, 'evaluation/policy.mjs')));
  const frozen = await first.api.plan({ workspace: first.workspace, settings });
  await assert.rejects(first.api.run({ workspace: second.workspace, planId: frozen.planId }), /does not belong/);
  await assert.rejects(first.api.run({ workspace: first.workspace, planId: frozen.directory }), /not a filesystem path/);
  await assert.rejects(first.api.run({ workspace: first.workspace, planId: '../escape' }), /not a filesystem path/);
  await assert.rejects(first.api.getEvidenceLinks({ workspace: first.workspace, session: { ...first.session, sessionId: second.sessionId } }), /session changed/);
  const wrong = await prepareWorkspace({ root: first.sourceRoot, id: 'retention' });
  await assert.rejects(first.api.plan({ workspace: wrong.workspace, settings }), /prepared evaluation workspace/);
});

test('symlinked policy and owner history directories are rejected without writing through them', async (t) => {
  const { api, workspace, referenceRoot, sessionId } = await prepared(t);
  const policy = join(workspace, 'evaluation/policy.mjs');
  const original = await readFile(policy);
  const target = join(workspace, 'outside.mjs');
  await writeFile(target, original);
  await rm(policy);
  await symlink(target, policy);
  await assert.rejects(api.plan({ workspace, settings }), /Symlinks are not accepted/);
  await rm(policy);
  await writeFile(policy, original);
  const history = join(referenceRoot, 'artifacts/core/sessions', sessionId, 'evaluation');
  const targetDirectory = await mkdtemp(join(tmpdir(), 'ivy-custody-no-write-'));
  t.after(() => rm(targetDirectory, { recursive: true, force: true }));
  await symlink(targetDirectory, history);
  await assert.rejects(api.plan({ workspace, settings }), /regular directory/);
  assert.deepEqual(await readdir(targetDirectory), []);
});

test('corrupt or symlinked frozen plan files are refused before any evaluation exposure', async (t) => {
  const { api, workspace } = await prepared(t);
  const frozen = await api.plan({ workspace, settings });
  const policy = join(frozen.directory, 'source.mjs');
  await writeFile(policy, 'export function evaluate() { return {}; }');
  await assert.rejects(api.run({ workspace, planId: frozen.planId }), /evidence changed/);
  assert.equal((await api.getEvidenceLinks({ workspace })).evaluationExposed, false);
  const target = join(workspace, 'evaluation/policy.mjs');
  await rm(policy);
  await symlink(target, policy);
  await assert.rejects(api.run({ workspace, planId: frozen.planId }), /Symlinks are not accepted/);
});

test('evaluation evidence is read-only with respect to older core submissions and learner files', async (t) => {
  const { api, workspace, session } = await prepared(t);
  const first = await checkSubmission({ workspace, session, assistance: 'author calibration' });
  const submissionPath = join(first.destination, 'submission.json');
  const oldSubmission = await readFile(submissionPath);
  const responsePath = join(workspace, 'response.md');
  const oldResponse = await readFile(responsePath);
  await api.explore({ workspace, settings });
  const frozen = await api.plan({ workspace, settings });
  await api.run({ workspace, planId: frozen.planId });
  const links = await api.getEvidenceLinks({ workspace, session });
  assert.equal(links.events.length, 3);
  assert.deepEqual(await readFile(submissionPath), oldSubmission);
  assert.deepEqual(await readFile(responsePath), oldResponse);
});

test('concurrent plans cannot both become a first evaluation plan', async (t) => {
  const { api, workspace } = await prepared(t);
  const results = await Promise.allSettled([api.plan({ workspace, settings }), api.plan({ workspace, settings })]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /already running|declare --revision|metadata is incomplete/);
  const links = await api.getEvidenceLinks({ workspace });
  assert.equal(links.events.length, 1);
  assert.equal(links.events[0].attemptKind, 'first');
});


// Fable R1: interrupted creation must preserve history without bricking checks.
test('missing or partial event records stay visible while plans and submissions continue',async t=>{
 const {api,workspace,session,referenceRoot,sessionId}=await prepared(t);
 await api.explore({workspace,settings});
 const first=await checkSubmission({workspace,session,assistance:'recovery calibration'});
 const firstBytes=await readFile(join(first.destination,'submission.json'));
 const base=join(referenceRoot,'artifacts/core/sessions',sessionId,'evaluation');
 const empty=join(base,'000002-11111111-1111-4111-8111-111111111111');
 const partial=join(base,'000003-22222222-2222-4222-8222-222222222222');
 await mkdir(empty);await mkdir(partial);
 const partialBytes='{"schema":';await writeFile(join(partial,'record.json'),partialBytes);
 let links=await api.getEvidenceLinks({workspace,session});
 assert.deepEqual(links.events.slice(1).map(event=>event.status),['interrupted','interrupted']);
 assert.deepEqual(links.events.slice(1).map(event=>event.reason),['missing-record','incomplete-record']);
 assert.equal(links.latestPlanId,null);
 const exploration=await api.explore({workspace,settings});
 assert.match(exploration.eventId,/^000004-/);
 const plan=await api.plan({workspace,settings});
 await api.run({workspace,planId:plan.planId});
 const second=await checkSubmission({workspace,session,assistance:'after interrupted event'});
 assert.equal(second.kind,'pass');
 const saved=JSON.parse(await readFile(join(second.destination,'submission.json')));
 assert.equal(saved.evaluationEvidence.events.length,6);
 assert.equal(saved.evaluationEvidence.events.filter(event=>event.kind==='interrupted').length,2);
 assert.equal(saved.evaluationEvidence.latestPlanId,plan.planId);
 assert.deepEqual(await readFile(join(first.destination,'submission.json')),firstBytes);
 assert.deepEqual(await readdir(empty),[]);
 assert.equal(await readFile(join(partial,'record.json'),'utf8'),partialBytes);
});
