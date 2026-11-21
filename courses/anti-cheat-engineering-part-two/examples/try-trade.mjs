// Run your trade and recover on lesson 16's sale, Ana selling Bo her sword for 40, and print
// every write. First recover alone, on stores a crash left part way through the sale (the
// journal entry is written here in the walkthrough's form), then the whole trade.
// node examples/try-trade.mjs            the unit 16 checkpoint, examples/trade-checkpoint.mjs
// node examples/try-trade.mjs project    your project's trade/trade.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { createStore, Crash } from '../public/store.mjs';

const [folder] = process.argv.slice(2);
const url = folder
  ? pathToFileURL(join(resolve(folder), 'trade', 'trade.mjs')).href
  : new URL('./trade-checkpoint.mjs', import.meta.url).href;
const { trade, recover } = await import(url);

const WORLD = {
  'inv:ana': ['sword', 'lamp'],
  'inv:bo': ['bow'],
  'coins:ana': 20,
  'coins:bo': 100,
};
const SALE = {
  key: 'sale-1',
  seller: 'ana',
  buyer: 'bo',
  item: 'sword',
  price: 40,
};

// A store that remembers its writes, so the probe can print them.
function logged(initial) {
  const store = createStore(initial);
  const writes = [];
  const put = store.put;
  store.put = (key, value) => {
    writes.push([key, value]);
    put(key, value);
  };
  return { store, writes };
}
const world = (store) =>
  ['ana', 'bo']
    .map(
      (p) =>
        `${p} [${(store.get(`inv:${p}`) ?? []).join(' ')}] ${store.get(`coins:${p}`) ?? 0}`,
    )
    .join(', ');
const entry = (store) => store.get(`trade:${SALE.key}`)?.state ?? 'none';
const written = (writes) =>
  writes.length
    ? writes
        .map(([key, value]) =>
          key.startsWith('trade:') ? `${key} ${value.state}` : key,
        )
        .join(', ')
    : 'nothing';
function stopAt(error) {
  if (!/not written yet/.test(error.message)) throw error;
  console.log(error.message);
  process.exit(0);
}

// 1. recover on the sale as a crash right after write 1 left it, and right after write 5.
const before = {
  sellerItems: ['sword', 'lamp'],
  buyerItems: ['bow'],
  sellerCoins: 20,
  buyerCoins: 100,
};
const { key, ...body } = SALE;
const pending = { state: 'pending', body, before };
const left = {
  1: { ...WORLD, [`trade:${key}`]: pending },
  5: {
    'inv:ana': ['lamp'],
    'inv:bo': ['bow', 'sword'],
    'coins:ana': 60,
    'coins:bo': 60,
    [`trade:${key}`]: pending,
  },
};
try {
  for (const n of [1, 5]) {
    const { store, writes } = logged(left[n]);
    console.log(
      `The sale as a crash right after write ${n} left it: ${world(store)}; trade:${key} ${entry(store)}`,
    );
    const finished = recover(store);
    console.log(
      `  recover(store) -> ${JSON.stringify(finished)}, writing ${written(writes)}`,
    );
    console.log(`  now: ${world(store)}; trade:${key} ${entry(store)}`);
    writes.length = 0;
    const again = recover(store);
    console.log(
      `  recover(store) again -> ${JSON.stringify(again)}, writing ${written(writes)}`,
    );
  }
} catch (error) {
  stopAt(error);
}

// 2. The whole trade: the sale with no crash, the same request again, the same key with
// another price, and a crash after write 3 followed by recovery and the retry.
const answer = (a) =>
  a?.ok
    ? `ok, receipt ${JSON.stringify(a.receipt)}`
    : a?.ok === false
      ? a.reason
      : JSON.stringify(a);
let run;
try {
  run = logged(WORLD);
  console.log(
    `${key}, Ana sells Bo the sword for 40, with no crash: ${answer(trade(run.store, { ...SALE }))}`,
  );
} catch (error) {
  stopAt(error);
}
run.writes.forEach(([k, value], i) =>
  console.log(
    `  write ${i + 1}: ${k} ${k.startsWith('trade:') ? value.state : JSON.stringify(value)}`,
  ),
);
for (const [what, request] of [
  ['the same request again', { ...SALE }],
  ['the same key, price 45', { ...SALE, price: 45 }],
]) {
  run.writes.length = 0;
  console.log(
    `${what}: ${answer(trade(run.store, request))}, writing ${written(run.writes)}`,
  );
}
const crashed = createStore(WORLD);
crashed.crashAfter(3);
try {
  trade(crashed, { ...SALE });
} catch (error) {
  if (!(error instanceof Crash)) throw error;
}
console.log(
  `A crash right after write 3: ${world(crashed)}; trade:${key} ${entry(crashed)}`,
);
crashed.restart();
console.log(
  `  restart, recover(store) -> ${JSON.stringify(recover(crashed))}: ${world(crashed)}`,
);
console.log(`  the client's retry: ${answer(trade(crashed, { ...SALE }))}`);
