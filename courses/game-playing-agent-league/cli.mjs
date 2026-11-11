#!/usr/bin/env node
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {readJournal, appendRecord, exportJournal, importJournal, flattenedRecords, latestAttempt, assistanceFor, questionHash} from './lib/journal.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
// Reliability limit for JavaScript heaps, not an OS memory or security boundary.
const WORKER_LIMITS={maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:32,stackSizeMb:4};
const hash = source => createHash('sha256').update(source).digest('hex');
const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
function option(name, fallback = undefined) {
  const position = args.indexOf(`--${name}`);
  if (position < 0) return fallback;
  if (position === args.length - 1 || args[position + 1].startsWith('--')) throw new Error(`--${name} needs a value.`);
  return args[position + 1];
}
const journalPath = resolve(option('journal', join(ROOT, 'work', 'attempts.json')));
const print = value => process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n');
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));

async function catalog() {
  const lessons = [];
  for (const file of ['lesson-index.json', 'advanced-index.json', 'capstone-index.json']) {
    try {
      const value = await readJSON(join(ROOT, 'lessons', file));
      lessons.push(...(Array.isArray(value) ? value : value.lessons));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return lessons.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
}
async function itemById(id) {
  const lessons = await catalog();
  for (const lesson of lessons) {
    if (lesson.id === id && lesson.question) return {...lesson, lessonId: lesson.id};
    const items = [...(lesson.practice ?? []), ...(lesson.items ?? [])];
    if (lesson.prediction && typeof lesson.prediction === 'object') items.push(lesson.prediction);
    const item = items.find(candidate => candidate.id === id);
    if (item) return {...item, lessonId: lesson.id};
  }
  throw new Error(`Unknown practice item ${id}. Use node cli.mjs list and read its lesson.`);
}
async function practiceFeedback(id, kind) {
  const item = await itemById(id);
  const document = await readJournal(journalPath);
  const attempt = latestAttempt(document, id);
  if (!attempt) throw new Error(`Commit your own response first: node cli.mjs attempt ${id} --answer 'your answer'`);
  if (attempt.data.questionHash !== questionHash(item)) throw new Error('This question changed after your saved attempt. Read the current question and commit a new response. The original question and answer remain preserved.');
  const feedback = {};
  for (const file of ['practice-feedback.json', 'advanced-feedback.json', 'capstone-feedback.json']) {
    try { Object.assign(feedback, await readJSON(join(ROOT, file))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const entry = feedback[id] ?? feedback.items?.[id];
  if (!entry) throw new Error(`Feedback for ${id} is unavailable. Your attempt is saved.`);
  if (kind === 'hint') {
    const level = Number(option('level', '1'));
    if (![1, 2, 3].includes(level)) throw new Error('Hint level must be 1, 2 or 3.');
    const content = entry.hints?.[level - 1];
    if (!content) throw new Error(`No level-${level} hint is available for ${id}.`);
    await appendRecord(journalPath, 'hint', {itemId: id, questionHash: questionHash(item), attemptId: attempt.id, level, content});
    print(`Saved hint exposure (level ${level}). Subsequent attempts record this assistance.\n\n${content}`);
    return;
  }
  await appendRecord(journalPath, 'feedback', {itemId: id, questionHash: questionHash(item), attemptId: attempt.id, feedbackHash: hash(JSON.stringify(entry)),content:entry});
  print(`Your committed response:\n${attempt.data.response}\n\nCompare with:\n${entry.answer}\n\nWhy:\n${entry.reason}`);
  if (entry.rubric?.length) print('Self-check criteria:\n' + entry.rubric.map(line => `- ${line}`).join('\n'));
  print('\nThis is practice feedback, not an automatic grade of your reasoning. Revise with another attempt; your first response remains saved.');
}
async function checkLearner(module) {
  if (module === 'baseline') module = '1';
  if (!['1', '2', '3', '4', '5', '6', 'evaluation', 'search'].includes(module)) throw new Error('Use check 1 through check 6, or baseline/evaluation/search.');
  const fileGroups = {'1':['baseline.mjs'], '2':['evaluation.mjs','search.mjs'], evaluation:['evaluation.mjs'], search:['evaluation.mjs','search.mjs'], '3':['value-model.mjs'], '4':['report.mjs'], '5':['opponent-sampler.mjs'], '6':['vulnerability.mjs']};
  const files = fileGroups[module];
  const snapshots = [];
  for (const file of files) {
    const path = join(ROOT, 'learner', file);
    const source = await readFile(path, 'utf8');
    snapshots.push({file, source, sha256: hash(source)});
  }
  const {captureSourceBundle}=await import('./lib/league-config.mjs');
  const dependencies=await captureSourceBundle(ROOT);
  const committed = await appendRecord(journalPath, 'code-attempt', {module, files: snapshots,dependencyManifest:dependencies.codeManifest,dependencySources:dependencies.codeBundle});
  const result = await new Promise(resolveResult => {
    const worker = new Worker(new URL('./lib/check-worker.mjs', import.meta.url), {workerData: {root: ROOT, module}, stdout: true, stderr: true, resourceLimits:WORKER_LIMITS});
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolveResult(value);
    };
    const timer = setTimeout(() => finish({ok: false, error: 'The check exceeded 8 seconds and was stopped. Inspect your loops or recursion. This interruption is not a game loss.', interrupted: true}), 8000);
    worker.once('message', finish);
    worker.once('error', error => finish({ok: false, error: error.message}));
    worker.once('exit', code => finish({ok: false, error: `Check worker exited before returning a result (code ${code}).`}));
    worker.stdout.resume();
    worker.stderr.resume();
  });
  for (const snapshot of snapshots) {
    const currentSource = await readFile(join(ROOT, 'learner', snapshot.file), 'utf8');
    if (hash(currentSource) !== snapshot.sha256) {
      result.ok = false;
      result.sourceChanged = `The file ${snapshot.file} changed during the check. This result cannot qualify the saved attempt. Run the check again.`;
    }
  }
  const afterDependencies=await captureSourceBundle(ROOT);
  if(JSON.stringify(afterDependencies.codeManifest)!==JSON.stringify(dependencies.codeManifest)) {
    result.ok=false;
    result.sourceChanged='A captured local dependency changed during the check. Repeat with a stable source version.';
  }
  await appendRecord(journalPath, 'code-feedback', {attemptId: committed.id, module, result});
  print(result);
  print(`\nSource attempt ${committed.id} and actual checker result saved. This is practice feedback, not full-course acceptance.`);
  if (!result.ok) process.exitCode = 1;
}
async function playDemo() {
  const {generateScenario} = await import('./lib/game.mjs');
  const {snapshotPolicy, runMatch} = await import('./lib/runner.mjs');
  const supplied = await import('./lib/supplied-policies.mjs');
  const names = Object.keys(supplied);
  const random = supplied.randomPolicy ?? supplied.random ?? supplied.randomAction;
  const greedy = supplied.greedyPolicy ?? supplied.greedy ?? supplied.greedyAction;
  if (typeof random !== 'function' || typeof greedy !== 'function') throw new Error(`Supplied policy adapter needs review: ${names.join(', ')}`);
  const seed = Number(option('seed', '7'));
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  const policies = [snapshotPolicy({name: 'supplied-random', decide: random}), snapshotPolicy({name: 'supplied-greedy', decide: greedy})];
  const record = runMatch({policies, scenario: generateScenario(seed, 4), seed, budget: 256, planId: 'supplied-demo-v1'});
  const destination = resolve(option('out', join(ROOT, 'work', 'demo.json')));
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  print(`Supplied baseline demonstration saved to ${destination}.\nThis is not learner work. Open index.html and choose this file to inspect the replay.`);
  print(record.result ?? {status: record.status});
}
async function playLeague(configuration) {
  if(!configuration) throw new Error('Provide a league configuration, for example development-league.json.');
  const path=resolve(configuration);
  const configurationText=await readFile(path,'utf8');
  const committed=await appendRecord(journalPath,'league-attempt',{configuration:JSON.parse(configurationText),configurationHash:hash(configurationText)});
  const result=await new Promise(resolveResult=>{
    const worker=new Worker(new URL('./lib/league-worker.mjs',import.meta.url),{workerData:{root:ROOT,configuration:path},stdout:true,stderr:true,resourceLimits:WORKER_LIMITS});
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolveResult(value);};
    const timer=setTimeout(()=>finish({ok:false,error:'League exceeded the 60-second local run limit and was stopped. This is an incomplete run, not a scored loss. Reduce the development roster or inspect policy code.'}),60000);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error:error.message}));worker.once('exit',code=>finish({ok:false,error:`League worker stopped without a complete result (${code}).`}));
    worker.stdout.resume();worker.stderr.resume();
  });
  if(!result.ok){await appendRecord(journalPath,'league-result',{attemptId:committed.id,complete:false,error:result.error});throw new Error(result.error);}
  if(result.season.configurationHash!==hash(configurationText)||hash(await readFile(path,'utf8'))!==hash(configurationText)) {
    const error='League configuration changed during the run. Repeat with a frozen configuration.';
    await appendRecord(journalPath,'league-result',{attemptId:committed.id,complete:false,error});throw new Error(error);
  }
  const destination=resolve(option('out',join(ROOT,'work','season.json')));
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(result.season,null,2)+'\n',{flag:'wx'});
  await appendRecord(journalPath,'league-result',{attemptId:committed.id,complete:true,output:destination,seasonHash:hash(JSON.stringify(result.season)),matches:result.season.matches.length});
  print({saved:destination,matches:result.season.matches.length,partition:result.season.plan.partition,note:'Actual match records and source bundle saved. A development run is not final evaluation or full-course completion.'});
}

async function verifyRecord(filename) {
  if(!filename) throw new Error('Provide a match or season JSON file to verify.');
  const path = resolve(filename);
  const bytes = await readFile(path);
  const configuration = option('configuration');
  const result = await new Promise(resolveResult => {
    const worker = new Worker(new URL('./lib/verify-worker.mjs', import.meta.url), {workerData:{root:ROOT,record:path,configuration:configuration?resolve(configuration):null},stdout:true,stderr:true,resourceLimits:WORKER_LIMITS});
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolveResult(value);};
    const timer=setTimeout(()=>finish({ok:false,error:'Verification exceeded 60 seconds and was interrupted. No successful verification is claimed.'}),60000);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error:error.message}));worker.once('exit',code=>finish({ok:false,error:`Verification worker ended without a result (${code}).`}));
    worker.stdout.resume();worker.stderr.resume();
  });
  if(hash(await readFile(path)) !== hash(bytes)) {result.ok=false;result.error='The record changed during verification. Run the check again.';}
  await appendRecord(journalPath,'replay-verification',{input:path,inputHash:hash(bytes),result});
  print(result);
  if(!result.ok) process.exitCode=1;
}

async function makeReport(filename) {
  if(!filename) throw new Error('Provide a completed season JSON file.');
  const path=resolve(filename);
  const bytes=await readFile(path);
  const source=await readFile(join(ROOT,'learner/report.mjs'),'utf8');
  const committed=await appendRecord(journalPath,'report-attempt',{seasonHash:hash(bytes),source,sourceHash:hash(source)});
  const result=await new Promise(resolveResult=>{
    const worker=new Worker(new URL('./lib/report-worker.mjs',import.meta.url),{workerData:{root:ROOT,season:path},stdout:true,stderr:true,resourceLimits:WORKER_LIMITS});
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolveResult(value);};
    const timer=setTimeout(()=>finish({ok:false,error:'Report exceeded 8 seconds and was interrupted.'}),8000);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error:error.message}));worker.once('exit',code=>finish({ok:false,error:`Report worker ended without a result (${code}).`}));
    worker.stdout.resume();worker.stderr.resume();
  });
  if(hash(await readFile(path))!==hash(bytes)||hash(await readFile(join(ROOT,'learner/report.mjs'),'utf8'))!==hash(source)) {result.ok=false;result.error='Report source or season changed during execution. Try again.';}
  if(!result.ok){await appendRecord(journalPath,'report-result',{attemptId:committed.id,...result});throw new Error(result.error);}
  const destination=resolve(option('out',join(ROOT,'work','report.json')));
  await mkdir(dirname(destination),{recursive:true});
  const evidence={schemaVersion:1,type:'learner-league-report',seasonHash:hash(bytes),sourceHash:hash(source),codeManifest:result.codeManifest,codeBundle:result.codeBundle,report:result.report,scope:'Learner-produced interpretation. Passing public checks and independent evidence review are separate requirements.'};
  await writeFile(destination,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  await appendRecord(journalPath,'report-result',{attemptId:committed.id,ok:true,output:destination,reportHash:hash(JSON.stringify(evidence))});
  print({saved:destination,report:result.report,scope:evidence.scope});
}

async function train(configuration) {
  if(!configuration) throw new Error('Provide a training configuration, for example development-training.json.');
  const path=resolve(configuration),source=await readFile(path,'utf8');
  const committed=await appendRecord(journalPath,'training-attempt',{configuration:JSON.parse(source),configurationHash:hash(source)});
  const result=await new Promise(resolveResult=>{
    const worker=new Worker(new URL('./lib/training-worker.mjs',import.meta.url),{workerData:{root:ROOT,configuration:path},stdout:true,stderr:true,resourceLimits:WORKER_LIMITS});
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolveResult(value);};
    const timer=setTimeout(()=>finish({ok:false,error:'Training exceeded the 60-second local run limit and was interrupted. Reduce the development configuration or inspect your learner code. No completed training is claimed.'}),60000);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error:error.message}));worker.once('exit',code=>finish({ok:false,error:`Training worker ended without a result (${code}).`}));
    worker.stdout.resume();worker.stderr.resume();
  });
  if(!result.ok){await appendRecord(journalPath,'training-result',{attemptId:committed.id,complete:false,error:result.error});throw new Error(result.error);}
  if(result.training.configurationHash!==hash(source)||hash(await readFile(path,'utf8'))!==hash(source)) {
    const error='Training configuration changed during the run. Repeat with a frozen configuration.';
    await appendRecord(journalPath,'training-result',{attemptId:committed.id,complete:false,error});throw new Error(error);
  }
  const destination=resolve(option('out',join(ROOT,'work','training.json')));
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(result.training,null,2)+'\n',{flag:'wx'});
  await appendRecord(journalPath,'training-result',{attemptId:committed.id,complete:true,output:destination,trainingHash:hash(JSON.stringify(result.training)),generations:result.training.generations.length,totalCredits:result.training.totalCredits});
  print({saved:destination,generations:result.training.generations.length,matches:result.training.matches.length,totalCredits:result.training.totalCredits,note:'Learner functions produced these training artifacts. Qualify them with checks and held-out comparisons; generation count is not a strength score.'});
}

async function fitModel(filename) {
  if(!filename) throw new Error('Provide a completed season JSON file.');
  const path=resolve(filename),bytes=await readFile(path);
  const source=await readFile(join(ROOT,'learner/value-model.mjs'),'utf8');
  const committed=await appendRecord(journalPath,'fit-attempt',{seasonHash:hash(bytes),source,sourceHash:hash(source)});
  const result=await new Promise(resolveResult=>{
    const worker=new Worker(new URL('./lib/fit-worker.mjs',import.meta.url),{workerData:{root:ROOT,season:path},stdout:true,stderr:true,resourceLimits:WORKER_LIMITS});
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolveResult(value);};
    const timer=setTimeout(()=>finish({ok:false,error:'Value fitting exceeded 15 seconds and was interrupted. Inspect the fit loop.'}),15000);
    worker.once('message',finish);worker.once('error',error=>finish({ok:false,error:error.message}));worker.once('exit',code=>finish({ok:false,error:`Fitting worker ended without a result (${code}).`}));
    worker.stdout.resume();worker.stderr.resume();
  });
  if(!result.ok){await appendRecord(journalPath,'fit-result',{attemptId:committed.id,complete:false,error:result.error});throw new Error(result.error);}
  if(hash(await readFile(path))!==hash(bytes)||result.model.seasonHash!==hash(bytes)||hash(await readFile(join(ROOT,'learner/value-model.mjs'),'utf8'))!==hash(source)) {
    const error='Fitting input or learner source changed during the run. Repeat with a stable version.';
    await appendRecord(journalPath,'fit-result',{attemptId:committed.id,complete:false,error});
    throw new Error(error);
  }
  const destination=resolve(option('out',join(ROOT,'work','value-model.json')));
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(result.model,null,2)+'\n',{flag:'wx'});
  await appendRecord(journalPath,'fit-result',{attemptId:committed.id,complete:true,output:destination,modelHash:hash(JSON.stringify(result.model))});
  print({saved:destination,trainingMetrics:result.model.model.trainingMetrics,validationMetrics:result.model.model.validationMetrics,scope:result.model.scope});
}

async function assembleRoster(filename) {
  if(!filename) throw new Error('Provide a fitted value-model or population-training artifact.');
  const destination=resolve(option('out',join(ROOT,'work','candidate-league.json')));
  const {makeDevelopmentRoster}=await import('./lib/roster.mjs');
  const config=await makeDevelopmentRoster(resolve(filename),destination,ROOT);
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  print({saved:destination,policies:config.policies.length,partition:config.partition,next:`node cli.mjs league ${destination} --out ./work/candidate-season.json`,note:config._note});
}

async function main() {
  if (command === 'doctor') {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 22) throw new Error(`Node 22+ required; found ${process.version}.`);
    print({ok: true, node: process.version, platform: process.platform, architecture: process.arch, dependencies: 'none', course: 'local course candidate 0.1.1', note: 'This validates runtime availability, not your agent or course completion.'});
    return;
  }
  if (command === 'list') {
    for (const lesson of await catalog()) print(`${lesson.id}  ${lesson.title}`);
    print('\nRead: node cli.mjs lesson 1.1\nCode checks: node cli.mjs check 1 through check 6\nAll navigation is unlocked.');
    return;
  }
  if (command === 'lesson') {
    const lesson = (await catalog()).find(value => value.id === args[0]);
    if (!lesson) throw new Error('Unknown lesson. Use node cli.mjs list.');
    print(await readFile(join(ROOT, 'lessons', lesson.file), 'utf8'));
    return;
  }
  if (command === 'question') {
    const item = await itemById(args[0]);
    print(`${item.id}\n${item.question}\n\nCommit: node cli.mjs attempt ${item.id} --answer 'your response'`);
    return;
  }
  if (command === 'attempt') {
    const item = await itemById(args[0]);
    const response = option('answer');
    if (!response?.trim()) throw new Error('Supply a nonempty --answer.');
    if (Buffer.byteLength(response) > 32000) throw new Error('Answer exceeds 32,000 bytes. Save code through check instead.');
    const confidence = option('confidence', 'unspecified');
    if (!['low', 'medium', 'high', 'unspecified'].includes(confidence)) throw new Error('Confidence must be low, medium or high.');
    const current = await readJournal(journalPath);
    const attempt = await appendRecord(journalPath, 'attempt', {itemId: item.id, lessonId: item.lessonId, question: item.question, questionHash: questionHash(item), response, confidence, assistanceBefore: assistanceFor(current, item.id)});
    print(`Attempt saved: ${attempt.id}\nYour answer and prior assistance are preserved.\nNext: node cli.mjs feedback ${item.id}`);
    return;
  }
  if (command === 'feedback' || command === 'hint') return practiceFeedback(args[0], command);
  if (command === 'check') return checkLearner(args[0]);
  if (command === 'demo') return playDemo();
  if (command === 'league') return playLeague(args[0]);
  if (command === 'verify') return verifyRecord(args[0]);
  if (command === 'report') return makeReport(args[0]);
  if (command === 'train') return train(args[0]);
  if (command === 'fit') return fitModel(args[0]);
  if (command === 'roster') return assembleRoster(args[0]);
  if (command === 'history') {
    const records = flattenedRecords(await readJournal(journalPath));
    print(records.map(record => ({id: record.id, type: record.type, createdAt: record.createdAt, item: record.data.itemId ?? record.data.module, response: record.data.response, assistanceBefore: record.data.assistanceBefore})));
    return;
  }
  if (command === 'export') {
    if (!args[0]) throw new Error('Provide a new destination file. Existing exports are never overwritten.');
    const count = await exportJournal(journalPath, resolve(args[0]));
    print(`Exported ${count} top-level records to ${resolve(args[0])}.`);
    return;
  }
  if (command === 'import') {
    if (!args[0]) throw new Error('Provide an exported journal file.');
    print(await importJournal(journalPath, resolve(args[0])));
    return;
  }
  print(`Agent League — local course candidate

Read and practice:
  node cli.mjs doctor
  node cli.mjs list
  node cli.mjs lesson 1.1
  node cli.mjs question 1.1-p1
  node cli.mjs attempt <item> --answer "your response" --confidence medium
  node cli.mjs feedback <item>
  node cli.mjs hint <item> --level 1
  node cli.mjs check <1|2|3|4|5|6|evaluation|search>

Play, learn and inspect:
  node cli.mjs demo --seed 7 --out ./work/demo.json
  node cli.mjs league development-league.json --out ./work/season.json
  node cli.mjs verify ./work/season.json --configuration development-league.json
  node cli.mjs fit ./work/season.json --out ./work/model.json
  node cli.mjs train development-training.json --out ./work/training.json
  node cli.mjs roster ./work/training.json --out ./work/population-league.json
  node cli.mjs report ./work/season.json --out ./work/report.json

Keep work:
  node cli.mjs history
  node cli.mjs export ./my-attempts.json
  node cli.mjs import ./my-attempts.json

Use --journal /path/to/journal.json for a separate work history.
Output files must be new names; existing work is never overwritten.
No server, account, model API or package installation is needed.`);
}

main().catch(error => { process.stderr.write(`Error: ${error.message}\n`); process.exitCode = 1; });
