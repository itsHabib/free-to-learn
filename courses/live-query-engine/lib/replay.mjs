import assert from 'node:assert/strict';
import { createStore, quantityOver } from './store.mjs';

// Recompute the whole result independently of openView, poll, classify and the injected matcher.
function fullResult(store, threshold) {
  const rows = store.snapshot().rows.filter(row => row.quantity !== null && row.quantity > threshold);
  return new Map(rows.map(row => [row.id, row]));
}

export function difference(oldRows, newRows, writes) {
  const events = [];
  for (const id of new Set(writes.map(write => write.id))) {
    const oldRow = oldRows.get(id);
    const row = newRows.get(id);
    if (oldRow?.quantity === row?.quantity) continue;
    const type = oldRow === undefined ? 'enter' : row === undefined ? 'leave' : 'update';
    events.push({ type, id, row: row ?? null });
  }
  return events;
}

export function replay(runtime, initialRows, transactions, { threshold = 30, matcher = quantityOver(threshold) } = {}) {
  const store = createStore(initialRows);
  const view = runtime.openView(store, matcher);
  let expected = fullResult(store, threshold);
  assert.deepEqual(view.rows, expected, 'Initial snapshot differs from the full query');
  assert.equal(view.revision, 0, 'Initial cursor must name the scanned snapshot');
  const batches = [];
  for (const writes of transactions) {
    const revision = store.commit(writes);
    const next = fullResult(store, threshold);
    const events = difference(expected, next, writes);
    const actual = runtime.poll(store, view);
    assert.deepEqual(actual, [{ revision, events }], 'Event mismatch at revision ' + revision);
    assert.deepEqual(view.rows, next, 'Visible rows differ from the full query at revision ' + revision);
    assert.equal(view.revision, revision, 'Cursor stalled at revision ' + revision);
    batches.push(...actual);
    expected = next;
  }
  assert.deepEqual(runtime.poll(store, view), [], 'An idle poll repeated a commit');
  return { batches, rows: Array.from(view.rows.values()), revision: view.revision };
}
