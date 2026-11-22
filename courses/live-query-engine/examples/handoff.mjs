import * as runtime from '../work/runtime.mjs';
import { createStore, quantityOver } from '../lib/store.mjs';

const store = createStore([{ id: 'B', quantity: 42 }]);
let firstScan = true;
function match(values) {
  if (firstScan) {
    firstScan = false;
    store.commit([{ id: 'B', delete: true }]);
  }
  return quantityOver(30)(values);
}

const view = runtime.openView(store, match);
console.log('Snapshot', view.revision, [...view.rows.keys()]);
console.log('Store after scan', store.revision, store.snapshot().rows);
console.log('Unread commits', JSON.stringify(store.changesAfter(view.revision)));
