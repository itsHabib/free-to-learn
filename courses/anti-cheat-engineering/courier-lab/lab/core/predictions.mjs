import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREDICTION_CONTRACT = 'courier-predictions-v1';
const bytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const save = (path, value) => writeFile(path, bytes(value), { flag: 'wx', mode: 0o600 });
const identity = () => `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;

export async function loadPredictionFeedback(root, module) {
  const path = module === 'spatial' ? 'lab' : module === 'order' ? 'lab/order' : module;
  return import(pathToFileURL(join(root, path, 'feedback.mjs')));
}

export function predictionTemplate(feedback, module, stage = 'prediction') {
  return {
    schema: PREDICTION_CONTRACT, module, stage,
    predictions: feedback.predictions.map(({ id, question, freshVariant }) => ({
      id, question: stage === 'fresh' ? freshVariant.question : question, answer: '', skipReason: '',
    })),
  };
}

/** Require a committed answer or a deliberate skip, never infer prose correctness. */
export function validatePredictions(raw, expected) {
  let document;
  try { document = JSON.parse(raw); }
  catch { throw new Error('Save valid JSON in the prediction file; its draft has been preserved.'); }
  if (document?.schema !== expected.schema || document.module !== expected.module || document.stage !== expected.stage || !Array.isArray(document.predictions)) throw new Error('Prediction identity changed; keep its original schema, module and stage.');
  if (document.predictions.length !== expected.predictions.length) throw new Error('Keep every original prediction question exactly once.');
  for (const [index, question] of expected.predictions.entries()) {
    const submitted = document.predictions[index];
    if (!submitted || submitted.id !== question.id || submitted.question !== question.question) throw new Error(`Keep the exact original id and wording for prediction ${question.id}.`);
    if (typeof submitted.answer !== 'string' || (submitted.skipReason !== undefined && typeof submitted.skipReason !== 'string')) throw new Error(`Prediction ${question.id} needs a text answer or explicit skipReason.`);
    if (submitted.answer.length > 20000 || (submitted.skipReason?.length ?? 0) > 10000) throw new Error(`Prediction ${question.id} exceeds the text limit.`);
    const answered = Boolean(submitted.answer.trim());
    const skipped = Boolean(submitted.skipReason?.trim());
    if (answered === skipped) throw new Error(`Prediction ${question.id}: fill answer OR an explicit skipReason before checking.`);
  }
  const skippedIds = document.predictions.filter((item) => item.skipReason?.trim()).map((item) => item.id);
  return { document, skippedIds, answeredCount: document.predictions.length - skippedIds.length, graded: false };
}

export function predictionCustody(predictions, assistance, priorFeedbackExposure = false, help = {}) {
  const skipped = predictions.skippedIds.length > 0;
  const assisted = skipped || priorFeedbackExposure || assistance.trim().toLowerCase() !== 'none' || (help.consulted?.length ?? 0) > 0;
  return {
    predictionStatus: skipped ? 'assisted-skipped' : 'answered',
    skippedQuestionIds: predictions.skippedIds,
    assistanceClass: assisted ? 'assisted' : 'self-reported-unaided',
    proseGraded: false,
  };
}

const capturedHashes = (captured) => Object.fromEntries(Object.entries(captured).map(([path, content]) => [path, createHash('sha256').update(content).digest('hex')]));

async function saveCaptured(destination, captured) {
  await mkdir(join(destination, 'submitted'), { recursive: true, mode: 0o700 });
  for (const [path, content] of Object.entries(captured)) {
    await mkdir(dirname(join(destination, 'submitted', path)), { recursive: true, mode: 0o700 });
    await writeFile(join(destination, 'submitted', path), content, { flag: 'wx', mode: 0o600 });
  }
}

export async function preservePredictionRefusal({ directory, captured, assistance, module, stage, error }) {
  const refusalId = identity();
  const destination = join(directory, refusalId);
  await saveCaptured(destination, captured);
  const result = { schema: 'courier-prediction-refusal-v1', refusalId, module, stage, hashes: capturedHashes(captured), submittedAt: new Date().toISOString(), kind: 'submission-refused', graded: false, healthy: false, passed: false, assistance, feedbackReleased: false, error: { message: error.message } };
  await save(join(destination, 'result.json'), result);
  console.log(`Submission refused: ${error.message}\nDraft preserved without grading or answer release: ${destination}`);
  return { ...result, destination };
}

export async function prepareFreshPractice(workspace, feedback, module) {
  try { await save(join(workspace, 'fresh-practice.json'), predictionTemplate(feedback, module, 'fresh')); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

async function latestCommitted(directory, requireFeedback = true) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    try {
      const submission = JSON.parse(await readFile(join(directory, entry.name, 'submission.json')));
      if (requireFeedback) await readFile(join(directory, entry.name, 'prediction-feedback.json'));
      return submission;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return null;
}

/** A second commit is required before fresh-answer feedback; it never scores prose. */
export async function submitFreshPractice({ workspace, root, module, captured, assistance, attempts, directory, refusals, help = {} }) {
  const source = await latestCommitted(attempts);
  const { postCheckFeedback, reviewerFeedback } = await loadPredictionFeedback(root, module);
  const feedback = postCheckFeedback();
  let predictions;
  try {
    if (!source) throw new Error('Complete a source check before submitting fresh practice.');
    predictions = validatePredictions(captured['fresh-practice.json'], predictionTemplate(feedback, module, 'fresh'));
  } catch (error) { return preservePredictionRefusal({ directory: refusals, captured, assistance, module, stage: 'fresh', error }); }
  const previous = await latestCommitted(directory, false);
  const attemptId = identity();
  const destination = join(directory, attemptId);
  // Save every submitted byte before loading or writing any fresh answer key.
  await saveCaptured(destination, captured);
  const custody = predictionCustody(predictions, assistance, Boolean(previous), help);
  await save(join(destination, 'submission.json'), { schema: 'courier-fresh-practice-submission-v1', attemptId, module, submittedAt: new Date().toISOString(), sourceAttemptId: source.attemptId, referenceRoot: root, referenceManifest: source.referenceManifest, prompt: source.prompt, sessionId: source.sessionId ?? null, hashes: capturedHashes(captured), attemptKind: previous ? 'revision' : 'first', previousAttemptId: previous?.attemptId ?? null, priorFeedbackExposure: Boolean(previous), assistance, help, ...custody, predictions: predictions.document });
  await save(join(destination, 'feedback-started.json'), { startedAt: new Date().toISOString() });
  const reviewer = reviewerFeedback();
  const answers = reviewer.freshVariantAnswers ?? reviewer.freshVariants;
  if (!Array.isArray(answers)) throw new Error('This module has no fresh-practice answer key.');
  const freshVariantAnswers = feedback.predictions.map((item) => {
    const keyed = answers.find(({ id }) => id === item.id);
    if (!keyed?.answer) throw new Error(`Fresh-practice answer missing for ${item.id}.`);
    return { id: item.id, question: item.freshVariant.question, submitted: predictions.document.predictions.find(({ id }) => id === item.id), answer: keyed.answer, reason: keyed.reason ?? keyed.answer, source: item.source };
  });
  await save(join(destination, 'prediction-feedback.json'), { schema: 1, module, freshVariantAnswers, proseGraded: false, note: 'Compare the captured answer with the key and governing reason. This is feedback, not a score of prose correctness.' });
  const result = { kind: 'practice-recorded', healthy: true, passed: true, graded: false, sourceAttemptId: source.attemptId, ...custody };
  await save(join(destination, 'result.json'), result);
  console.log(`Fresh practice saved before feedback: ${destination}\nCompare your captured answers: ${join(destination, 'prediction-feedback.json')}`);
  return { ...result, destination, attemptId };
}
