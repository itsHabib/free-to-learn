import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate, validatePredictions, predictionCustody, preservePredictionRefusal, prepareFreshPractice, submitFreshPractice } from './predictions.mjs';
import { moduleFor } from './registry.mjs';
import { acquireCheckLock, releaseCheckLock } from './lock.mjs';
import { captureBundle, hashTree, jsonBytes, regularFile, saveJson, sha256, verifyReference, writeBundle } from './trust.mjs';

export const WORKER_TIMEOUT = 10000;
export const OUTPUT_LIMIT = 1024 * 1024;

async function submittedFiles(root, prefix = '') {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['artifacts', 'node_modules', '.git'].includes(entry.name)) continue;
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not submitted: ${path}`);
    if (entry.isDirectory()) files.push(...await submittedFiles(root, path + '/'));
    if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

async function priorAttempt(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let latest = null;
  let feedback = false;
  for (const entry of entries.filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    let submission;
    try { submission = JSON.parse(await regularFile(directory, `${entry.name}/submission.json`)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    latest ??= submission.attemptId;
    try { await regularFile(directory, `${entry.name}/feedback-started.json`); feedback = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return latest ? { attemptId: latest, feedback } : null;
}

function runnerFailure(message) {
  return { kind: 'runner-failure', healthy: false, passed: false, error: { message } };
}

function sourcePointer(source) {
  if (typeof source === 'string') return source;
  if (source && typeof source.path === 'string') return source.path + (source.anchor ? `#${source.anchor}` : '');
  return JSON.stringify(source);
}

/** Run one bounded child, preserving assertion evidence supplied by the fixture. */
export function runWorker({ worker, policy, fixtures, scenario, cwd, timeout = WORKER_TIMEOUT, outputLimit = OUTPUT_LIMIT }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
    const child = fork(worker, [policy, fixtures, ...(scenario ? [scenario] : [])], {
      cwd, env, execArgv: [], detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const chunks = [];
    let outputBytes = 0;
    let result;
    let forced;
    let messages = 0;
    const reapGroup = () => {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch { child.kill('SIGKILL'); }
    };
    const terminate = (reason) => {
      forced ??= reason;
      reapGroup();
    };
    const timer = setTimeout(() => terminate('Worker timed out.'), timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (bytes) => {
      const remaining = Math.max(0, outputLimit - outputBytes);
      chunks.push(bytes.subarray(0, remaining));
      outputBytes += bytes.length;
      if (outputBytes > outputLimit) terminate('Worker exceeded its output budget.');
    });
    child.on('message', (message) => {
      messages += 1;
      if (messages !== 1 || message?.type !== 'core-result') return terminate('Worker sent an invalid result.');
      result = message.result;
    });
    child.once('error', (error) => { forced = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      // Successful workers can leave unref'ed descendants in their group too.
      // A descendant that deliberately creates a new session is outside this
      // local teaching runner's boundary; this is not an OS sandbox.
      reapGroup();
      if (forced || code !== 0 || !result) result = runnerFailure(forced ?? `Worker exited without a complete result (${code ?? signal}).`);
      if (!['pass', 'behavior-failure', 'runner-failure'].includes(result.kind)) result = runnerFailure('Worker returned an invalid result.');
      resolve({ ...result, exit: { code, signal }, output: Buffer.concat(chunks).toString('utf8'), outputBytes });
    });
  });
}

export async function executeCaptured({ executionRoot, bundle, captured, module, timeout, outputLimit }) {
  const trusted = join(executionRoot, 'trusted');
  const candidate = join(executionRoot, 'candidate');
  await mkdir(executionRoot, { recursive: true, mode: 0o700 });
  await writeBundle(trusted, bundle);
  await writeBundle(candidate, captured);
  const hashes = await hashTree(executionRoot);
  let result = await runWorker({
    worker: join(trusted, 'lab/core/worker.mjs'), policy: join(candidate, module.policy),
    fixtures: join(trusted, module.fixtures), scenario: module.scenario && join(candidate, module.scenario), cwd: candidate, timeout, outputLimit,
  });
  let afterHashes;
  try {
    afterHashes = await hashTree(executionRoot);
    if (JSON.stringify(hashes) !== JSON.stringify(afterHashes)) result = { ...result, ...runnerFailure('Execution files changed while running.') };
  } catch (error) {
    result = { ...result, ...runnerFailure(`Execution changed while running: ${error.message}`) };
  }
  return { ...result, hashes, afterHashes };
}

function validateCapture({ captured, session, owner, module, manifest }) {
  const required = [module.policy, module.prompt, module.guide, 'response.md', 'lab/core/help.json', 'lab/core/session.json'];
  if (module.scenario) required.push(module.scenario, module.client);
  for (const path of required) {
    if (!Object.hasOwn(captured, path)) throw new Error(`Missing submitted file: ${path}`);
  }
  if (sha256(captured['lab/core/session.json']) !== owner.sessionHash || JSON.stringify(JSON.parse(captured['lab/core/session.json'])) !== JSON.stringify(session)) throw new Error('Prepared session changed during submission.');
  if (sha256(captured[module.prompt]) !== manifest.files[module.prompt]) throw new Error('Prompt changed; restore its original wording before submitting.');
  if (sha256(captured[module.guide]) !== owner.guideHash) throw new Error('Learner guide changed; restore the prepared guide before submitting.');
  if (module.client && sha256(captured[module.client]) !== manifest.files[module.client]) throw new Error('Supplied HTTP client changed; restore it before submission. Put your assertions in scenario.mjs.');
  const help = JSON.parse(captured['lab/core/help.json']);
  if (!help || !Array.isArray(help.consulted) || help.consulted.some((item) => typeof item !== 'string') || (help.note !== undefined && typeof help.note !== 'string')) throw new Error('Help metadata must contain a consulted list of strings and an optional note.');
  return help;
}

export async function checkSubmission({ workspace, session, assistance, timeout, outputLimit, afterCaptureRead, fresh = false }) {
  if (typeof assistance !== 'string' || !assistance.trim() || assistance.length > 10000) throw new Error('Declare the assistance used, or "none".');
  workspace = await realpath(workspace);
  if (session.schema !== 'courier-core-session-v1' || !/^[a-f0-9-]{36}$/.test(session.sessionId)) throw new Error('Invalid prepared session.');
  const root = await realpath(session.referenceRoot);
  const module = moduleFor(session.module);
  const { bundle, manifest, manifestHash } = await verifyReference(root, session.referenceManifest);
  const ownerSession = join(root, 'artifacts/core/sessions', session.sessionId);
  const owner = JSON.parse(await regularFile(ownerSession, 'session.json'));
  if (owner.workspace !== workspace || owner.referenceRoot !== root || owner.referenceManifest !== manifestHash || owner.module !== module.id) throw new Error('Prepared session identity changed.');
  const lease = await acquireCheckLock({ ownerSession, root, sessionId: session.sessionId });
  try {
    const paths = await submittedFiles(workspace);
    const { captured, hashes } = await captureBundle(workspace, paths, afterCaptureRead);
    if (JSON.stringify(paths) !== JSON.stringify(await submittedFiles(workspace))) throw new Error('Submission inventory changed during capture. Save all files and retry.');
    const help = validateCapture({ captured, session, owner, module, manifest });
    let predictions;
    if (fresh && session.predictionContract !== PREDICTION_CONTRACT) throw new Error('Fresh practice requires a newly prepared workspace.');
    if (session.predictionContract === PREDICTION_CONTRACT) {
      const attempts = join(root, 'artifacts/core/attempts', session.sessionId);
      const refusals = join(root, 'artifacts/core/refusals', session.sessionId);
      if (fresh) return await submitFreshPractice({ workspace, root, module: module.id, captured, assistance, attempts, directory: join(root, 'artifacts/core/practice', session.sessionId), refusals, help });
      const feedback = (await loadPredictionFeedback(root, module.id)).postCheckFeedback();
      try { predictions = validatePredictions(captured['predictions.json'], predictionTemplate(feedback, module.id)); }
      catch (error) { return await preservePredictionRefusal({ directory: refusals, captured, assistance, module: module.id, stage: 'prediction', error }); }
    }
    return await assessSubmission({ root, workspace, session, owner, module, bundle, manifestHash, captured, hashes, help, predictions, assistance, timeout, outputLimit, checkId: lease.token });
  } finally {
    await releaseCheckLock(lease);
  }
}

async function assessSubmission({ root, workspace, session, owner, module, bundle, manifestHash, captured, hashes, help, predictions, assistance, timeout, outputLimit, checkId }) {
  const attempts = join(root, 'artifacts/core/attempts', session.sessionId);
  const previous = await priorAttempt(attempts);
  const attemptId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  const destination = join(attempts, attemptId);
  const executionRoot = join(root, 'artifacts/core/executions', session.sessionId, attemptId);
  const custody = {
    ...(predictions ? predictionCustody(predictions, assistance, Boolean(previous?.feedback), help) : {}),
    assistance, help, helpHash: hashes['lab/core/help.json'],
    attemptKind: previous ? 'revision' : 'first', previousAttemptId: previous?.attemptId ?? null,
    priorFeedbackExposure: Boolean(previous?.feedback),
  };
  let evaluationEvidence;
  if (module.id === 'evaluation' && bundle['evaluation/custody.mjs']) {
    const { getEvidenceLinks } = await import(pathToFileURL(join(root, 'evaluation/custody.mjs')));
    evaluationEvidence = await getEvidenceLinks({ workspace, session });
  }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await writeBundle(join(destination, 'submitted'), captured);
  await saveJson(join(destination, 'assistance.json'), custody);
  await saveJson(join(destination, 'submission.json'), {
    schema: 'courier-core-submission-v1', module: module.id, sessionId: session.sessionId,
    attemptId, checkId, submittedAt: new Date().toISOString(), workspace, ...custody,
    ...(predictions ? { predictions: predictions.document } : {}),
    prompt: owner.prompt, referenceRoot: root, referenceManifest: manifestHash,
    hashes, assistanceHash: sha256(jsonBytes(custody)), ownerExecutionRoot: executionRoot,
    ...(evaluationEvidence === undefined ? {} : { evaluationEvidence }),
    provenance: { policy: `captured ${module.policy}`, fixtures: `sealed ${module.fixtures}`, ...(module.scenario ? {scenario: `captured ${module.scenario}`} : {}), runtime: 'sealed reference bundle in owner execution tree' },
    limits: 'Local reproducible custody, not an OS sandbox against the machine owner. Written responses and self-reported assistance are preserved, not graded.',
  });
  await saveJson(join(destination, 'feedback-started.json'), { startedAt: new Date().toISOString(), note: 'Later submissions are revisions with prior checker feedback exposure, including incomplete runs.' });
  console.log(`Saved attempt: ${destination}`);
  let result;
  try { result = await executeCaptured({ executionRoot, bundle, captured, module, timeout, outputLimit }); }
  catch (error) { result = runnerFailure(error.message); }
  await writeFile(join(destination, 'output.txt'), result.output ?? '', { flag: 'wx', mode: 0o600 });
  await saveJson(join(destination, 'result.json'), result);
  if (bundle[`${module.id}/feedback.mjs`]) {
    const { postCheckFeedback } = await import(pathToFileURL(join(root, module.id, 'feedback.mjs')));
    const feedback = postCheckFeedback();
    if (predictions) await prepareFreshPractice(workspace, feedback, module.id);
    await saveJson(join(destination, 'prediction-feedback.json'), { ...feedback, ...(predictions ? { submittedPredictions: predictions.document } : {}), submittedResponse: captured['response.md'].toString('utf8'), note: 'Compare these answers with the captured response. Written reasoning is not automatically graded; append corrections and retain the original.' });
    console.log(`Prediction answers and fresh questions: ${join(destination, 'prediction-feedback.json')}`);
  }
  console.log(`Criterion summary: ${result.kind === 'pass' ? 'PASS' : result.kind === 'behavior-failure' ? 'FAIL' : 'RUNNER FAILURE'}`);
  for (const criterion of result.criteria ?? []) {
    console.log(`  ${criterion.passed ? 'PASS' : 'FAIL'} ${criterion.name}`);
    if (criterion.error) console.log(`    ${criterion.error.message ?? 'See saved criterion evidence.'}`);
    if (criterion.error?.source) console.log(`    Source: ${sourcePointer(criterion.error.source)}`);
  }
  if (result.error) console.log(`  ${result.error.message}`);
  console.log(`Evidence: ${join(destination, 'result.json')}\nWritten response and help are saved, not graded. Owner runtime and fixtures remain outside the learner workspace.`);
  return { ...result, destination, attemptId };
}
