import assert from 'node:assert/strict';
import { createStore, quantityOver } from './store.mjs';
import { replay } from './replay.mjs';

const row = (id, quantity) => ({ id, quantity });
const cancel = id => ({ id, delete: true });

function snapshot(runtime) {
  const store = createStore([row('P', 30), row('Q', 9), row('R', null)]);
  store.commit([row('Q', 51)]);
  const matcher = values => {
    store.commit([row('P', 47)]);
    return quantityOver(30)(values);
  };
  const view = runtime.openView(store, matcher);
  assert.deepEqual(view.rows, new Map([['Q', row('Q', 51)]]), 'Scan the rows captured before the matcher runs');
  assert.equal(view.revision, 1, 'P arrived inside the scan. Taking the cursor afterward skips its commit');
  assert.deepEqual(store.changesAfter(view.revision).map(c => c.revision), [2], 'Only revision 2 belongs to the feed');
  assert.equal(view.matcher, matcher, 'Keep the selected matcher on the view for later scans');
  return 'Snapshot at r1 includes Q and leaves the in-scan commit r2 available.';
}

function transitions(runtime) {
  const before = row('K', 36);
  const after = row('K', 72);
  const cases = [
    [null, before, { type: 'enter', id: 'K', row: before }, 'Invisible to visible needs a full row'],
    [before, after, { type: 'update', id: 'K', row: after }, 'A visible correction carries the new quantity'],
    [after, null, { type: 'leave', id: 'K', row: null }, 'Leaving the result removes the id'],
    [before, { ...before }, null, 'An identical quantity on a new row object has no visible effect'],
    [null, null, null, 'Two invisible versions have no visible effect'],
    [null, row('K',null), {type:'enter',id:'K',row:row('K',null)}, 'Dispatch can see an order with unknown quantity'],
    [before, row('K',null), {type:'update',id:'K',row:row('K',null)}, 'A visible unknown quantity is still a row'],
    [row('K',null), null, {type:'leave',id:'K',row:null}, 'Canceling an unknown visible order emits a leave'],
  ];
  for (const [oldRow, newRow, expected, message] of cases) {
    assert.deepEqual(runtime.classify(oldRow, newRow), expected, message);
  }
  return 'Enter, visible correction, leave and both silent transitions agree with the event contract.';
}

function feed(runtime) {
  const initial = [row('H', 36), row('K', null), row('Z', 78)];
  const transactions = [
    [row('H', 1), row('K', 49), row('H', 44)], // H stays visible at the boundary.
    [row('K', 49), row('Q', 81), cancel('Q')], // A quiet revision with real writes.
    [cancel('Z'), row('K', 30)],
    [row('H', null), row('Z', 55)],
  ];
  const { batches, rows } = replay(runtime, initial, transactions);

  const store = createStore(initial);
  const examined = [];
  const matcher = values => {
    examined.push(...values);
    return quantityOver(30)(values);
  };
  const view = runtime.openView(store, matcher);
  examined.length = 0;
  for (const writes of transactions) store.commit(writes);
  assert.deepEqual(runtime.poll(store, view), batches, 'A delayed poll must retain each commit boundary');
  assert.deepEqual(new Set(view.rows.values()), new Set(rows), 'Apply every delivered event to the local view');
  assert.equal(view.revision, 4, 'Advance the cursor through the last delivered commit');
  assert.deepEqual(runtime.poll(store, view), [], 'An idle poll must not send duplicate events');
  const sortQuantities = values => values.map(value => String(value)).sort();
  assert.deepEqual(sortQuantities(examined), sortQuantities([44, 49, 49, 30, null, 55]),
    'Scan only present final rows touched in each commit');
  replay(runtime, [row('S', -8), row('U', null)], [[row('S', -2)], [row('U', -5)]], { threshold: -5 });
  checkRetry(runtime);
  checkCommitDuringPoll(runtime);
  return 'Live deltas match a full query at four revisions, including delayed delivery and a silent transaction.';
}

function checkRetry(runtime) {
  const store = createStore([row('A', 39)]);
  let interrupted = true;
  const view = runtime.openView(store, values => {
    if (interrupted && values.includes(99)) throw new Error('scan interrupted');
    return quantityOver(30)(values);
  });
  store.commit([row('A', 8)]);
  store.commit([row('B', 99)]);
  assert.throws(() => runtime.poll(store, view), /scan interrupted/, 'Propagate a failed scan to the caller');
  assert.equal(view.revision, 0, 'Updating the cursor before returning the events loses a notification on retry');
  assert.deepEqual(view.rows, new Map([['A', row('A', 39)]]), 'A failed poll must preserve its input view for retry');
  interrupted = false;
  assert.deepEqual(runtime.poll(store, view), [
    { revision: 1, events: [{ type: 'leave', id: 'A', row: null }] },
    { revision: 2, events: [{ type: 'enter', id: 'B', row: row('B', 99) }] },
  ], 'A retry should deliver both revisions');
}

function checkCommitDuringPoll(runtime) {
  const store = createStore([row('A', 39)]);
  const match = quantityOver(30);
  let injected = false;
  const view = runtime.openView(store, values => {
    if (!injected && values.includes(42)) {
      injected = true;
      store.commit([row('B', 55)]);
    }
    return match(values);
  });
  store.commit([row('A', 42)]);
  assert.deepEqual(runtime.poll(store, view), [
    { revision: 1, events: [{ type: 'update', id: 'A', row: row('A', 42) }] },
  ], 'This poll only covers revision 1. Revision 2 arrived during matching');
  assert.equal(view.revision, 1, 'Save the last processed revision. The store advanced to revision 2 while matching');
  assert.deepEqual(view.rows, new Map([['A', row('A', 42)]]), 'The view must contain only the rows processed through revision 1');
  assert.deepEqual(runtime.poll(store, view), [
    { revision: 2, events: [{ type: 'enter', id: 'B', row: row('B', 55) }] },
  ], 'The next poll must deliver the commit that arrived during matching');
  assert.equal(view.revision, 2, 'Advance the cursor only after processing revision 2');
  assert.deepEqual(view.rows, new Map([['A', row('A', 42)], ['B', row('B', 55)]]));
}

export const checks = { '01': snapshot, '02': transitions, '03': feed };
