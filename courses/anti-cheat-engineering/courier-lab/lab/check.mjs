// Self-contained learner bootstrap. Authenticate the owner bundle before imports.
import { mkdir, readFile, writeFile, lstat, realpath, rename, readdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function referenceFile(root, relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || relative.includes('\\') || /[\u0000-\u001f]/.test(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid reference path.');
  const parts = relative.split('/');
  let info;
  for (let index = 1; index <= parts.length; index += 1) {
    info = await lstat(join(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink()) throw new Error(`Reference symlink refused: ${relative}`);
  }
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error(`Invalid reference file: ${relative}`);
  return readFile(join(root, relative));
}

async function authenticateReference(root, expectedManifest) {
  const bytes = await referenceFile(root, 'lab/order/reference.json');
  if (expectedManifest && hash(bytes) !== expectedManifest) throw new Error('Reference manifest changed since preparation.');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 'courier-order-reference-v1' || !manifest.files || !Object.keys(manifest.files).length) throw new Error('Invalid reference manifest.');
  for (const required of ['lab/trust.mjs', 'lab/check.mjs', 'lab/spatial-reporter.mjs', 'lab/prompt.json', 'lab/reference.json']) {
    if (!Object.hasOwn(manifest.files, required)) throw new Error(`Missing trusted file: ${required}`);
  }
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (!/^[a-f0-9]{64}$/.test(expected) || hash(await referenceFile(root, path)) !== expected) throw new Error(`Trusted reference changed: ${path}`);
  }
}

// OWNER_CHECK_BEGIN
async function previousAttempt(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let previous = null;
  let knownFeedback = false;
  let unknownFeedback = false;
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    let metadata;
    try { metadata = JSON.parse(await readFile(join(directory, entry.name, 'submission.json'))); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    previous ??= metadata.attemptId ?? entry.name;
    try { await readFile(join(directory, entry.name, 'feedback-started.json')); knownFeedback = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; unknownFeedback = true; }
  }
  return previous ? { attemptId: previous, feedback: knownFeedback ? true : unknownFeedback ? null : false } : null;
}

function classifyRun(code, signal, events, forced) {
  if (forced || signal) return { kind: 'runner-failure', healthy: false, passed: false, error: forced ?? `Worker terminated by ${signal}.` };
  const summary = events.findLast((event) => event.type === 'test:summary' && event.file === null);
  const cases = events.filter((event) => ['test:pass', 'test:fail'].includes(event.type) && event.details?.type !== 'suite');
  const failures = cases.filter((event) => event.type === 'test:fail');
  const counts = summary?.counts;
  const complete = counts && counts.tests === cases.length && counts.failed === failures.length && counts.cancelled === 0 && counts.passed > 0;
  if (complete && code === 0 && summary.success && failures.length === 0) return { kind: 'pass', healthy: true, passed: true };
  const behavior = failures.every((event) => {
    const error = event.details?.error;
    if (error?.failureType !== 'testCodeFailure') return false;
    const cause = error.cause;
    if (cause?.name === 'AssertionError' && cause.code === 'ERR_ASSERTION') return true;
    return cause?.name === 'InvariantViolation' && cause.code === 'REMOTE_PICKUP';
  });
  if (counts && counts.tests === cases.length && counts.failed === failures.length && counts.cancelled === 0 && code === 1 && !summary.success && failures.length > 0 && behavior) return { kind: 'behavior-failure', healthy: true, passed: false };
  return { kind: 'runner-failure', healthy: false, passed: false, error: 'The test process did not complete a healthy assertion result. See structured-events.jsonl and output.txt for per-test diagnostics.' };
}

async function runSpatialProcess({ execution, reportPath, timeoutMs, outputLimit }) {
  return new Promise((done) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
    const reporter = join(dirname(fileURLToPath(import.meta.url)), 'spatial-reporter.mjs');
    const args = ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout', `--test-reporter=${reporter}`, `--test-reporter-destination=${reportPath}`, 'tests/proximity.test.mjs'];
    const child = spawn(process.execPath, args, { cwd: execution, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let length = 0;
    let forced;
    const terminate = (reason) => {
      forced ??= reason;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => terminate('Spatial worker timed out.'), timeoutMs);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
      const kept = chunk.subarray(0, Math.max(0, outputLimit - length));
      chunks.push(kept);
      process.stdout.write(kept);
      length += chunk.length;
      if (length > outputLimit) terminate('Spatial worker exceeded its output budget.');
    });
    child.once('error', (error) => { forced = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      done({ code, signal, forced, output, outputBytes: length });
    });
  });
}

export async function executeSpatialTests({ execution, reportPath, timeoutMs = 30000, outputLimit = 1024 * 1024 }) {
  const temporary = reportPath ? null : await mkdtemp(join(tmpdir(), 'ivy-spatial-report-'));
  const destination = resolve(reportPath ?? join(temporary, 'structured-events.jsonl'));
  if (destination.startsWith(resolve(execution) + '/')) throw new Error('Structured evidence must stay outside the execution tree.');
  try {
    const result = await runSpatialProcess({ execution, reportPath: destination, timeoutMs, outputLimit });
    let events = [];
    let forced = result.forced;
    try {
      const info = await lstat(destination);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error('Invalid structured evidence file.');
      const bytes = await readFile(destination);
      if (bytes.length > 1024 * 1024) throw new Error('Structured evidence exceeded its byte budget.');
      events = bytes.toString('utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      forced ??= `Structured evidence unavailable: ${error.message}`;
    }
    const { forced: _ignored, ...evidence } = result;
    return { ...evidence, ...classifyRun(result.code, result.signal, events, forced), testEvents: events, structuredReportPath: temporary ? null : destination };
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

function validatePrompt(bytes, originalBytes, session) {
  const original = JSON.parse(originalBytes);
  let submitted;
  try { submitted = JSON.parse(bytes); } catch { throw new Error('Prompt changed; restore its original wording before submitting.'); }
  if (session.exercise !== original.id || submitted.id !== original.id || submitted.version !== original.version || hash(bytes) !== hash(originalBytes)) throw new Error('Prompt changed; restore its original id, version and wording before submitting.');
  if (session.prompt && (session.prompt.id !== original.id || session.prompt.version !== original.version || session.prompt.sha256 !== hash(originalBytes))) throw new Error('Prepared prompt identity changed. Preserve the original session and prompt.');
  return { id: original.id, version: original.version, sha256: hash(originalBytes) };
}

/** Owner-side submission path, imported only from authenticated reference bytes. */
export async function checkSubmission({ workspace, session, assistance, fresh = false }) {
  const { captureBundle, hashTree, saveJson, verifyReference, writeBundle } = await import('./trust.mjs');
  const { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate, validatePredictions, predictionCustody, preservePredictionRefusal, prepareFreshPractice, submitFreshPractice } = await import('./core/predictions.mjs');
  const referenceRoot = await realpath(session.referenceRoot ?? resolve(workspace, '../..'));
  const trusted = await verifyReference(referenceRoot, session.referenceManifest);
  if (trusted.bundle['lab/core/predictions.mjs'] && session.predictionContract !== PREDICTION_CONTRACT) throw new Error('Prepared prediction contract changed. Restore the original session.');
  const reference = JSON.parse(trusted.bundle['lab/reference.json']);
  if (reference.sha256 !== session.reference) throw new Error('This spatial workspace belongs to a different reference. Existing attempts are preserved.');
  const originalPrompt = trusted.bundle['lab/prompt.json'];
  const prompt = validatePrompt(await readFile(join(workspace, 'lab/prompt.json')), originalPrompt, session);
  const previous = await previousAttempt(join(workspace, 'artifacts/attempts'));
  const attemptId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  let destination = join(workspace, session.predictionContract === PREDICTION_CONTRACT ? 'artifacts/spatial-captures' : 'artifacts/attempts', attemptId);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const paths = ['defense.mjs', 'lab/response.md', 'lab/prompt.json'];
  if (session.predictionContract === PREDICTION_CONTRACT) {
    const file = fresh ? 'fresh-practice.json' : 'predictions.json';
    try { await readFile(join(workspace, file)); paths.push(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const { captured, hashes } = await captureBundle(workspace, paths, join(destination, 'submitted'));
  validatePrompt(captured['lab/prompt.json'], originalPrompt, session);
  let predictions;
  if (fresh && session.predictionContract !== PREDICTION_CONTRACT) throw new Error('Fresh practice requires a newly prepared workspace.');
  if (session.predictionContract === PREDICTION_CONTRACT) {
    const attempts = join(workspace, 'artifacts/attempts');
    const refusals = join(workspace, 'artifacts/spatial-refusals');
    if (fresh) return submitFreshPractice({ workspace, root: referenceRoot, module: 'spatial', captured, assistance, attempts, directory: join(workspace, 'artifacts/spatial-practice'), refusals });
    const feedback = (await loadPredictionFeedback(referenceRoot, 'spatial')).postCheckFeedback();
    try { predictions = validatePredictions(captured['predictions.json'], predictionTemplate(feedback, 'spatial')); }
    catch (error) { return preservePredictionRefusal({ directory: refusals, captured, assistance, module: 'spatial', stage: 'prediction', error }); }
    await mkdir(attempts, { recursive: true });
    const committed = join(attempts, attemptId);
    await rename(destination, committed);
    destination = committed;
  }
  await writeBundle(destination, { 'defense.mjs': captured['defense.mjs'], 'response.md': captured['lab/response.md'], 'prompt.json': captured['lab/prompt.json'] });
  const execution = join(referenceRoot, 'artifacts/spatial-executions', attemptId);
  await saveJson(join(destination, 'submission.json'), {
    schema: 'courier-spatial-submission-v2',
    reference: session.reference, referenceRoot, referenceManifest: trusted.manifestHash, exercise: session.exercise, prompt,
    attemptId, submittedAt: new Date().toISOString(), assistance, sha256: hashes['defense.mjs'], hashes,
    ...(predictions ? { predictions: predictions.document, ...predictionCustody(predictions, assistance, Boolean(previous?.feedback)) } : {}),
    attemptKind: previous ? 'revision' : 'first', previousAttemptId: previous?.attemptId ?? null,
    priorFeedbackExposure: previous ? previous.feedback : false,
    feedbackProvenance: previous?.feedback === null ? 'Unknown for legacy attempts without a feedback marker.' : 'Recorded feedback markers are separate from self-reported assistance.',
    ownerExecutionRoot: execution, command: 'node --test tests/proximity.test.mjs',
  });
  await mkdir(execution, { recursive: true, mode: 0o700 });
  await writeBundle(execution, { ...trusted.bundle, 'defense.mjs': captured['defense.mjs'] });
  const before = await hashTree(execution);
  await saveJson(join(destination, 'execution-hashes.json'), before);
  await saveJson(join(destination, 'feedback-started.json'), { startedAt: new Date().toISOString(), note: 'Later attempts have prior checker feedback exposure, including interrupted runs.' });
  console.log(`Saved attempt: ${destination}`);
  const result = await executeSpatialTests({ execution, reportPath: join(destination, 'structured-events.jsonl') });
  if (JSON.stringify(before) !== JSON.stringify(await hashTree(execution))) Object.assign(result, { kind: 'runner-failure', healthy: false, passed: false, error: 'Execution files changed while running.' });
  await saveJson(join(destination, 'result.json'), result);
  if (trusted.bundle['lab/feedback.mjs']) {
    const { postCheckFeedback } = await import(pathToFileURL(join(referenceRoot, 'lab/feedback.mjs')));
    const feedback = postCheckFeedback();
    if (predictions) await prepareFreshPractice(workspace, feedback, 'spatial');
    await saveJson(join(destination, 'prediction-feedback.json'), { ...feedback, ...(predictions ? { submittedPredictions: predictions.document } : {}), submittedResponse: captured['lab/response.md'].toString('utf8') });
    console.log(`Compare your captured response with answers and fresh practice: ${join(destination, 'prediction-feedback.json')}`);
  }
  await writeFile(join(destination, 'output.txt'), result.output, { flag: 'wx' });
  const failed = [...result.output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
  const label = result.kind === 'pass' ? 'PASS' : result.kind === 'behavior-failure' ? 'FAIL' : 'RUNNER FAILURE';
  console.log(`Criterion summary: ${label} — legitimate delivery; denied remote pickup; inclusive x/y boundaries; circular diagonal; cooldown; no duplicate score.`);
  if (result.kind === 'runner-failure') {
    console.log(`${result.error} This is not a behavioral result for the submitted guard.`);
    return result;
  }
  if (failed.length) console.log(`First failed criterion: ${failed[0]}. See the preserved actual/expected assertion above.`);
  console.log(`\nPost-submission assistance — spatial boundary reasons (feedback-02, feedback-03):
1. 250 mm east, 0 north: 250² = 62,500 mm², so the inclusive boundary accepts equality.
2. 251 mm east, 0 north: 251² = 63,001 mm², outside the radius; deny without changing cargo or score.
3. 150 mm east, 200 mm north: 150² + 200² = 62,500 mm², exactly on the legal circular boundary.
4. 200 mm east, 200 mm north: 200² + 200² = 80,000 mm², outside the circle even though each axis is below 250.
Explanation/transfer rubric — assistance, ungraded: identify the server-owned position/cargo/score; cite the request, measured state and responsible rule; distinguish prevention from advisory findings; explain a fresh repair-station rule using server-owned range, inventory and one-time reward; name a legal-protocol modified client this guard cannot identify. A saved paragraph is not a scored explanation.`);
  return result;
}
// OWNER_CHECK_END

async function main() {
  const workspace = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const args = process.argv.slice(2);
  const fresh = args[0] === '--fresh';
  if (fresh) args.shift();
  if (args.length !== 2 || args[0] !== '--assistance' || !args[1]?.trim()) throw new Error('Record help used: npm run lab:check -- --assistance "none" (or describe hints, AI or worked examples).');
  let session;
  try { session = JSON.parse(await readFile(join(workspace, 'lab/session.json'), 'utf8')); }
  catch { throw new Error('Run lab:prepare from the reference, then change into its printed workspace. Reference runs are not learner submissions.'); }
  if (session.prepared !== true) throw new Error('Not a prepared learner workspace.');
  const referenceRoot = await realpath(session.referenceRoot ?? resolve(workspace, '../..'));
  await authenticateReference(referenceRoot, session.referenceManifest);
  const owner = await import(pathToFileURL(join(referenceRoot, 'lab/check.mjs')));
  const result = await owner.checkSubmission({ workspace, session, assistance: args[1], fresh });
  process.exitCode = ['runner-failure', 'submission-refused'].includes(result.kind) ? 2 : Number(!result.passed);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); }
  catch (error) { console.error(`Submission refused: ${error.message}`); process.exitCode = 2; }
}
