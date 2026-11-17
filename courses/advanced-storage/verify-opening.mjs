// Maintainer check: displayed code and probe plumbing, not a learner solution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { probeSnapshots } from './snapshot-probe.mjs';
import { buildEngine } from './starter/engine.mjs';
import { BaseEngine } from './runtime/base.mjs';
import { runChecks } from './checks.mjs';

const lesson = readFileSync(new URL('./lessons/01.md', import.meta.url), 'utf8');
const reader = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('./snapshot-probe.mjs', import.meta.url), 'utf8');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
function excerpt(name) {
  const marker = `<!-- opening-code: ${name} -->\n\x60\x60\x60js\n`;
  const start = lesson.indexOf(marker);
  assert.notEqual(start, -1, `Missing lesson excerpt: ${name}`);
  const code = lesson.slice(start + marker.length).split('\n```')[0];
  assert.ok(reader.includes(`<pre><code>${escape(code)}</code></pre>`), `Reader drift: ${name}`);
  return code;
}

const scaffold = excerpt('visibility-scaffold');
const scaffoldPolicy = runInNewContext(`({${scaffold}})`);
const seen = [];
assert.throws(() => scaffoldPolicy.visibleVersion([{ csn: 3 }], 3, v => seen.push(v.csn)), /Unfinished: choose a version/);
assert.deepEqual(seen, [3]);
const observeCode = excerpt('observe-snapshot');
assert.ok(source.includes(observeCode), 'Displayed observation helper differs from executable source.');
const observe = runInNewContext(`(${observeCode})`);
for (const version of [null, { csn: 8, row: null }, { csn: 9, row: { value: 0 } }]) {
  const history = [{ csn: 8 }];
  const result = observe({ visibleVersion(h, snapshot, examine) {
    assert.equal(h, history); assert.equal(snapshot, 8); examine(h[0]); return version;
  } }, 'probe', history, 8);
  assert.equal(JSON.stringify(result), JSON.stringify({ label: 'probe', snapshot: 8,
    version: version === null ? null : { csn: version.csn, value: version.row?.value ?? null }, examined: [8] }));
}

// A spy checks the probe's independent variable, history growth, and callbacks.
// It intentionally has no visibility implementation and returns no row.
const calls = [];
const observations = probeSnapshots(() => class {
  visibleVersion(history, snapshot, examine) {
    assert.ok(Object.isFrozen(history));
    assert.ok(history.every(v => Object.isFrozen(v) && (v.row === null || Object.isFrozen(v.row))));
    calls.push([snapshot, history.map(v => v.csn)]);
    for (const version of history) examine(version);
    return null;
  }
});
assert.deepEqual(calls, [[2, [3]], [3, [3]], [3, [3, 8]], [8, [3, 8]], [3, [3, 8, 9]], [9, [3, 8, 9]]]);
assert.deepEqual(observations.map(o => o.label), ['before-insert', 'old-before-delete', 'old-after-delete', 'fresh-after-delete', 'old-after-reinsert', 'fresh-after-reinsert']);
assert.deepEqual(observations.map(o => o.examined), calls.map(c => c[1]));
assert.throws(() => probeSnapshots(buildEngine), /Unfinished: 01 visibleVersion/);

// Execute the displayed copy-and-run entry without writing into a learner project.
const entry = excerpt('probe-entry');
assert.ok(entry.startsWith("import { buildEngine } from './engine.mjs';\n"));
let displayed;
runInNewContext(entry.split('\n').slice(1).join('\n'), {
  buildEngine, probeSnapshots: builder => { assert.equal(builder, buildEngine); return observations; },
  console: { log: text => { displayed = JSON.parse(text); } }
});
assert.deepEqual(displayed, observations);
const starter = runChecks(buildEngine(BaseEngine), 1);
assert.equal(starter.total, 7);
assert.equal(starter.failures, 6);
assert.ok(starter.results.filter(r => !r.passed).every(r => r.message.includes('Unfinished: 01 visibleVersion')));
console.log('PASS: three displayed excerpts execute; reader/source match; six probe observations use the intended frozen histories and snapshots; starter retains 6/7 expected failures.');
