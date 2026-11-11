import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, statfsSync, realpathSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executionIdentity, sha256 } from './runtime/identity.mjs';
import { stable, witnessToolIdentity } from './witness.mjs';
import { workshopTemplate } from './workshop-templates.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const json = value => JSON.stringify(value, null, 2) + '\n';
const code = value => '`' + JSON.stringify(value).replaceAll('`', '\\`').replaceAll('|', '\\|') + '`';
const idPattern = /^[a-z][a-z0-9-]{0,47}$/;
const operations = new Set(['begin', 'get', 'put', 'delete', 'scan', 'open-scan', 'pull', 'close-query', 'inspect', 'commit', 'abort', 'vacuum']);
const within = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
function requireThat(condition, message) { if (!condition) throw Error(message); }
function bounded(path, limit = 131072) {
  requireThat(statSync(path).size <= limit, `Input exceeds ${limit} bytes: ${path}`);
  return readFileSync(path);
}
function headroom(path, bytes = 0) {
  const internal = statfsSync('/');
  requireThat(internal.bavail * internal.bsize >= 5_000_000_000, 'Stopped writing: internal free space is below 5,000,000,000 bytes.');
  const space = statfsSync(path), remaining = space.bavail * space.bsize - bytes;
  const onMountedVolume = resolve(path).startsWith('/Volumes/');
  requireThat(remaining >= (onMountedVolume ? 0 : 5_000_000_000), onMountedVolume ? `Stopped writing: not enough space for ${bytes} bytes on the destination volume.` : 'Stopped writing: planned output would cross the 5,000,000,000-byte internal floor.');
}
function newOutput(project, path) {
  const out = resolve(path);
  requireThat(!existsSync(out), 'Destination exists; keep prior experiments and choose a new directory.');
  requireThat(within(realpathSync(project), realpathSync(dirname(out))), 'Destination parent must already exist inside the project.');
  return out;
}
export function workshopIdentity() {
  return sha256(stable({ execution: executionIdentity(), witness: witnessToolIdentity(), files: ['workshop.mjs', 'workshop-worker.mjs', 'workshop-templates.mjs'].map(f => [f, sha256(readFileSync(join(root, f)))]) }));
}

export function initWorkshop(project, topic, directory) {
  const book = workshopTemplate(topic), out = newOutput(project, directory), source = bounded(join(project, 'engine.mjs'), 65536);
  headroom(project, source.length * 2 + Buffer.byteLength(json(book)));
  mkdirSync(out);
  writeFileSync(join(out, 'workbook.json'), json(book), { flag: 'wx' });
  for (const name of ['baseline.mjs', 'candidate.mjs']) writeFileSync(join(out, name), source, { flag: 'wx' });
  return out;
}

function validate(book) {
  requireThat(book?.format === 'advanced-storage-workshop-v1', 'Unknown workshop format.');
  for (const key of ['title', 'question']) requireThat(typeof book[key] === 'string' && book[key].trim(), `Write your ${key}.`);
  requireThat(Number.isInteger(book.seed) && book.seed >= 0 && book.seed <= 4294967295, 'Seed must be an unsigned 32-bit integer.');
  const scenario = book.scenario;
  requireThat(Array.isArray(scenario?.actions) && scenario.actions.length >= 1 && scenario.actions.length <= 96, 'Use 1–96 actions.');
  requireThat(Array.isArray(scenario.initial) && scenario.initial.length <= 128, 'Use at most 128 initial versions.');
  const ids = new Set(), transactions = new Set(), queries = new Set();
  for (const a of scenario.actions) {
    requireThat(a && idPattern.test(a.id) && !ids.has(a.id), 'Every action needs a unique lowercase id.');
    ids.add(a.id);
    requireThat(operations.has(a.op), `Unsupported workshop operation: ${a.op}`);
    if (a.op === 'begin') {
      requireThat(typeof a.tx === 'string' && a.tx.trim() && !transactions.has(a.tx), 'Use a new alias for each transaction.');
      transactions.add(a.tx);
    } else if (['pull', 'close-query'].includes(a.op)) {
      requireThat(queries.has(a.query), `Unknown query alias at ${a.id}.`);
    } else if (!['inspect', 'vacuum'].includes(a.op)) {
      requireThat(transactions.has(a.tx), `Unknown transaction alias at ${a.id}.`);
    }
    if (a.op === 'open-scan') {
      requireThat(typeof a.as === 'string' && a.as.trim() && !queries.has(a.as), 'Use a new alias for each query.');
      queries.add(a.as);
    }
  }
  requireThat(Array.isArray(book.checkpoints) && book.checkpoints.length >= 1 && book.checkpoints.length <= 48, 'Use 1–48 checkpoints.');
  const checkpoints = new Set();
  for (const c of book.checkpoints) {
    requireThat(c && idPattern.test(c.id) && !checkpoints.has(c.id), 'Every checkpoint needs a unique lowercase id.');
    checkpoints.add(c.id);
    requireThat(ids.has(c.after), `Unknown checkpoint action: ${c.after}`);
    requireThat(typeof c.question === 'string' && c.question.trim(), `Write a question for ${c.id}.`);
    requireThat(Array.isArray(c.path) && c.path.length >= 1 && c.path.length <= 12 && ['result', 'state', 'work'].includes(c.path[0]), `Start ${c.id}'s path with result, state or work.`);
    requireThat(c.path.every(p => (typeof p === 'string' && p.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(p)) || (Number.isInteger(p) && p >= 0)), `Invalid projection path at ${c.id}.`);
  }
  requireThat(Array.isArray(book.trials) && book.trials.length >= 1 && book.trials.length <= 4, 'Use 1–4 trials.');
  const trials = new Set();
  for (const t of book.trials) {
    requireThat(t && idPattern.test(t.id) && !trials.has(t.id), 'Every trial needs a unique lowercase id.');
    trials.add(t.id);
    requireThat(['snapshot', 'serializable'].includes(t.mode), `Choose an explicit mode for ${t.id}.`);
    requireThat(t.access === undefined || ['scan', 'index'].includes(t.access), `Invalid access override for ${t.id}.`);
    requireThat(typeof t.source === 'string' && t.source.endsWith('.mjs') && !isAbsolute(t.source), `Use a relative .mjs policy path for ${t.id}.`);
    requireThat(t.predictions && Object.keys(t.predictions).length === checkpoints.size, `Predict every checkpoint, and no stale checkpoints, in ${t.id}.`);
    for (const c of checkpoints) {
      const prediction = t.predictions[c];
      requireThat(prediction && Object.hasOwn(prediction, 'expected') && typeof prediction.because === 'string' && prediction.because.trim(), `Before running, write expected and because for ${t.id}/${c}.`);
    }
  }
}

export function projectValue(value, path) {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (key === '*') {
    requireThat(Array.isArray(value), 'Wildcard requires an array.');
    return value.map(item => projectValue(item, rest));
  }
  requireThat(value !== null && typeof value === 'object' && Object.hasOwn(value, key), `Missing projection field: ${key}`);
  return projectValue(value[key], rest);
}
function observe(source, scenario, seed) {
  const child = spawnSync(process.execPath, [join(root, 'workshop-worker.mjs'), source, String(seed)], { input: json(scenario), encoding: 'utf8', timeout: 750, maxBuffer: 1024 * 1024 });
  if (child.error?.code === 'ETIMEDOUT') return { status: 'timeout', message: 'Stopped after 750 ms; no correctness verdict.' };
  if (child.error?.code === 'ENOBUFS') return { status: 'resource-limit', message: 'Worker output exceeded one MiB; no correctness verdict.' };
  if (child.status !== 0) return { status: 'execution-error', message: (child.stderr || child.error?.message || 'Worker failed.').slice(0, 500) };
  try {
    const result = JSON.parse(child.stdout);
    requireThat(['complete', 'resource-limit', 'invalid-execution', 'execution-error'].includes(result.status), 'Bad worker status.');
    return result;
  } catch { return { status: 'execution-error', message: 'Invalid worker output; no correctness verdict.' }; }
}
function predictionsFor(book, trial, observation) {
  return book.checkpoints.map(checkpoint => {
    const prediction = trial.predictions[checkpoint.id], index = book.scenario.actions.findIndex(a => a.id === checkpoint.after);
    const frame = observation.frames?.find(f => f.index === index), result = observation.execution?.results[index];
    const entry = { ...checkpoint, ...prediction };
    if (!frame || !result) return { ...entry, comparison: 'unavailable', message: 'No completed observation for this action.' };
    try {
      const actual = projectValue({ ...frame, result: result.result }, checkpoint.path);
      return { ...entry, actual, comparison: stable(actual) === stable(prediction.expected) ? 'matched' : 'different' };
    } catch (error) { return { ...entry, comparison: 'unavailable', message: error.message }; }
  });
}
function summaryMarkdown(book, trials) {
  const lines = [`# ${book.title}`, '', book.question, '', 'Predictions are learner claims, not an engine-correctness oracle. No course pass is awarded.', '', '| Trial | Policy SHA-256 | Mode / access | Execution | Snapshot mismatches |', '| --- | --- | --- | --- | --- |'];
  for (const t of trials) lines.push(`| ${t.id} | ${code(t.sourceSha256)} | ${t.mode} / ${t.access ?? 'per action'} | ${t.status} | ${t.snapshotMismatches ?? 'not evaluated'} |`);
  for (const c of book.checkpoints) {
    lines.push('', `## ${c.id} — after ${c.after}`, '', c.question, '', '| Trial | Predicted | Observed | Comparison |', '| --- | --- | --- | --- |');
    for (const t of trials) {
      const p = t.predictions.find(p => p.id === c.id);
      lines.push(`| ${t.id} | ${code(p.expected)} | ${Object.hasOwn(p, 'actual') ? code(p.actual) : p.message} | ${p.comparison} |`);
    }
  }
  lines.push('', '## What the evidence means', '', 'Each completed deterministic trial was executed twice in fresh processes with the same seeded Math.random. This checks these two executions only; clocks, external files and other sources of variation are not controlled.', '', 'The copied-map oracle checks snapshot read values against observed commits. It does not validate commit admission, application invariants, cleanup efficiency or general serializability. A two-booking anomaly can therefore have zero snapshot mismatches.', '', 'Traces are from the course engine on MemoryDisk with logical clients and serialized publication. A durable event names the simulated storage acknowledgement; this experiment does not establish real disk crash durability, physical space reclamation, multiprocess concurrency or measured latency.', '');
  for (const t of trials) if (t.witnessEligible) lines.push(`Trial ${t.id} has a reproducible wrong snapshot observation. Use the existing minimizer on trials/${t.id}; details and commands are in WORKSHOP.md.`);
  return lines.join('\n') + '\n';
}
function traceMarkdown(trial, observation, scenario, actionId) {
  const lines = [`# ${trial.id}: ${trial.status}`, '', 'Recorded action order; state below is after the action. Counts are logical versions and teaching work units.', ''];
  if (observation.message) lines.push(observation.message, '');
  for (const frame of observation.frames ?? []) {
    if (actionId && frame.id !== actionId) continue;
    const result = observation.execution?.results[frame.index] ?? observation.partial?.completed?.[frame.index];
    lines.push(`## ${frame.index}: ${frame.id}`, '', 'Action:', '```json', json(scenario.actions[frame.index]).trimEnd(), '```', '', result ? 'Observed result:' : 'Action did not complete:', '```json', result ? json(result.result).trimEnd() : 'null', '```');
    for (const p of trial.predictions.filter(p => p.after === frame.id)) lines.push('', `Prediction ${p.id}: ${code(p.expected)} — ${p.comparison}`, '', `Reason recorded before execution: ${p.because}`);
    const mismatches = observation.mismatches?.filter(m => m.index === frame.index) ?? [];
    if (mismatches.length) lines.push('', 'Snapshot oracle disagreement:', '```json', json(mismatches).trimEnd(), '```');
    lines.push('', 'After-action state and measured work:', '```json', json({ state: frame.state, work: frame.work }).trimEnd(), '```', '', 'Events emitted by this action (empty means no event was emitted):', '```json', json(frame.events).trimEnd(), '```', '');
  }
  return lines.join('\n');
}

export function runWorkshop(project, workbookPath, directory, { helpUsed } = {}) {
  requireThat(typeof helpUsed === 'string' && helpUsed.trim(), 'Declare assistance with --help-used.');
  const out = newOutput(project, directory), input = realpathSync(workbookPath), projectRoot = realpathSync(project);
  requireThat(within(projectRoot, input), 'Keep the workbook inside the project so export preserves it.');
  const bookBytes = bounded(input), book = JSON.parse(bookBytes);
  validate(book);
  const prepared = book.trials.map(trial => {
    const path = realpathSync(resolve(dirname(input), trial.source));
    requireThat(within(projectRoot, path), 'Policy sources must remain inside the project.');
    const source = bounded(path, 65536);
    const scenario = structuredClone(book.scenario);
    scenario.mode = trial.mode;
    for (const a of scenario.actions) if (trial.access && ['scan', 'open-scan'].includes(a.op)) a.access = trial.access;
    return { trial, source, scenario };
  });
  // All predictions, sources and schedules are frozen before any policy runs.
  headroom(project, 12 * 1024 * 1024);
  mkdirSync(out);
  const files = {};
  function save(name, bytes) {
    headroom(out, Buffer.byteLength(bytes));
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), bytes, { flag: 'wx' });
    files[name] = sha256(bytes);
  }
  save('workbook.json', bookBytes);
  for (const p of prepared) {
    save(`trials/${p.trial.id}/engine.mjs`, p.source);
    save(`trials/${p.trial.id}/scenario.json`, json(p.scenario));
  }
  save('commitment.json', json({ format: 'advanced-storage-workshop-commitment-v1', at: new Date().toISOString(), helpUsed, seed: book.seed, runtime: process.version, executionIdentity: executionIdentity(), workshopIdentity: workshopIdentity(), files: { ...files } }));
  const trials = [];
  for (const { trial, source, scenario } of prepared) {
    const prefix = `trials/${trial.id}`, first = observe(join(out, prefix, 'engine.mjs'), scenario, book.seed), second = observe(join(out, prefix, 'engine.mjs'), scenario, book.seed);
    const deterministic = stable(first) === stable(second), complete = deterministic && first.status === 'complete';
    const result = {
      id: trial.id, mode: trial.mode, access: trial.access, sourceSha256: sha256(source), scenarioSha256: files[`${prefix}/scenario.json`],
      status: deterministic ? first.status : 'nondeterministic', deterministic,
      snapshotMismatches: complete ? first.mismatches.length : null,
      witnessEligible: complete && first.mismatches.length > 0,
      predictions: predictionsFor(book, trial, first)
    };
    // Mismatched/error executions may be inspected, never graded as repeatable predictions.
    if (!complete) for (const prediction of result.predictions) {
      prediction.comparison = 'unavailable'; prediction.message = `Trial is ${result.status}; inspect the saved observations.`;
    }
    save(`${prefix}/observation.json`, json(first));
    save(`${prefix}/repeat.json`, json(second));
    if (complete) {
      save(`${prefix}/results.json`, json(first.execution));
      save(`${prefix}/manifest.json`, json({ format: 'advanced-storage-run-v1', sourceSha256: result.sourceSha256, scenarioSha256: result.scenarioSha256, resultSha256: files[`${prefix}/results.json`], prediction: JSON.stringify(trial.predictions), executionIdentity: executionIdentity(), helpUsed, runtime: process.version, seed: book.seed, workshopCommitmentSha256: files['commitment.json'] }));
    }
    save(`${prefix}/trace.md`, traceMarkdown(result, first, scenario));
    trials.push(result);
  }
  const report = { format: 'advanced-storage-workshop-report-v1', title: book.title, seed: book.seed, trials, coursePassAwarded: false };
  save('report.json', json(report));
  save('report.md', summaryMarkdown(book, trials));
  // A missing receipt indicates an interrupted experiment; earlier evidence survives.
  const receipt = json({ format: 'advanced-storage-workshop-receipt-v1', workshopIdentity: workshopIdentity(), files });
  headroom(out, Buffer.byteLength(receipt));
  writeFileSync(join(out, 'receipt.json'), receipt, { flag: 'wx' });
  return { directory: out, ...report };
}

export function showWorkshop(directory, trialId, actionId) {
  const out = resolve(directory), receipt = JSON.parse(bounded(join(out, 'receipt.json')));
  requireThat(receipt.format === 'advanced-storage-workshop-receipt-v1', 'Not a completed workshop experiment.');
  for (const [name, hash] of Object.entries(receipt.files ?? {})) {
    requireThat(!isAbsolute(name) && within(out, resolve(out, name)), 'Invalid receipt path.');
    requireThat(sha256(bounded(join(out, name), 4 * 1024 * 1024)) === hash, `Saved evidence changed: ${name}`);
  }
  requireThat(receipt.files?.['report.json'] && receipt.files?.['workbook.json'] && receipt.files?.['report.md'], 'Incomplete workshop receipt.');
  if (!trialId) return readFileSync(join(out, 'report.md'), 'utf8');
  const report = JSON.parse(readFileSync(join(out, 'report.json'))), trial = report.trials.find(t => t.id === trialId);
  requireThat(trial && idPattern.test(trialId), 'Unknown trial id.');
  const prefix = `trials/${trialId}`;
  requireThat(receipt.files[`${prefix}/observation.json`] && receipt.files[`${prefix}/scenario.json`], 'Incomplete trial receipt.');
  const scenario = JSON.parse(readFileSync(join(out, prefix, 'scenario.json')));
  if (actionId) requireThat(scenario.actions.some(a => a.id === actionId), 'Unknown action id.');
  return traceMarkdown(trial, JSON.parse(readFileSync(join(out, prefix, 'observation.json'))), scenario, actionId);
}
