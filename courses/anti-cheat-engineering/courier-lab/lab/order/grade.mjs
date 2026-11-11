import { pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureBundle, hashTree, saveJson, sha256, verifyReference, writeBundle } from '../trust.mjs';
import { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate, validatePredictions, predictionCustody, preservePredictionRefusal, prepareFreshPractice, submitFreshPractice } from '../core/predictions.mjs';
import { CORRECT_VARIANTS, WRONG_VARIANTS, variantFiles } from '../../author/order/variants.mjs';

export const SUBMITTED_FILES = ['admission.mjs', 'learner-scenario.mjs', 'response.md', 'lab/order/prompt.json', 'lab/order/help.json', 'lab/order/seeds.json', 'lab/order/session.json'];

async function previousAttempt(directory) {
  let entries;
  try { entries = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let latest = null;
  let priorFeedbackExposure = false;
  for (const name of entries.sort().reverse()) {
    try {
      const submission = JSON.parse(await readFile(join(directory, name, 'submission.json'), 'utf8'));
      latest ??= submission.attemptId;
      try { await readFile(join(directory, name, 'feedback-started.json')); priorFeedbackExposure = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return latest ? { attemptId: latest, feedbackRecorded: priorFeedbackExposure } : null;
}

function runWorker(root, mode, seed, timeout = 25000) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = fork(join(root, 'author/order/worker.mjs'), [mode, String(seed)], { cwd: root, env, detached: true, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let output = '';
    let result;
    let forced;
    function terminate(reason) {
      forced = reason;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
    const timer = setTimeout(() => terminate('Worker timed out.'), timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (bytes) => {
      output += bytes;
      if (Buffer.byteLength(output) > 1024 * 1024) terminate('Worker exceeded its output budget.');
    });
    child.on('message', (message) => { if (message?.type === 'result') result = message.result; });
    child.once('error', (error) => { forced = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (forced || code !== 0 || !result) result = { kind: 'runner-failure', healthy: false, error: { message: forced ?? `Worker exited without a complete result (${code ?? signal}).` } };
      resolve({ ...result, exit: { code, signal }, output: output.slice(0, 1024 * 1024) });
    });
  });
}

export async function executeVariant({ destination, executionRoot = join(destination, 'execution'), bundle, captured, mode, variant, seed, timeout }) {
  const root = join(executionRoot, mode, variant, String(seed));
  await mkdir(root, { recursive: true });
  const files = { ...bundle, ...variantFiles(variant, bundle['admission.mjs'].toString(), bundle['engine.mjs'].toString()) };
  files['learner-scenario.mjs'] = captured['learner-scenario.mjs'];
  if (mode === 'component') files['admission.mjs'] = captured['admission.mjs'];
  await writeBundle(root, files);
  const before = await hashTree(root);
  let result = await runWorker(root, mode, seed, timeout);
  const after = await hashTree(root);
  if (JSON.stringify(before) !== JSON.stringify(after)) result = { ...result, kind: 'runner-failure', healthy: false, error: { message: 'Execution files changed while running.' } };
  const evidence = { mode, variant, seed, executionRoot: root, ...result, hashes: before, afterHashes: after };
  const prefix = `${mode}-${variant}-${seed}`;
  await saveJson(join(destination, prefix + '.json'), evidence);
  await writeFile(join(destination, prefix + '.output.txt'), result.output, { flag: 'wx' });
  return evidence;
}

export function assessResults(component, scenarios, seeds = [17, 31, 99]) {
  const componentPassed = component.length === seeds.length && seeds.every((seed) => component.some((result) => result.seed === seed && result.kind === 'pass'));
  const correct = scenarios.filter((result) => CORRECT_VARIANTS.includes(result.variant));
  const wrong = scenarios.filter((result) => WRONG_VARIANTS.includes(result.variant));
  const correctPassed = correct.length === CORRECT_VARIANTS.length * seeds.length && CORRECT_VARIANTS.every((variant) => seeds.every((seed) => correct.some((result) => result.variant === variant && result.seed === seed && result.kind === 'pass')));
  const wrongDetected = wrong.length === WRONG_VARIANTS.length * seeds.length && WRONG_VARIANTS.every((variant) => seeds.every((seed) => wrong.some((result) => result.variant === variant && result.seed === seed && result.kind === 'assertion' && result.healthy)));
  return { componentPassed, scenarioPassed: correctPassed && wrongDetected, correctPassed, wrongDetected, passed: componentPassed && correctPassed && wrongDetected };
}

export async function checkSubmission({ workspace, session, assistance, fresh = false }) {
  const { bundle, manifest, manifestHash } = await verifyReference(session.referenceRoot, session.referenceManifest);
  if (bundle['lab/core/predictions.mjs'] && session.predictionContract !== PREDICTION_CONTRACT) throw new Error('Prepared prediction contract changed. Restore the original session.');
  const previous = await previousAttempt(join(workspace, 'artifacts/order-attempts'));
  const attemptId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  let destination = join(workspace, session.predictionContract === PREDICTION_CONTRACT ? 'artifacts/order-captures' : 'artifacts/order-attempts', attemptId);
  const executionRoot = join(session.referenceRoot, 'artifacts/order-executions', attemptId);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const paths = [...SUBMITTED_FILES];
  if (session.predictionContract === PREDICTION_CONTRACT) {
    const file = fresh ? 'fresh-practice.json' : 'predictions.json';
    try { await readFile(join(workspace, file)); paths.push(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const { captured, hashes } = await captureBundle(workspace, paths, join(destination, 'submitted'));
  if (JSON.stringify(JSON.parse(captured['lab/order/session.json'])) !== JSON.stringify(session)) throw new Error('Prepared session changed during submission. Retry with a stable workspace.');
  if (sha256(captured['lab/order/prompt.json']) !== manifest.files['lab/order/prompt.json']) throw new Error('Prompt changed; restore its original wording before submitting.');
  if (sha256(captured['lab/order/seeds.json']) !== manifest.files['lab/order/seeds.json']) throw new Error('Assessment seeds changed; restore the prepared seed list.');
  const help = JSON.parse(captured['lab/order/help.json']);
  let predictions;
  if (fresh && session.predictionContract !== PREDICTION_CONTRACT) throw new Error('Fresh practice requires a newly prepared workspace.');
  if (session.predictionContract === PREDICTION_CONTRACT) {
    const attempts = join(workspace, 'artifacts/order-attempts');
    const refusals = join(workspace, 'artifacts/order-refusals');
    if (fresh) return submitFreshPractice({ workspace, root: session.referenceRoot, module: 'order', captured, assistance, attempts, directory: join(workspace, 'artifacts/order-practice'), refusals, help });
    const feedback = (await loadPredictionFeedback(session.referenceRoot, 'order')).postCheckFeedback();
    try { predictions = validatePredictions(captured['predictions.json'], predictionTemplate(feedback, 'order')); }
    catch (error) { return preservePredictionRefusal({ directory: refusals, captured, assistance, module: 'order', stage: 'prediction', error }); }
    await mkdir(attempts, { recursive: true });
    const committed = join(attempts, attemptId);
    await rename(destination, committed);
    destination = committed;
  }
  const { seeds } = JSON.parse(captured['lab/order/seeds.json']);
  const prompt = JSON.parse(captured['lab/order/prompt.json']);
  const custody = {
    ...(predictions ? predictionCustody(predictions, assistance, Boolean(previous?.feedbackRecorded), help) : {}),
    assistance, help, attemptKind: previous ? 'revision' : 'first', previousAttemptId: previous?.attemptId ?? null,
    priorFeedbackExposure: Boolean(previous?.feedbackRecorded),
    note: 'Prior recorded feedback is tracked independently of the self-reported assistance declaration.',
  };
  await saveJson(join(destination, 'submitted/assistance.json'), custody);
  hashes['assistance.json'] = sha256(Buffer.from(JSON.stringify(custody, null, 2) + '\n'));
  await saveJson(join(destination, 'submission.json'), {
    schema: 'courier-order-submission-v1', attemptId, submittedAt: new Date().toISOString(), ...custody,
    ...(predictions ? { predictions: predictions.document } : {}),
    referenceRoot: session.referenceRoot, referenceManifest: manifestHash, prompt: { id: prompt.id, version: prompt.version }, seeds, hashes,
    ownerExecutionRoot: executionRoot,
    provenance: { runtime: 'sealed reference bundle', componentFixtures: 'sealed author/order/component-fixtures.mjs and clients/schedules.mjs', scenario: 'captured learner-scenario.mjs', variants: 'sealed author/order/variants.mjs; materialized only in execution copies' },
    limits: 'Local reproducible custody, not an OS sandbox against a malicious machine owner. Written predictions/explanations are preserved and ungraded.',
  });
  console.log(`Saved attempt: ${destination}`);
  await saveJson(join(destination, 'feedback-started.json'), { startedAt: new Date().toISOString(), note: 'Subsequent runs are revisions with prior checker feedback exposure, including incomplete runs.' });
  const component = [];
  const scenarios = [];
  for (const seed of seeds) {
    const result = await executeVariant({ destination, executionRoot, bundle, captured, mode: 'component', variant: 'submitted-component', seed });
    component.push(result);
    console.log(`Component seed ${seed}: ${result.kind}`);
    for (const criterion of result.criteria ?? []) console.log(`  ${criterion.passed ? 'PASS' : 'FAIL'} ${criterion.name}`);
    console.log(`  Evidence: ${join(destination, `component-submitted-component-${seed}.json`)}`);
  }
  for (const variant of [...CORRECT_VARIANTS, ...WRONG_VARIANTS]) {
    for (const seed of seeds) {
      const result = await executeVariant({ destination, executionRoot, bundle, captured, mode: 'scenario', variant, seed });
      scenarios.push(result);
      const label = WRONG_VARIANTS.includes(variant) && result.kind === 'assertion' ? 'detected by assertion' : result.kind;
      console.log(`Scenario ${variant}, seed ${seed}: ${label}`);
      console.log(`  Evidence: ${join(destination, `scenario-${variant}-${seed}.json`)}`);
    }
  }
  const verdict = assessResults(component, scenarios);
  await saveJson(join(destination, 'result.json'), { ...verdict, component: component.map(summary), scenarios: scenarios.map(summary) });
  if (bundle['lab/order/feedback.mjs']) {
    const { postCheckFeedback } = await import(pathToFileURL(join(session.referenceRoot, 'lab/order/feedback.mjs')));
    const feedback = postCheckFeedback();
    if (predictions) await prepareFreshPractice(workspace, feedback, 'order');
    await saveJson(join(destination, 'prediction-feedback.json'), { ...feedback, ...(predictions ? { submittedPredictions: predictions.document } : {}), submittedResponse: captured['response.md'].toString('utf8') });
    console.log(`Compare your captured response with answers and fresh practice: ${join(destination, 'prediction-feedback.json')}`);
  }
  console.log(`\nCriterion summary: component ${verdict.componentPassed ? 'PASS' : 'FAIL'}; scenario ${verdict.scenarioPassed ? 'PASS' : 'FAIL'}.`);
  const failure = [...component, ...scenarios].find((item) => item.kind !== 'pass' && !(WRONG_VARIANTS.includes(item.variant) && item.kind === 'assertion'));
  if (failure) {
    const error = failure.error ?? failure.criteria?.find((item) => !item.passed)?.error;
    console.log(`First failed phase: ${failure.mode}/${failure.variant}/seed ${failure.seed}. ${error?.message ?? 'See criterion evidence.'}`);
    if (error && (Object.hasOwn(error, 'expected') || Object.hasOwn(error, 'actual'))) console.log(`Expected: ${JSON.stringify(error.expected)}\nObserved: ${JSON.stringify(error.actual)}`);
  }
  const missed = scenarios.find((item) => WRONG_VARIANTS.includes(item.variant) && item.kind === 'pass');
  if (missed) console.log(`Undetected behavior: ${missed.variant}, seed ${missed.seed}. Add an assertion on the state that this rule protects.`);
  console.log('Each per-variant JSON preserves expected/actual, runtime trace and byte hashes; .output.txt preserves raw output. Predictions and explanations are saved but ungraded.');
  console.log(`Runtime copies stay in the reference at ${executionRoot}. Consulting reference or author source is assistance.`);
  return { ...verdict, destination };
}

function summary({ mode, variant, seed, kind, error, criteria }) {
  return { mode, variant, seed, kind, error, criteria: criteria?.map(({ name, passed, error }) => ({ name, passed, error })) };
}
