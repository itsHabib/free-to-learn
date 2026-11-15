// public/store.mjs (unit 16, supplied): a durable key-value store that can crash between writes.
//
// The game keeps every player's belongings in a store:
//   inv:<player>     a list of item ids, e.g. ['sword', 'lamp']
//   coins:<player>   a whole number
// Each put is durable the moment it returns: a crash never loses a finished put and never
// applies half of one. But nothing is bigger than one put. There is no transaction that
// covers two keys, so if the server dies between the put that gives the buyer the item
// and the put that takes it from the seller, both writes that happened stay happened.
//
// To test code against that, the store can crash on purpose:
//   crashAfter(n)  the n-th put from now is applied and then throws a Crash, as if the
//                  server died the moment that write reached the disk. Every later put
//                  throws Crash too, until restart().
//   restart()      the server starts again: puts work again and the crash is disarmed.
// Reads keep working throughout: the data is on disk; it is the server that stopped.
//
// Values are copied in and out as JSON, so changing an array you got from get() never
// changes the store.
//
// naiveTrade() at the bottom is a trade as it is often first written: four puts in a
// row. Crash it after any of its puts and look at what is left.

export class Crash extends Error {
  constructor(write) {
    super(`crash: the server stopped after write ${write}`);
    this.name = 'Crash';
  }
}

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * createStore(initial) -> { get, put, keys, crashAfter, restart, writes, snapshot }
 *   initial      an object of key -> value, e.g. { 'inv:ana': ['sword'], 'coins:ana': 20 }
 *   get(key)     a copy of the value, or undefined when the key is absent
 *   put(key, v)  stores a copy of v; durable at once
 *   keys(prefix) the keys starting with prefix, sorted
 *   writes       how many puts have been applied since the store was made
 *   snapshot()   a copy of everything, as an object with sorted keys
 */
export function createStore(initial = {}) {
  const data = new Map();
  for (const [key, value] of Object.entries(initial)) data.set(key, copy(value));
  let writes = 0;
  let left = null;       // puts until the armed crash, or null
  let down = false;      // true from a crash until restart()

  function keys(prefix = '') {
    return [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  return {
    get(key) {
      return data.has(key) ? copy(data.get(key)) : undefined;
    },
    put(key, value) {
      if (typeof key !== 'string' || key === '') throw new TypeError('put needs a key: a non-empty string');
      if (value === undefined) throw new TypeError(`put(${JSON.stringify(key)}) needs a value; undefined cannot be stored`);
      if (down) throw new Crash(writes);
      data.set(key, copy(value));
      writes += 1;
      if (left !== null) {
        left -= 1;
        if (left === 0) {
          left = null;
          down = true;
          throw new Crash(writes);
        }
      }
    },
    keys,
    crashAfter(n) {
      if (!Number.isInteger(n) || n < 1) throw new RangeError('crashAfter needs a whole number, 1 or more');
      left = n;
    },
    restart() {
      left = null;
      down = false;
    },
    get writes() {
      return writes;
    },
    snapshot() {
      return Object.fromEntries(keys().map((key) => [key, copy(data.get(key))]));
    },
  };
}

/**
 * The trade most code starts with: check, then four puts in order. No journal and no
 * request key (a `key` in the request is ignored), so the store cannot tell a retry
 * from a new trade, and nothing records a trade that stopped halfway.
 *   request: { seller, buyer, item, price }
 * Returns { ok: true } or { ok: false, reason: 'missing' | 'funds' }.
 */
export function naiveTrade(store, { seller, buyer, item, price }) {
  const sellerItems = store.get(`inv:${seller}`) ?? [];
  const buyerItems = store.get(`inv:${buyer}`) ?? [];
  const sellerCoins = store.get(`coins:${seller}`) ?? 0;
  const buyerCoins = store.get(`coins:${buyer}`) ?? 0;
  if (!sellerItems.includes(item)) return { ok: false, reason: 'missing' };
  if (buyerCoins < price) return { ok: false, reason: 'funds' };
  store.put(`inv:${buyer}`, [...buyerItems, item]);                      // 1. the buyer gets the item
  store.put(`inv:${seller}`, sellerItems.filter((id) => id !== item));   // 2. the seller loses it
  store.put(`coins:${buyer}`, buyerCoins - price);                        // 3. the buyer pays
  store.put(`coins:${seller}`, sellerCoins + price);                      // 4. the seller is paid
  return { ok: true };
}
