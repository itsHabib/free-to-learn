// Regression tests for the public checks and their learner-facing feedback.
// Wrong implementations are derived from the already-public support layers by one-line edits; no new solution is added.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {execute} from './worker.mjs';
import {progressSummary,resultHtml,resultText} from './feedback.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const support = JSON.parse(await read('support/10.json'));
const starter = Object.fromEntries(await Promise.all(['observe.mjs', 'constraints.mjs', 'rules.mjs', 'adapter.mjs', 'confidence.mjs', 'evaluate.mjs', 'schedule.mjs', 'director.mjs', 'scenarios.json', 'project-plan.json', 'REPORT.md'].map(async n => [n, await read('starter/' + n)])));
const supplied = {...starter, ...support};

function edit(source, from, to) {
  assert.ok(source.includes(from), 'test fixture edit no longer applies: ' + from);
  return source.replace(from, to);
}
const check = (unit, sources, variant = 0) => execute({task: 'check', unit, variant, sources});
const failed = result => result.results.filter(r => !r.pass);

test('supplied correct layers pass units 05 and 07 in both public variants', async () => {
  for (const unit of ['05', '07']) for (const variant of [0, 1]) {
    const result = await check(unit, supplied, variant);
    assert.equal(result.passed, true, unit + ' v' + variant + ': ' + failed(result).map(r => r.message).join(' | '));
  }
});

test('unit 05 rejects a pooled row rate used as p, naming the rule and lesson', async () => {
  const pooled = edit(support['confidence.mjs'], 'p=rates.length?rates.reduce((a,b)=>a+b,0)/rates.length:null', 'p=xs.length?yes/xs.length:null');
  for (const variant of [0, 1]) {
    const result = await check('05', {...supplied, 'confidence.mjs': pooled}, variant);
    assert.equal(result.passed, false);
    const labels = failed(result).map(r => r.label);
    assert.deepEqual(labels, ['Episodes are weighted equally, not by row count', 'Selection follows equal-episode evidence, not pooled rows']);
    for (const r of failed(result)) {
      assert.match(r.message, /p averages each participating episode's event fraction equally/);
      assert.match(r.message, /Reread lessons\/05\.md · Fit a domain table on separate episodes\./);
    }
  }
});

test('unit 07 rejects now > deadline, naming the rule and lesson', async () => {
  const strict = edit(support['schedule.mjs'], 'if(now>=ticket.deadline)', 'if(now>ticket.deadline)');
  for (const variant of [0, 1]) {
    const result = await check('07', {...supplied, 'schedule.mjs': strict}, variant);
    assert.equal(result.passed, false);
    const [only, ...rest] = failed(result);
    assert.equal(rest.length, 0);
    assert.equal(only.label, 'A result exactly at the deadline has timed out');
    assert.match(only.message, /At the deadline itself, the result is timed out/);
    assert.match(only.message, /now >= deadline/);
    assert.match(only.message, /Reread lessons\/07\.md · Let fallback win exactly once\./);
  }
});

test('unit 07 rejects an episode reset at the same revision and an accepted failure', async () => {
  const revisionOnly = edit(support['schedule.mjs'], 'ticket.episodeId!==current.episodeId||', '');
  const result = await check('07', {...supplied, 'schedule.mjs': revisionOnly});
  assert.deepEqual(failed(result).map(r => r.label), ['A new episode at the same revision and a failed response are not accepted']);
  assert.match(failed(result)[0].message, /An episode ID check must reject the original answer even though revisions match/);
});

test('unit 05 counts episodes, not rows, for the ten-episode minimum', async () => {
  const rows = edit(support['confidence.mjs'], 'bin.episodes<10', 'bin.n<10');
  const result = await check('05', {...supplied, 'confidence.mjs': rows});
  assert.deepEqual(failed(result).map(r => r.label), ['Selection needs ten distinct episodes and a supported lower bound']);
  assert.match(failed(result)[0].message, /at least ten distinct episodes/);
});

test('an all-rest rules policy fails unit 03 with counts in course terms', async () => {
  const allRest = "export function chooseRules(o,memory={}){return {action:{kind:'rest'},memory:{recovering:false},reason:'rest',origin:'rules'};}\n";
  const result = await check('03', {...supplied, 'rules.mjs': allRest});
  const [baseline] = failed(result);
  assert.equal(baseline.label, 'Useful baseline across 12 development episodes');
  assert.match(baseline.message, /completed 0 of 12 development episodes/);
  assert.match(baseline.message, /charge of 12 or more/);
  assert.match(baseline.message, /Reread lessons\/03\.md · Choose a useful comparison\./);
  assert.doesNotMatch(baseline.message, /actual: false/);
});

test('every failing case in units 01, 03, 06, 08, 09 and 10 explains itself', async () => {
  const broken = {
    ...supplied,
    'observe.mjs': edit(support['observe.mjs'], 'pressure:', 'seed:s.seed,pressure:'),
    'rules.mjs': "import {allowedActions} from './constraints.mjs';\nexport function chooseRules(o,memory={}){return {action:{kind:'rest'},memory:{recovering:false},reason:'rest',origin:'rules'};}\n",
    'evaluate.mjs': edit(support['evaluate.mjs'], 'auditEpisode(ep);', ''),
    'director.mjs': edit(support['director.mjs'], 'export function restore(record,identities) {', 'export function restore(record,identities) {return {state:record.state,memory:record.memory,scheduler:{...record.scheduler,pending:null,armed:false}};'),
    'scenarios.json': JSON.stringify({version: 1, cases: [{id: 'a', hypothesis: 'h', health: 8, budget: 5, damageA: [0, 0, 0], damageB: [4, 4, 4]}, {id: 'b', hypothesis: 'h', health: 9, budget: 5, damageA: [0, 0, 0], damageB: [1, 1, 1]}]}),
    'project.mjs': "export function policy(state,memory={}){return {action:{kind:'rest'},memory,reason:'rest',origin:'rules',calls:0};}\n",
  };
  for (const unit of ['01', '03', '06', '08', '09', '10']) {
    const result = await check(unit, broken);
    assert.equal(result.passed, false, unit + ' should fail with deliberately broken files');
    for (const r of failed(result)) {
      assert.ok(typeof r.message === 'string' && r.message.length > 40, unit + ' ' + r.label + ' has no explanation');
      assert.match(r.message, new RegExp('Reread lessons/' + unit + '\\.md · '), unit + ' ' + r.label);
      assert.doesNotMatch(r.message, /^.*: observed false, expected true\./, unit + ' ' + r.label + ' fell back to a bare true/false message');
    }
  }
});

test('the starter still reports the documented TODO diagnostic for unit 01', async () => {
  const result = await check('01', starter);
  assert.equal(result.passed, false);
  assert.match(JSON.stringify(result), /TODO: implement observe/);
  assert.ok(failed(result).every(r => /Reread lessons\/01\.md/.test(r.message)));
});

test('play --help exits 0 and documents --bot', () => {
  const run = spawnSync(process.execPath, ['lab.mjs', 'play', '--help'], {cwd: here, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Usage: node lab\.mjs play DIR/);
  assert.match(run.stdout, /--bot fixed\|cautious\|aggressive/);
  assert.match(run.stdout, /--mode rules\|project/);
  assert.doesNotMatch(run.stdout + run.stderr, /chooseRules/);
});

test('progress never appears to shrink after an edit', () => {
  const pass = (unit, sourceHash) => ({sourceHash, build: 'b', result: {unit, passed: true}});
  assert.match(progressSummary([], 'h1', 'b').text, /No unit check has passed yet/);
  const attempts = [pass('01', 'h1'), pass('02', 'h2'), {sourceHash: 'h2', build: 'b', result: {choice: 1, passed: true}}];
  const afterSecond = progressSummary(attempts, 'h2', 'b');
  assert.deepEqual([afterSecond.ever, afterSecond.current, afterSecond.recheck], [['01', '02'], ['02'], ['01']]);
  assert.equal(afterSecond.text, 'Units passed at least once: 2 of 10 (01, 02). Passing with your current files: 02. Recheck after your latest edit: 01. Earlier passes stay in your history.');
  const afterEdit = progressSummary(attempts, 'h3', 'b');
  assert.equal(afterEdit.text, 'Units passed at least once: 2 of 10 (01, 02). None has been checked since your latest edit. Recheck after your latest edit: 01, 02. Earlier passes stay in your history.');
  const rechecked = progressSummary([...attempts, pass('01', 'h3'), pass('02', 'h3')], 'h3', 'b');
  assert.equal(rechecked.text, 'Units passed at least once: 2 of 10 (01, 02). All of them pass with your current files.');
  assert.deepEqual(progressSummary([pass('01', 'h1')], 'h1', 'other-build').recheck, ['01']);
});

test('result rendering lists each case with its verdict and escapes learner text', () => {
  const result = {unit: '07', variant: 0, passed: false, results: [
    {label: 'Kept <b>', pass: true, repair: 'lessons/07.md'},
    {label: 'Tie', pass: false, message: 'Observed <script>. Reread lessons/07.md.', section: 'lessons/07.md · Let fallback win exactly once'},
  ]};
  const html = resultHtml(result);
  assert.equal((html.match(/<li class="case /g) || []).length, 2);
  assert.match(html, /1 of 2 cases passed/);
  assert.match(html, /Kept &lt;b&gt;/);
  assert.match(html, /Observed &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(resultText(result), /FAIL Tie\n {5}Observed <script>/);
  const legacy = resultHtml({unit: '01', variant: 0, passed: false, results: [{label: 'Old', pass: false, actual: false, expected: true}]});
  assert.match(legacy, /Observed false, expected true/);
});
