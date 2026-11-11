import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, cpSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BaseEngine } from './runtime/base.mjs';
import { executeScenario } from './runtime/scenario.mjs';
import { executionIdentity } from './runtime/identity.mjs';
import { minimizeRun, replayWitness, showWitness } from './witness.mjs';
import { initWorkshop, runWorkshop, showWorkshop } from './workshop.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
const args = process.argv.slice(2), command = args[0];
function requireHelp() {
  const at = args.indexOf('--help-used');
  if (at < 0 || !args[at + 1]) throw Error('Declare assistance: --help-used none, or quote what you used.');
  return args[at + 1];
}
function requirePrediction() {
  const at = args.indexOf('--prediction');
  if (at < 0 || !args[at + 1]?.trim()) throw Error('Record your expected outcome before running: --prediction "your prediction".');
  return args[at + 1];
}
function project(path) {
  const dir = resolve(path ?? ''); const metadata = readJSON(join(dir, 'PROJECT.json'));
  if (metadata.format !== 'advanced-storage-project-v1') throw Error('Not an Advanced Storage project.');
  return dir;
}
function attempt(dir, kind, details = {}) {
  const out = mkdtempSync(join(dir, 'attempts', `${kind}-`));
  const source = readFileSync(join(dir, 'engine.mjs'), 'utf8');
  writeFileSync(join(out, 'engine.mjs'), source, { flag: 'wx' });
  save(join(out, 'attempt.json'), { format: 'advanced-storage-attempt-v1', at: new Date().toISOString(), kind, sourceSha256: hash(source), executionIdentity: executionIdentity(), node: process.version, helpUsed: requireHelp(), ...details });
  return out;
}
function usage() {
  console.log(`Advanced Storage local lab\n\nnode lab.mjs doctor\nnode lab.mjs start NEW_PROJECT\nnode lab.mjs check PROJECT 01 --help-used none\nnode lab.mjs question 01a\nnode lab.mjs answer PROJECT 01a 'ANSWER_JSON' --help-used none\nnode lab.mjs run PROJECT SCENARIO_JSON NEW_RUN --help-used none --prediction "expected outcome"\nnode lab.mjs assess PROJECT INVESTIGATION_JSON --help-used none\nnode lab.mjs transfer PROJECT TRANSFER_JSON --help-used none\nnode lab.mjs workshop-init PROJECT retention|predicate NEW_DIRECTORY\nnode lab.mjs workshop-run PROJECT WORKBOOK_JSON NEW_EXPERIMENT --help-used none\nnode lab.mjs workshop-show EXPERIMENT [TRIAL [ACTION_ID]]\nnode lab.mjs minimize RECORDED_RUN NEW_WITNESS --help-used none\nnode lab.mjs show-witness WITNESS\nnode lab.mjs replay-witness WITNESS --help-used none\nnode lab.mjs export PROJECT NEW_EXPORT\n\nUse Node 26.5.1. Your JavaScript runs with your local permissions, not in a security sandbox.`);
}
try {
  if (command === 'doctor') {
    console.log(JSON.stringify({ node: process.version, qualifiedProfile: 'Node 26.5.1 / macOS source-aware local checks', runtimeMatches: process.version === 'v26.5.1', executionIdentity: executionIdentity(), networkNeeded: false, installNeeded: false, browserCheck: 'NOT RUN', unitsWithCodeChecks: [1, 2, 3, 4, 5, 6, 7] }, null, 2));
  } else if (command === 'start') {
    if (!args[1]) throw Error('Choose a new project directory.'); const dir = resolve(args[1]);
    if (existsSync(dir)) throw Error('Destination exists; choose a new directory.'); mkdirSync(dir, { recursive: true }); mkdirSync(join(dir, 'attempts'));
    cpSync(join(root, 'starter', 'engine.mjs'), join(dir, 'engine.mjs'));
    save(join(dir, 'PROJECT.json'), { format: 'advanced-storage-project-v1', createdAt: new Date().toISOString(), supplied: ['durable foundation', 'I/O and transaction handles', 'typed predicate evaluator', 'physical plan operators', 'public checker'], learnerOwns: ['visibleVersion', 'commitTransaction', 'writeConflicts', 'readConflicts', 'indexMemberships', 'retainedVersions', 'summarizeSnapshot', 'planEqualityJoin'] });
    console.log(`Created ${dir}\nEdit engine.mjs, read lessons/01.md, then run check. Untouched target methods should fail.`);
  } else if (command === 'check') {
    const dir = project(args[1]), through = Number(args[2]); if (!Number.isInteger(through) || through < 1 || through > 7) throw Error('Choose cumulative unit 01 through 07.');
    const out = attempt(dir, 'check', { through, contractVersion: 'prototype-v4-check-integrity' });
    let report;
    try { report = JSON.parse(execFileSync(process.execPath, [join(root, 'check-runner.mjs'), join(out, 'engine.mjs'), String(through)], { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 })); }
    catch (error) { report = { runtimeError: error.signal ? `Stopped after runtime limit: ${error.signal}` : (error.stdout?.toString() || error.message) }; }
    save(join(out, 'report.json'), report);
    if (report.runtimeError) { console.error(report.runtimeError); process.exitCode = 3; }
    else {
      for (const item of report.results) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${item.name}${item.passed ? '' : '\n  ' + item.message}`);
      console.log(`${report.total - report.failures}/${report.total} criteria passed. Exact attempt: ${out}`); process.exitCode = report.passed ? 0 : 1;
    }
  } else if (command === 'question') {
    const q = readJSON(join(root, 'practice.json')).find(q => q.id === args[1]); if (!q) throw Error('Unknown question ID.');
    console.log(`${q.id} v${q.version} [${q.objective}]\n${q.stem}\nAnswer as JSON: ${q.answerFormat}\nUse answer to record your response before feedback.`);
  } else if (command === 'answer') {
    const dir = project(args[1]), q = readJSON(join(root, 'practice.json')).find(q => q.id === args[2]); if (!q) throw Error('Unknown question ID.');
    const response = JSON.parse(args[3]); const out = attempt(dir, 'answer', { question: { id: q.id, version: q.version, objective: q.objective, stem: q.stem }, response });
    const accepted = [q.answer, ...(q.acceptedAnswers ?? [])];
    const passed = accepted.some(value => JSON.stringify(response) === JSON.stringify(value)), feedback = { passed, expected: q.answer, explanation: q.feedback, assistance: requireHelp() };
    save(join(out, 'feedback.json'), feedback); console.log(JSON.stringify(feedback, null, 2)); console.log(`Committed response: ${out}`); process.exitCode = passed ? 0 : 1;
  } else if (command === 'run') {
    const dir = project(args[1]), sourceScenario = resolve(args[2] ?? ''), out = resolve(args[3] ?? ''), prediction = requirePrediction(); requireHelp();
    if (!args[3] || existsSync(out)) throw Error('Choose a new run directory.');
    const scenario = readJSON(sourceScenario); if (!Array.isArray(scenario.actions) || scenario.actions.length > 500) throw Error('Scenario needs at most 500 actions.');
    mkdirSync(out, { recursive: true }); const committed = attempt(dir, 'run', { scenarioSha256: hash(readFileSync(sourceScenario)), prediction, output: out });
    cpSync(sourceScenario, join(out, 'scenario.json')); cpSync(join(committed, 'engine.mjs'), join(out, 'engine.mjs'));
    const { buildEngine } = await import(pathToFileURL(join(out, 'engine.mjs')).href); const Engine = buildEngine(BaseEngine);
    try {
      const result = executeScenario(Engine, scenario);
      save(join(out, 'results.json'), result);
      save(join(out, 'manifest.json'), { format: 'advanced-storage-run-v1', sourceSha256: hash(readFileSync(join(out, 'engine.mjs'))), scenarioSha256: hash(readFileSync(join(out, 'scenario.json'))), resultSha256: hash(readFileSync(join(out, 'results.json'))), prediction, executionIdentity: executionIdentity(), helpUsed: requireHelp(), runtime: process.version });
      console.log(`Recorded ${result.results.length} actions in ${out}. Results are observations, not an automatic capstone pass.`);
    } catch (error) { save(join(out, 'failure.json'), { error: error.message, ...error.partial }); throw error; }
  } else if (command === 'assess' || command === 'transfer') {
    const dir = project(args[1]), specification = resolve(args[2] ?? ''); const out = attempt(dir, 'assessment', { assessment: command, specificationSha256: hash(readFileSync(specification)), specificationOrigin: specification, assessmentCheckerSha256: hash(readFileSync(join(root,'investigation.mjs'))) });
    cpSync(specification,join(out,'specification.json'));
    let report;
    try { report=JSON.parse(execFileSync(process.execPath,[join(root,'assessment-runner.mjs'),command,join(out,'specification.json'),hash(readFileSync(join(out,'engine.mjs'))),dirname(specification)],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024})); }
    catch(error) { report={verificationError:error.signal?`Stopped at execution limit: ${error.signal}`:(error.stdout?.toString()||error.message)}; }
    save(join(out,'report.json'),report); console.log(JSON.stringify(report,null,2)); console.log(`Saved ${out}`); process.exitCode=report.verificationError?3:report.engineeringPassed?0:1;
  } else if (command === 'workshop-init') {
    if (!args[2] || !args[3]) throw Error('Use workshop-init PROJECT retention|predicate NEW_DIRECTORY.');
    const out = initWorkshop(project(args[1]), args[2], args[3]);
    console.log(`Created ${out}\nRead WORKSHOP.md. Edit workbook.json predictions and candidate.mjs before running. Baseline and candidate begin as copies of your own engine; no solutions were supplied.`);
  } else if (command === 'workshop-run') {
    if (!args[2] || !args[3]) throw Error('Use workshop-run PROJECT WORKBOOK_JSON NEW_EXPERIMENT --help-used none.');
    const report = runWorkshop(project(args[1]), args[2], args[3], { helpUsed: requireHelp() });
    console.log(`Saved ${report.directory}`);
    for (const t of report.trials) console.log(`${t.id}: ${t.status}; snapshot mismatches: ${t.snapshotMismatches ?? 'not evaluated'}; predictions: ${t.predictions.map(p => `${p.id}=${p.comparison}`).join(', ')}${t.witnessEligible ? '; actual snapshot witness available' : ''}`);
    console.log('Use workshop-show EXPERIMENT [TRIAL [ACTION_ID]] to compare predictions or inspect the recorded trace. No course pass is awarded.');
    if (report.trials.some(t => t.status !== 'complete')) process.exitCode = 3;
  } else if (command === 'workshop-show') {
    if (!args[1]) throw Error('Use workshop-show EXPERIMENT [TRIAL [ACTION_ID]].');
    console.log(showWorkshop(args[1], args[2], args[3]));
  } else if (command === 'minimize') {
    if(!args[1]||!args[2])throw Error('Use minimize RECORDED_RUN NEW_WITNESS.');
    const option=(flag,fallback)=>args.includes(flag)?Number(args[args.indexOf(flag)+1]):fallback;
    const report=minimizeRun(args[1],args[2],{helpUsed:requireHelp(),seed:option('--seed',1),maxReplays:option('--budget',80),maxMillis:option('--max-ms',10000)});
    console.log(`Saved ${report.directory}\nActions ${report.originalCounts.actions} → ${report.reducedCounts.actions}; initial versions ${report.originalCounts.initial} → ${report.reducedCounts.initial}.\n${report.status}; ${report.stopReason}; ${report.replays} replays.\nSame failure: ${report.failureSha256}\nUse show-witness to read the trace and replay-witness to verify both executions.`);
  } else if (command === 'replay-witness') {
    if(!args[1])throw Error('Use replay-witness WITNESS.');
    const helpUsed=requireHelp();console.log(JSON.stringify({...replayWitness(args[1]),helpUsed},null,2));
  } else if (command === 'show-witness') {
    if(!args[1])throw Error('Use show-witness WITNESS.');console.log(showWitness(args[1]));
  } else if (command === 'export') {
    const dir = project(args[1]), out = resolve(args[2] ?? ''); if (!args[2] || existsSync(out)) throw Error('Choose a new export directory.');
    if (inside(realpathSync(dir), out) || inside(realpathSync(root), out)) throw Error('Export outside the source course and project to prevent recursive copies.');
    mkdirSync(out, { recursive: true });
    for (const name of ['LICENSE.md', 'LICENSES', 'README.md', 'CONTRACTS.md', 'PROJECTS.md', 'WITNESSES.md', 'WORKSHOP.md', 'SOURCES.md', 'index.html', 'browser-policy-checks.mjs', 'lab.mjs', 'check-runner.mjs', 'assessment-runner.mjs', 'checks.mjs', 'investigation.mjs', 'witness.mjs', 'witness-worker.mjs', 'workshop.mjs', 'workshop-worker.mjs', 'workshop-templates.mjs', 'practice.json', 'runtime', 'starter', 'lessons']) cpSync(join(root, name), join(out, name), { recursive: true, dereference: false, errorOnExist: true });
    cpSync(dir, join(out, 'work'), { recursive: true, dereference: false, errorOnExist: true });
    save(join(out, 'EXPORT.json'), { format: 'advanced-storage-export-v1', at: new Date().toISOString(), sourceSha256: hash(readFileSync(join(dir, 'engine.mjs'))), executionIdentity: executionIdentity(), replay: 'node lab.mjs check work 07 --help-used "export replay"', note: 'Historical reports remain historical. Rechecking creates a new attempt.' });
    console.log(`Exported ${out}. Instructor solutions are outside the delivery allowlist.`);
  } else usage();
} catch (error) { console.error(error.message); process.exitCode = 2; }
