import { quantityOver, selectRows } from '../lib/store.mjs';

export function openView(store, matcher = quantityOver(30)) {
  const { revision, rows } = store.snapshot();
  return { revision, rows: selectRows(rows, matcher), matcher };
}

export function classify(before, after) {
  if (before === null && after === null) return null;
  if (before === null) return { type: 'enter', id: after.id, row: after };
  if (after === null) return { type: 'leave', id: before.id, row: null };
  if (before.quantity === after.quantity) return null;
  return { type: 'update', id: after.id, row: after };
}

export function poll(store, view) {
  const staged = new Map();
  const batches = [];
  for (const { revision, changes } of store.changesAfter(view.revision)) {
    const present = changes.map(change => change.row).filter(row => row !== null);
    const visible = selectRows(present, view.matcher);
    const events = [];
    for (const { id } of changes) {
      const before = staged.has(id) ? staged.get(id) : view.rows.get(id) ?? null;
      const after = visible.get(id) ?? null;
      const event = classify(before, after);
      if (event) events.push(event);
      staged.set(id, after);
    }
    batches.push({ revision, events });
  }
  // A failed scan leaves the caller's cursor and rows together at the old revision.
  for (const [id, row] of staged) {
    if (row === null) view.rows.delete(id);
    else view.rows.set(id, row);
  }
  if (batches.length) view.revision = batches.at(-1).revision;
  return batches;
}
