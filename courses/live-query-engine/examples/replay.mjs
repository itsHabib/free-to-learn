import * as runtime from '../work/runtime.mjs';
import { replay } from '../lib/replay.mjs';

const initial = [{ id: 'K', quantity: 43 }];
const transactions = [
  [{ id: 'K', quantity: 2 }, { id: 'L', quantity: 51 }, { id: 'K', quantity: 43 }],
  [{ id: 'L', quantity: null }],
  [{ id: 'K', delete: true }, { id: 'L', delete: true }],
];
const { batches, rows } = replay(runtime, initial, transactions);
for (const batch of batches) console.log(JSON.stringify(batch));
console.log('Final rows', rows);
