import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { grade } from '../learning/grade.mjs';
import { createLearningService, saveAtomic } from '../learning/service.mjs';
import { modules } from './learning-fixtures.mjs';
import { withServer } from './harness.mjs';
import { issueItem, loadUnits, newSession } from '../learning/runtime.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ivy-learning-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let seed = 100;
  const service = createLearningService({ modules, directory, nextSeed: () => ++seed, ...options });
  const state = await service.request('/learning/session');
  const call = (name, input = {}) => service.request(`/learning/${name}`, { sessionId: state.sessionId, ...input });
  const item = (mode = 'practice') => call('item', { unitId: 'spatial', key: 'boundary', mode });
  return { directory, service, state, call, item };
}

test('JSON compares structure, exact numeric default, explicit tolerance, and choice values', () => {
  const json = { format: { type: 'json' }, expected: { a: [1, 2], b: null } };
  assert.equal(grade(json, '{"b":null,"a":[1,2]}').correct, true);
  for (const answer of ['{"a":[1,2]}', '{"a":[1,2],"b":null,"extra":1}', '{"a":[2,1],"b":null}', '{"a":["1",2],"b":null}']) assert.equal(grade(json, answer).correct, false);
  assert.equal(grade(json, '{oops').status, 'format-error');
  const number = { format: { type: 'number' }, expected: 5 };
  assert.equal(grade(number, '5.0001').correct, false);
  assert.equal(grade({ ...number, tolerance: 0.01 }, '5.0001').correct, true);
  for (const answer of ['', 'Infinity', '5ms', '0x05']) assert.equal(grade(number, answer).status, 'format-error');
  const choice = { format: { type: 'choice', options: [{ value: 'a' }, { value: 'b' }] }, expected: 'b' };
  assert.equal(grade(choice, 'b').correct, true);
  assert.equal(grade(choice, 'a').correct, false);
  assert.equal(grade(choice, 'B').status, 'format-error');
});

test('only saved commits reveal keys; exact prompts, inputs, raw answers, and revisions survive restart', async (t) => {
  const { call, item, directory, state } = await fixture(t);
  const issued = (await item()).item;
  assert.equal('expected' in issued, false); assert.equal('explanation' in issued, false); assert.deepEqual(issued.hints, []);
  const malformed = await call('submit', { itemId: issued.id, answer: '  not a number\n', assistance: [] });
  assert.equal(malformed.attempt.firstScored, false); assert.equal(malformed.attempt.feedback, undefined);
  const wrong = await call('submit', { itemId: issued.id, answer: ' 0 ', assistance: [] });
  assert.equal(wrong.attempt.firstScored, true); assert.equal(wrong.attempt.feedback.expected, issued.seed);
  const revised = await call('submit', { itemId: issued.id, answer: String(issued.seed), assistance: [] });
  assert.equal(revised.attempt.correct, true); assert.equal(revised.attempt.firstScored, false); assert.equal(revised.attempt.assisted, true);
  const restarted = createLearningService({ modules, directory });
  const recovered = await restarted.request('/learning/export', { sessionId: state.sessionId });
  assert.equal(recovered.items[0].prompt, issued.prompt); assert.deepEqual(recovered.items[0].inputs, issued.inputs);
  assert.deepEqual(recovered.items[0].attempts.map((attempt) => attempt.rawAnswer), ['  not a number\n', ' 0 ', String(issued.seed)]);
  assert.equal(recovered.events.filter((event) => event.type === 'submission').length, 3);
  assert.equal(recovered.items[0].attempts[1].correct, false);
});

test('unsavable answer, hint, or worked exposure reveals nothing and keeps prior record readable', async (t) => {
  let fail = false;
  const { call, item, directory, state } = await fixture(t, { persist: async (...args) => { if (fail) throw new Error('disk full'); return saveAtomic(...args); } });
  const issued = (await item()).item;
  fail = true;
  const unsaved = (operation) => assert.rejects(operation, (error) => error.status === 507 && error.code === 'record-not-saved');
  await unsaved(call('submit', { itemId: issued.id, answer: String(issued.seed), assistance: [] }));
  await unsaved(call('hint', { itemId: issued.id }));
  await unsaved(call('worked', { unitId: 'spatial', key: 'boundary', prediction: 'accepted', skipReason: '' }));
  const saved = await call('export');
  assert.equal(saved.items[0].attempts.length, 0); assert.equal(saved.items[0].hints.length, 0); assert.equal(saved.exposures.length, 0);
  assert.equal(JSON.parse(await readFile(join(directory, `${state.sessionId}.json`), 'utf8')).items.length, 1);
});

test('three-item criterion uses unassisted first scored responses and a fresh retake', async (t) => {
  const { call } = await fixture(t);
  const first = (await call('mastery', { unitId: 'spatial' })).set;
  assert.equal(first.items.length, 3); assert.equal(first.items.some((item) => 'expected' in item), false);
  await assert.rejects(call('hint', { itemId: first.items[0].id }), /no hints/);
  await call('submit', { itemId: first.items[0].id, answer: 'wrong format', assistance: [] });
  await call('submit', { itemId: first.items[0].id, answer: '0', assistance: [] });
  await call('submit', { itemId: first.items[0].id, answer: String(first.items[0].seed), assistance: [] });
  for (const item of first.items.slice(1)) await call('submit', { itemId: item.id, answer: String(item.seed), assistance: [] });
  assert.equal((await call('state')).units[0].status, 'needs-practice');
  const second = (await call('mastery', { unitId: 'spatial' })).set;
  assert.ok(second.items.every((item, index) => item.seed !== first.items[index].seed && item.prompt !== first.items[index].prompt));
  for (const item of second.items) await call('submit', { itemId: item.id, answer: String(item.seed), assistance: [] });
  const final = await call('state'); assert.equal(final.units[0].status, 'mastered'); assert.equal(final.masterySets.length, 2);
  assert.equal(final.masterySets[0].passed, false); assert.equal(final.masterySets[1].passed, true);
});

test('hints and worked/reference exposure are recorded, and pending mastery is assisted', async (t) => {
  const { call, item } = await fixture(t);
  const practice = (await item()).item;
  await call('hint', { itemId: practice.id }); await call('hint', { itemId: practice.id });
  await assert.rejects(call('hint', { itemId: practice.id }), /Commit a valid answer/);
  await call('submit', { itemId: practice.id, answer: String(practice.seed), assistance: [] });
  const solution = await call('hint', { itemId: practice.id }); assert.equal(solution.hint.level, 3);
  const set = (await call('mastery', { unitId: 'spatial' })).set;
  await assert.rejects(call('worked', { unitId: 'spatial', key: 'boundary', prediction: '', skipReason: '' }), /prediction/);
  await call('worked', { unitId: 'spatial', key: 'boundary', prediction: 'Original prediction', skipReason: '' });
  await call('reference', { unitId: 'spatial' });
  for (const entry of set.items) await call('submit', { itemId: entry.id, answer: String(entry.seed), assistance: [] });
  const exported = await call('export');
  assert.equal(exported.units[0].status, 'needs-practice');
  assert.equal(exported.exposures[0].prediction, 'Original prediction');
  assert.equal(exported.events.find((event) => event.type === 'reference-exposure').assistedItemIds.length, 3);
});

test('concurrent responses append and never overwrite a first attempt', async (t) => {
  const { call, item } = await fixture(t); const issued = (await item()).item;
  await Promise.all([call('submit', { itemId: issued.id, answer: '0', assistance: [] }), call('submit', { itemId: issued.id, answer: String(issued.seed), assistance: [] })]);
  const saved = (await call('state')).items[0]; assert.equal(saved.attempts.length, 2); assert.equal(saved.attempts[0].firstScored, true); assert.equal(saved.attempts[1].firstScored, false);
});

test('returning to earlier teaching marks pending mastery assisted, including a saved worked example', async (t) => {
  const { call } = await fixture(t);
  await call('worked', { unitId: 'spatial', key: 'boundary', prediction: 'accepted', skipReason: '' });
  const set = (await call('mastery', { unitId: 'spatial' })).set;
  await call('visit', { unitId: 'spatial', key: 'boundary' });
  for (const item of set.items) await call('submit', { itemId: item.id, answer: String(item.seed), assistance: [] });
  const saved = await call('export');
  assert.equal(saved.units[0].status, 'needs-practice');
  assert.equal(saved.events.find((event) => event.type === 'section-visit').assistedItemIds.length, 3);
});

test('old items retain their original definitions when course generation changes', async (t) => {
  const { call, item, directory, state } = await fixture(t); const issued = (await item()).item;
  const changed = structuredClone(modules.map(({ unit }) => unit)); changed[0].objectives[0].text = 'Edited objective';
  const newModules = modules.map((module, index) => ({ ...module, unit: changed[index] }));
  const next = createLearningService({ modules: newModules, directory });
  const input = { sessionId: state.sessionId, unitId: 'spatial', key: 'boundary', mode: 'practice' };
  await assert.rejects(next.request('/learning/item', input), /earlier course version/);
  const result = await next.request('/learning/submit', { sessionId: state.sessionId, itemId: issued.id, answer: String(issued.seed), assistance: [] });
  assert.equal(result.attempt.correct, true);
  assert.equal((await call('state')).units[0].objectives[0].text, modules[0].unit.objectives[0].text);
});

test('helper-only source changes invalidate new generation while historical feedback remains readable', async (t) => {
  const { item, directory, state } = await fixture(t); const issued = (await item()).item;
  const changed = modules.map((module) => ({ ...module, sourceVersion: `${module.sourceVersion}-helper-edited` }));
  const next = createLearningService({ modules: changed, directory });
  await assert.rejects(next.request('/learning/item', { sessionId: state.sessionId, unitId: 'spatial', mode: 'practice', key: 'boundary' }), /earlier course version/);
  assert.equal((await next.request('/learning/state', { sessionId: state.sessionId })).items[0].prompt, issued.prompt);
});

test('mastery rejects repeated substantive inputs across keys and modes, and exhausted generation saves no partial set', async (t) => {
  const repeated = modules.map((module) => ({ ...module, makeItem(input) {
    const item = module.makeItem(input);
    return { ...item, prompt: `${input.mode} ${input.key}: a different prefix`, inputs: { amount: 8, limit: 12 }, expected: 4 };
  } }));
  const { call, item } = await fixture(t, { modules: repeated });
  await item();
  await assert.rejects(call('mastery', { unitId: 'spatial' }), (error) => error.code === 'case-bank-exhausted');
  const saved = await call('state');
  assert.equal(saved.items.length, 1); assert.equal(saved.masterySets.length, 0);
});

function scaffoldedModules() {
  return modules.map((module) => ({ ...module, makeItem(input) {
    const item = module.makeItem(input);
    const amount = input.key === 'refusal' ? 20 : input.key === 'transfer' ? 30 : 10;
    const inputs = { amount, limit: 40 };
    if (input.mode === 'completion') inputs.completedSteps = ['The limit is already known.'];
    return { ...item, prompt: `${input.mode} ${input.key}: calculate the remainder`, inputs, expected: 40 - amount };
  } }));
}

test('completion scaffolds do not make an exposed case eligible for mastery', async (t) => {
  const { call, item } = await fixture(t, { modules: scaffoldedModules() });
  await item('completion');
  await assert.rejects(call('mastery', { unitId: 'spatial' }), (error) => error.code === 'case-bank-exhausted');
  const saved = await call('state'); assert.equal(saved.items.length, 1); assert.equal(saved.masterySets.length, 0);
});

test('practice and completion cannot reveal the key of an already issued mastery case', async (t) => {
  const { call, item } = await fixture(t, { modules: scaffoldedModules() });
  await call('mastery', { unitId: 'spatial' });
  for (const mode of ['practice', 'completion']) await assert.rejects(item(mode), (error) => error.code === 'case-bank-exhausted');
  const saved = await call('state'); assert.equal(saved.items.length, 3); assert.equal(saved.items[0].attempts.length, 0);
});

test('help declared on a format error stays attached to the first scored mastery response', async (t) => {
  const { call } = await fixture(t);
  const set = (await call('mastery', { unitId: 'spatial' })).set;
  await call('submit', { itemId: set.items[0].id, answer: 'not a number', assistance: ['I used an answer key'] });
  for (const item of set.items) await call('submit', { itemId: item.id, answer: String(item.seed), assistance: [] });
  const saved = await call('state');
  assert.equal(saved.items[0].attempts[0].status, 'format-error');
  assert.equal(saved.items[0].attempts[1].firstScored, true);
  assert.equal(saved.items[0].attempts[1].assisted, true);
  assert.equal(saved.units[0].status, 'needs-practice');
});

test('an actual imported clock helper edit invalidates new generation in an existing session', async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'ivy-learning-helper-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const excluded = new Set(['artifacts', 'node_modules', '.tmp', 'tests', '.git']);
  await cp(root, directory, { recursive: true, filter: (path) => !excluded.has(path.split('/').at(-1)) });
  const path = join(directory, 'clock.mjs');
  const source = await readFile(path, 'utf8');
  assert.match(source, /TICK_MS = 50/);
  await writeFile(path, source.replace('TICK_MS = 50', 'TICK_MS = 51'));
  const original = await loadUnits();
  const changed = await (await import(pathToFileURL(join(directory, 'learning/runtime.mjs')))).loadUnits();
  const state = newSession('helper-test', original, 'before');
  const before = original.find(({ unit }) => unit.id === 'timing').makeItem({ mode: 'practice', key: 'clock', seed: 2 });
  const after = changed.find(({ unit }) => unit.id === 'timing').makeItem({ mode: 'practice', key: 'clock', seed: 2 });
  assert.notDeepEqual(after.expected, before.expected);
  assert.notEqual(changed[0].sourceVersion, original[0].sourceVersion);
  await assert.rejects(async () => issueItem(state, changed, { unitId: 'timing', mode: 'practice', key: 'clock' }, 3, 'after'), /earlier course version/);
  assert.equal(state.items.length, 0);
});

test('existing game server serves guided assets without importing missing unit modules at startup', async () => {
  await withServer(async (server) => {
    for (const path of ['/learn', '/learn.js', '/learn.css']) assert.equal((await fetch(server.base + path)).status, 200);
    const wrongMethod = await fetch(server.base + '/learning/catalog', { method: 'POST' }); assert.equal(wrongMethod.status, 405);
    assert.equal((await fetch(server.base + '/health')).status, 200);
  });
});
