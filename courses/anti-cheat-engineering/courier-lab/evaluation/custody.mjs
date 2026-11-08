import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireCheckLock, releaseCheckLock } from '../lab/core/lock.mjs';
import { captureBundle, jsonBytes, regularFile, sha256, verifyReference } from '../lab/core/trust.mjs';
import { casesForSplit, generateCorpus } from './corpus.mjs';
import { prepareEvaluation, runEvaluation } from './report.mjs';

const SCHEMA = 'courier-evaluation-custody-v1';
const EVENT_ID = /^\d{6}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const FILES = ['record.json', 'source.mjs', 'corpus.json', 'plan.json', 'exposure.json', 'report.json', 'failure.json'];
const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 4 * 1024 * 1024;

async function directory(root, relative, create = false) {
  let current = root;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (create) {
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Evaluation custody requires a regular directory: ${current}`);
  }
  return current;
}

async function authenticate(workspace, suppliedSession) {
  const requested = resolve(workspace);
  const stat = await lstat(requested);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Use the original prepared workspace directory, without a symlink.');
  workspace = await realpath(requested);
  const sessionBytes = await regularFile(workspace, 'lab/core/session.json');
  const session = JSON.parse(sessionBytes);
  if (session.schema !== 'courier-core-session-v1' || session.module !== 'evaluation' || !SESSION_ID.test(session.sessionId) || !/^[a-f0-9]{64}$/.test(session.referenceManifest)) throw new Error('Evaluation history requires a prepared evaluation workspace.');
  if (suppliedSession && JSON.stringify(suppliedSession) !== JSON.stringify(session)) throw new Error('Prepared evaluation session changed.');
  const root = await realpath(session.referenceRoot);
  if (root !== await realpath(MODULE_ROOT)) throw new Error('Use evaluation custody from this workspace\'s sealed reference snapshot. Prepare a fresh workspace if its snapshot lacks this command.');
  await verifyReference(root, session.referenceManifest);
  const ownerSession = await directory(root, `artifacts/core/sessions/${session.sessionId}`);
  const owner = JSON.parse(await regularFile(ownerSession, 'session.json'));
  if (owner.workspace !== workspace || owner.referenceRoot !== root || owner.referenceManifest !== session.referenceManifest || owner.module !== 'evaluation' || owner.sessionHash !== sha256(sessionBytes)) throw new Error('Prepared evaluation session identity changed.');
  return { workspace, root, ownerSession, session };
}

async function history(context) {
  let base;
  try { base = await directory(context.ownerSession, 'evaluation'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const entries = await readdir(base, { withFileTypes: true });
  if (entries.length > 1000) throw new Error('Evaluation history exceeds its supported 1000-event limit.');
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!EVENT_ID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unexpected evaluation history entry: ${entry.name}`);
    let record;
    try { record = JSON.parse(await regularFile(base, `${entry.name}/record.json`)); }
    catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      // A crash can follow mkdir or interrupt the first record write. Preserve
      // the directory and its raw bytes without inventing a plan or run identity.
      record = { schema: SCHEMA, eventId: entry.name, ordinal: Number(entry.name.slice(0, 6)),
        sessionId: context.session.sessionId, referenceManifest: context.session.referenceManifest,
        kind: 'interrupted', reason: error.code === 'ENOENT' ? 'missing-record' : 'incomplete-record' };
      result.push({ record, directory: join(base, entry.name) });
      continue;
    }
    if (record.schema !== SCHEMA || record.eventId !== entry.name || record.sessionId !== context.session.sessionId || record.referenceManifest !== context.session.referenceManifest || !['explore', 'plan', 'run'].includes(record.kind)) throw new Error(`Invalid evaluation history record: ${entry.name}`);
    result.push({ record, directory: join(base, entry.name) });
  }
  return result;
}

async function optionalFile(root, path) {
  try { return await regularFile(root, path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function exposureBefore(events) {
  const exposed = [];
  for (const event of events.filter(({ record }) => ['run', 'interrupted'].includes(record.kind))) {
    if (await optionalFile(event.directory, 'exposure.json')) exposed.push(event.record.eventId);
  }
  return exposed;
}

async function save(path, value) {
  const bytes = jsonBytes(value);
  if (bytes.length > LIMIT) throw new Error('Evaluation evidence exceeds the bounded file size.');
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
}

async function frozenCandidate(context, settings) {
  const { captured } = await captureBundle(context.workspace, ['evaluation/policy.mjs', 'lab/core/session.json']);
  if (sha256(captured['lab/core/session.json']) !== sha256(jsonBytes(context.session))) throw new Error('Prepared session changed while freezing evaluation source.');
  const source = captured['evaluation/policy.mjs'].toString('utf8');
  const corpus = generateCorpus();
  const plan = await prepareEvaluation({ source, settings, corpus });
  return { source, corpus, plan };
}

async function newEvent(context, events, kind, frozen, details = {}) {
  if (events.length >= 1000) throw new Error('Evaluation history reached its 1000-event limit; preserve it and prepare a new workspace.');
  const base = await directory(context.ownerSession, 'evaluation', true);
  const ordinal = events.length + 1;
  const eventId = `${String(ordinal).padStart(6, '0')}-${randomUUID()}`;
  const path = join(base, eventId);
  await mkdir(path, { mode: 0o700 });
  const priorRunIds = await exposureBefore(events);
  const record = {
    schema: SCHEMA, eventId, ordinal, kind, createdAt: new Date().toISOString(),
    sessionId: context.session.sessionId, referenceManifest: context.session.referenceManifest,
    sourceSha256: frozen.plan.sourceSha256, settingsSha256: frozen.plan.settingsSha256,
    corpusSha256: frozen.plan.corpusSha256, corpusVersion: frozen.plan.corpusVersion,
    settings: frozen.plan.settings, priorEvaluationExposure: priorRunIds.length > 0, priorRunIds,
    ...details,
  };
  await save(join(path, 'record.json'), record);
  await writeFile(join(path, 'source.mjs'), frozen.source, { flag: 'wx', mode: 0o600 });
  await save(join(path, 'corpus.json'), frozen.corpus);
  await save(join(path, 'plan.json'), frozen.plan);
  return { eventId, directory: path, record };
}

async function withSession(workspace, operation) {
  const context = await authenticate(workspace);
  const lease = await acquireCheckLock({ ...context, sessionId: context.session.sessionId });
  try { return await operation(context, await history(context)); }
  finally { await releaseCheckLock(lease); }
}

async function candidateFrom(source) {
  // Import the saved bytes, never another read of the mutable learner source.
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${randomUUID()}`);
}

async function executeEvent(event, operation) {
  await save(join(event.directory, 'exposure.json'), {
    schema: 'courier-evaluation-exposure-v1', eventId: event.eventId,
    kind: event.record.kind, startedAt: new Date().toISOString(),
    note: 'Execution has started. Later plans preserve this possible result exposure even if execution fails or is interrupted.',
  });
  try {
    const report = await operation();
    await save(join(event.directory, 'report.json'), report);
    return { ...event, status: 'completed', path: join(event.directory, 'report.json'), report };
  } catch (error) {
    await save(join(event.directory, 'failure.json'), { schema: 'courier-evaluation-failure-v1', eventId: event.eventId, failedAt: new Date().toISOString(), name: error.name, message: error.message });
    const failure = new Error(`Evaluation ${event.record.kind} failed: ${error.message}. Saved evidence: ${event.directory}`, { cause: error });
    failure.evidence = { ...event, status: 'failed', path: join(event.directory, 'failure.json') };
    throw failure;
  }
}

/** Save each exploration setting and exact candidate before exposing its result. */
export async function explore({ workspace, settings }) {
  return withSession(workspace, async (context, events) => {
    const frozen = await frozenCandidate(context, settings);
    const event = await newEvent(context, events, 'explore', frozen);
    return executeEvent(event, async () => {
      const candidate = await candidateFrom(frozen.source);
      if (typeof candidate.evaluate !== 'function') throw new Error('Candidate must export evaluate(cases, settings).');
      const result = await candidate.evaluate(casesForSplit(frozen.corpus, 'exploration'), { ...frozen.plan.settings });
      return { schema: 'courier-exploration-v1', plan: frozen.plan, split: 'exploration', result };
    });
  });
}

/** Commit immutable settings, source and corpus. Every subsequent plan is a declared revision. */
export async function plan({ workspace, settings, revisionReason }) {
  return withSession(workspace, async (context, events) => {
    const previous = events.filter(({ record }) => record.kind === 'plan').at(-1);
    if (previous && (typeof revisionReason !== 'string' || !revisionReason.trim())) throw new Error('A plan already exists. Preserve it and declare --revision <reason> for the next plan.');
    if (revisionReason !== undefined && (typeof revisionReason !== 'string' || !revisionReason.trim() || revisionReason.length > 10000)) throw new Error('Revision reason must be a nonempty string of at most 10000 characters.');
    const frozen = await frozenCandidate(context, settings);
    const event = await newEvent(context, events, 'plan', frozen, {
      attemptKind: previous ? 'revision' : 'first', previousPlanId: previous?.record.eventId ?? null,
      revisionReason: revisionReason?.trim() ?? null,
    });
    return { ...event, planId: event.eventId, status: 'planned', plan: frozen.plan, path: join(event.directory, 'plan.json') };
  });
}

/** Run one committed plan once. Source edits require a new declared plan; old bytes stay executable. */
export async function run({ workspace, planId }) {
  if (typeof planId !== 'string' || !EVENT_ID.test(planId)) throw new Error('Use the plan ID returned by evaluation:plan, not a filesystem path.');
  return withSession(workspace, async (context, events) => {
    const committed = events.find(({ record }) => record.kind === 'plan' && record.eventId === planId);
    if (!committed) throw new Error('Plan does not belong to this prepared evaluation session.');
    if (events.some(({ record }) => record.kind === 'run' && record.planId === planId)) throw new Error('This plan was already started. Preserve its result and create a declared revision to evaluate again.');
    const source = (await regularFile(committed.directory, 'source.mjs')).toString('utf8');
    const corpus = JSON.parse(await regularFile(committed.directory, 'corpus.json'));
    const savedPlan = JSON.parse(await regularFile(committed.directory, 'plan.json'));
    const expected = await prepareEvaluation({ source, corpus, settings: savedPlan.settings });
    if (JSON.stringify(savedPlan) !== JSON.stringify(expected) || expected.sourceSha256 !== committed.record.sourceSha256 || expected.corpusSha256 !== committed.record.corpusSha256 || expected.settingsSha256 !== committed.record.settingsSha256) throw new Error('Committed plan evidence changed. Preserve it and prepare a new session.');
    const frozen = { source, corpus, plan: savedPlan };
    const event = await newEvent(context, events, 'run', frozen, { planId, attemptKind: committed.record.attemptKind });
    return executeEvent(event, async () => runEvaluation(await candidateFrom(source), { source, corpus, plan: savedPlan }));
  });
}

/** Read-only links for a new core submission. Never edits a previous submission or result. */
export async function getEvidenceLinks({ workspace, session }) {
  const context = await authenticate(workspace, session);
  const events = [];
  for (const event of await history(context)) {
    const files = [];
    for (const file of FILES) {
      const bytes = await optionalFile(event.directory, file);
      if (bytes) files.push({ path: join(event.directory, file), sha256: sha256(bytes) });
    }
    const names = files.map(({ path }) => path.split('/').at(-1));
    const completeCapture = ['source.mjs', 'corpus.json', 'plan.json'].every((name) => names.includes(name));
    const status = event.record.kind === 'interrupted' ? 'interrupted' : names.includes('failure.json') ? 'failed' : !completeCapture ? 'interrupted' : names.includes('report.json') ? 'completed' : event.record.kind === 'plan' ? 'planned' : 'interrupted';
    events.push({ ...event.record, status, files });
  }
  return {
    schema: 'courier-evaluation-evidence-v1', sessionId: context.session.sessionId,
    referenceManifest: context.session.referenceManifest, events,
    latestPlanId: events.filter((event) => event.kind === 'plan').at(-1)?.eventId ?? null,
    evaluationExposed: events.some((event) => ['run', 'interrupted'].includes(event.kind) && event.files.some(({ path }) => path.endsWith('/exposure.json'))),
    limits: 'Owner-side append-only local evidence, not an OS security boundary against the machine owner.',
  };
}
