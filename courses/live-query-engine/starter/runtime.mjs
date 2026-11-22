import { quantityOver, selectRows } from '../lib/store.mjs';

// 01: Take one snapshot. Use selectRows(snapshot.rows, matcher) to obtain a Map.
export function openView(store, matcher = quantityOver(30)) {
  throw new Error('01: implement openView in work/runtime.mjs');
}

// 02: before and after are visible rows or null. See the event contract in lesson 02.
export function classify(before, after) {
  throw new Error('02: implement classify in work/runtime.mjs');
}

// 03: Apply unread commits in order. Return {revision, events} once per revision.
export function poll(store, view) {
  throw new Error('03: implement poll in work/runtime.mjs');
}
