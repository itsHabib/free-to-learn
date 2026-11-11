import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateCorpus } from '../evaluation/corpus.mjs';
import { createPredictionStore } from '../public/prediction-notebook.js';

function memory() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: index => [...entries.keys()][index], getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
const subject = { id: 'timing/pause', version: 1, question: 'Predict the tick at 826.5 ms.', inputs: { times: [826.5, 850] } };

test('first answers and exact prompt snapshots survive revision, exposure, new instances and question versions', () => {
  const storage = memory();
  let serial = 0;
  const open = () => createPredictionStore(storage, () => `entry-${++serial}`, () => '2026-10-16T12:00:00.000Z');
  const store = open();
  store.append(subject, { kind: 'answer', answer: 'The pause processes every missed tick.' });
  store.append(subject, { kind: 'reveal', mode: 'prediction' });
  subject.inputs.times.push(900);
  open().append(subject, { kind: 'answer', answer: 'Revision: catch-up is bounded.' });
  const saved = open().forCase(subject);
  assert.equal(saved.length, 3);
  assert.equal(saved[0].answer, 'The pause processes every missed tick.');
  assert.deepEqual(saved[0].case.inputs.times, [826.5, 850]);
  assert.equal(saved[0].priorExposure, false);
  assert.equal(saved[2].priorExposure, true);
  assert.equal(saved[2].answer, 'Revision: catch-up is bounded.');
  assert.deepEqual(open().forCase({ ...subject, version: 2 }), []);
});

test('worked-example exposure never creates a prediction and survives reload before a first answer', () => {
  const storage = memory();
  const store = createPredictionStore(storage, () => 'worked');
  store.append(subject, { kind: 'reveal', mode: 'worked-example' });
  const reloaded = createPredictionStore(storage, () => 'later');
  reloaded.append(subject, { kind: 'answer', answer: 'After reading the worked result.' });
  const saved = reloaded.forCase(subject);
  assert.equal(saved.filter(event => event.kind === 'answer').length, 1);
  assert.equal(saved[1].priorExposure, true);
  assert.equal(saved[0].mode, 'worked-example');
});

test('failed or unverifiable writes report failure without replacing saved work', () => {
  const storage = memory();
  createPredictionStore(storage, () => 'first').append(subject, { kind: 'answer', answer: 'Keep this.' });
  const before = createPredictionStore(storage).read();
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => createPredictionStore(storage, () => 'second').append(subject, { kind: 'reveal', mode: 'prediction' }), /Quota/);
  assert.deepEqual(createPredictionStore(storage).read(), before);
  storage.setItem = () => {};
  assert.throws(() => createPredictionStore(storage, () => 'third').append(subject, { kind: 'reveal', mode: 'prediction' }), /verified/);
  assert.deepEqual(createPredictionStore(storage).read(), before);
});

test('existing malformed entries are not silently discarded or overwritten', () => {
  const storage = memory();
  storage.setItem('courier-predictions-v1:old', '{');
  assert.throws(() => createPredictionStore(storage, () => 'new').append(subject, { kind: 'answer', answer: 'new' }));
  assert.equal(storage.length, 1);
  assert.equal(storage.getItem('courier-predictions-v1:old'), '{');
});

// The browser's input-only fixture must stay aligned with the source that produced saved results.
test('browser evaluation inputs retain the exact corpus labels and signals', async () => {
  const source = await readFile(new URL('../public/analysis.js', import.meta.url), 'utf8');
  const snapshot = JSON.parse(source.match(/const evaluationInputs = ([\s\S]*);\s*$/)[1]);
  const expected = generateCorpus().cases.map(({ id, split, label, signals }) => ({ id, split, label, signals }));
  assert.deepEqual(snapshot, expected);
});
