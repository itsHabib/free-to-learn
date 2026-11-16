// Verify the literal lesson snippets and the diagnostic fixtures, not learner completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { equivalent } from './runtime.mjs';
import { observationProbes } from './examples/01-observations.mjs';

const lesson = await readFile(new URL('./lessons/01.md', import.meta.url), 'utf8');
function snippet(name) {
  const marker = `<!-- example: ${name} -->\n\x60\x60\x60js\n`;
  assert.equal(lesson.split(marker).length, 2, `unique ${name} snippet`);
  return lesson.split(marker)[1].split('\n```')[0];
}
const code = `${snippet('same-events')}\n${snippet('compare-scaffold')}\nexport { sameEvents };`;
const { sameEvents, compare } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('walked event helper preserves order, type, value and duplicates', () => {
  const a = { type: 'i8', value: '2' }, b = { type: 'i8', value: '5' };
  assert.equal(sameEvents([], []), true);
  assert.equal(sameEvents([a, b], structuredClone([a, b])), true);
  assert.equal(sameEvents([a, b], [b, a]), false);
  assert.equal(sameEvents([a, a], [a]), false);
  assert.equal(sameEvents([a], [{ type: 'i32', value: '2' }]), false);
  assert.equal(sameEvents([a], [b]), false);
});

test('scaffold rejects incomplete results and retains learner-owned TODO', () => {
  for (const kind of ['unknown', 'invalid']) assert.equal(compare({ kind }, { kind }), false);
  const done = { kind: 'return', type: 'i8', value: '2', heap: {}, events: [] };
  assert.equal(compare(done, { kind: 'trap', code: 'bounds', heap: {}, events: [] }), false);
  assert.equal(compare(done, { ...done, events: [{ type: 'i8', value: '2' }] }), false);
  assert.throws(() => compare(done, structuredClone(done)), /TODO U01: compare completion fields and the whole heap/);
});

test('probe observations come from a completed store/emit kernel and trap', () => {
  const probes = observationProbes();
  const returned = probes[0][1], trapped = probes.find(([label]) => label === 'same trap after a store')[1];
  assert.equal(returned.kind, 'return');
  assert.equal(returned.value, '6');
  assert.deepEqual(returned.heap.A.cells, ['6', '1']);
  assert.deepEqual(returned.events, [{ type: 'i8', value: '6' }]);
  assert.equal(trapped.kind, 'trap');
  assert.deepEqual(trapped.heap, returned.heap);
  assert.deepEqual(trapped.events, returned.events);
  for (const [label, left, right, expected] of probes) assert.equal(equivalent(left, right), expected, label);
});

test('offline reader displays the same walked code and retains every later unit', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const encode = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
  for (const name of ['same-events', 'compare-scaffold']) assert.ok(page.includes(`<pre><code>${encode(snippet(name))}</code></pre>`), name);
  for (let unit = 1; unit <= 9; unit += 1) assert.equal(page.split(`id="unit-${String(unit).padStart(2, '0')}"`).length, 2);
});
