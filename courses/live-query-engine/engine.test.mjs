import assert from 'node:assert/strict';
import test from 'node:test';
import * as runtime from './reference/runtime.mjs';
import { createStore, quantityOver, selectRows } from './lib/store.mjs';
import { jitMatcher } from './lib/jit-scan.mjs';
import { replay } from './lib/replay.mjs';
import { checks } from './lib/checks.mjs';

for (const [lesson, check] of Object.entries(checks)) {
  test('worked runtime passes learner check ' + lesson, () => check(runtime));
}

test('commits validate before publishing, isolate earlier snapshots and retain first-touch order', () => {
  const store = createStore([{ id: 'A', quantity: 42 }]);
  const original = store.snapshot();
  assert.throws(() => store.commit([{ id: 'A', delete: true }, { id: 'B', quantity: 2 ** 31 }]), /i32/);
  assert.deepEqual(store.snapshot(), original);
  const revision = store.commit([{ id: 'B', quantity: 8 }, { id: 'A', delete: true }, { id: 'B', quantity: null }]);
  assert.equal(revision, 1);
  assert.deepEqual(original.rows, [{ id: 'A', quantity: 42 }]);
  const [delta] = store.changesAfter(0);
  assert.deepEqual(delta.changes, [{ id: 'B', row: { id: 'B', quantity: null } }, { id: 'A', row: null }]);
  assert.throws(() => { delta.changes[0].row.quantity = 0; }, TypeError);
  assert.throws(() => store.changesAfter(revision + 1), /Cursor/);
});

test('a write inside the initial scan appears exactly once on the next poll', () => {
  const store = createStore([{ id: 'A', quantity: 40 }]);
  let duringScan = true;
  const matcher = values => {
    if (duringScan) {
      duringScan = false;
      store.commit([{ id: 'A', delete: true }]);
    }
    return quantityOver(30)(values);
  };
  const view = runtime.openView(store, matcher);
  assert.deepEqual([...view.rows.keys()], ['A']);
  assert.deepEqual(runtime.poll(store, view), [
    { revision: 1, events: [{ type: 'leave', id: 'A', row: null }] },
  ]);
  assert.deepEqual(runtime.poll(store, view), []);
});

test('a failed second scan leaves the cursor and rows together for retry', () => {
  const store = createStore([{ id: 'A', quantity: 39 }]);
  let fail = true;
  const view = runtime.openView(store, values => {
    if (fail && values.includes(99)) throw new Error('interrupted');
    return quantityOver(30)(values);
  });
  store.commit([{ id: 'A', quantity: 1 }]);
  store.commit([{ id: 'B', quantity: 99 }]);
  assert.throws(() => runtime.poll(store, view), /interrupted/);
  assert.equal(view.revision, 0);
  assert.deepEqual([...view.rows.keys()], ['A']);
  fail = false;
  assert.deepEqual(runtime.poll(store, view).map(batch => batch.events[0].type), ['leave', 'enter']);
});

test('the JIT bridge passes the actual program, observations options and trace', () => {
  const choose = () => 'compile';
  const trace = [{ kind: 'decision', action: 'compile' }];
  let observed;
  const fakeRun = (program, values, options) => {
    assert.deepEqual(program, [['load'], ['const', 7], ['gt']]);
    assert.deepEqual(values, [null, 7, 9]);
    assert.deepEqual(options, { choose, batchSize: 3 });
    return { matches: [2], trace };
  };
  const matcher = jitMatcher(fakeRun, { threshold: 7, choose, batchSize: 3, onTrace: events => { observed = events; } });
  assert.deepEqual(matcher([null, 7, 9]), [2]);
  assert.deepEqual(observed, trace);
});

test('a matcher with an invalid result fails at the scan boundary', () => {
  const rows = [{ id: 'A', quantity: 44 }];
  for (const indices of [[0, 0], [-1], [1], [0.5], null]) {
    assert.throws(() => selectRows(rows, () => indices), /matcher|Matcher/);
  }
});

test('the oracle catches a matcher that mishandles SQL null at a negative threshold', () => {
  assert.throws(() => replay(runtime, [{ id: 'X', quantity: null }], [], {
    threshold: -1, matcher: () => [0],
  }), /Initial snapshot/);
});

test('learner checks reject a late cursor, a fabricated update and a skipped quiet revision', () => {
  const late = (store, matcher) => ({ ...runtime.openView(store, matcher), revision: store.snapshot().revision });
  assert.throws(() => checks['01']({ ...runtime, openView: late }), /Taking the cursor afterward/);
  const noisy = (a, b) => (a && b ? { type: 'update', id: b.id, row: b } : runtime.classify(a, b));
  assert.throws(() => checks['02']({ ...runtime, classify: noisy }), /identical quantity/);
  const dropped = (store, view) => runtime.poll(store, view).filter(batch => batch.events.length);
  assert.throws(() => checks['03']({ ...runtime, poll: dropped }), /revision 2/);
});

test('the capstone rejects a watch that updates its rows but silently drops every notification', async () => {
  const {compare}=await import('./lib/comparison.mjs');
  const silent={...runtime,poll: (...args)=>runtime.poll(...args).map(batch=>({...batch,events:[]}))};
  assert.throws(()=>compare(silent),/Commit notifications differ/);
});

test('the transition check distinguishes a visible unknown quantity and absence',()=>{
  const classify=(oldRow,newRow)=>runtime.classify(oldRow?.quantity===null?null:oldRow,newRow?.quantity===null?null:newRow);
  assert.throws(()=>checks['02']({classify}),/unknown quantity/);
});

test('unit 03 catches a poll that saves the store revision after the matcher runs', () => {
  const poll = (store, view) => {
    const batches = runtime.poll(store, view);
    view.revision = store.revision;
    return batches;
  };
  assert.throws(() => checks['03']({ ...runtime, poll }), /last processed revision/);
});

test('the lesson figures match what tools/figures.mjs draws from the course code', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  execFileSync(process.execPath, ['tools/figures.mjs', '--check'], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'pipe' });
});
