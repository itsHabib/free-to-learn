// Unit 16 end checkpoint: trade/trade.mjs with every walked-through region filled.
// examples/start-unit16.mjs copies it into a project as trade/trade.mjs. It imports
// nothing: the store is passed in. wellFormed and its two constants are supplied.

const NAME = /^[A-Za-z0-9_-]{1,40}$/;
const FIELDS = ['buyer', 'item', 'key', 'price', 'seller'];

function wellFormed(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    return false;
  const keys = Object.keys(request).sort();
  if (
    keys.length !== FIELDS.length ||
    keys.some((key, index) => key !== FIELDS[index])
  )
    return false;
  const names = [request.key, request.seller, request.buyer, request.item];
  return (
    names.every((value) => typeof value === 'string' && NAME.test(value)) &&
    Number.isSafeInteger(request.price) &&
    request.price >= 0
  );
}

// region: finish
function finish(store, key, entry) {
  const { seller, buyer, item, price } = entry.body;
  const { sellerItems, buyerItems, sellerCoins, buyerCoins } = entry.before;
  store.put(
    `inv:${seller}`,
    sellerItems.filter((id) => id !== item),
  );
  store.put(`inv:${buyer}`, [...buyerItems, item]);
  store.put(`coins:${buyer}`, buyerCoins - price);
  store.put(`coins:${seller}`, sellerCoins + price);
  const receipt = { key, ...entry.body };
  store.put(`trade:${key}`, { ...entry, state: 'done', receipt });
  return receipt;
}
// endregion: finish

// region: recover
export function recover(store) {
  const finished = [];
  for (const name of store.keys('trade:')) {
    const entry = store.get(name);
    if (entry.state !== 'pending') continue;
    const key = name.slice('trade:'.length);
    finish(store, key, entry);
    finished.push(key);
  }
  return finished;
}
// endregion: recover

export function trade(store, request) {
  // region: trade-key
  if (!wellFormed(request)) return { ok: false, reason: 'shape' };
  if (request.seller === request.buyer) return { ok: false, reason: 'self' };
  recover(store);
  const body = {
    seller: request.seller,
    buyer: request.buyer,
    item: request.item,
    price: request.price,
  };
  const done = store.get(`trade:${request.key}`);
  if (done) {
    if (JSON.stringify(done.body) !== JSON.stringify(body))
      return { ok: false, reason: 'conflict' };
    return { ok: true, receipt: done.receipt };
  }
  // endregion: trade-key
  // region: trade-journal
  const sellerItems = store.get(`inv:${body.seller}`) ?? [];
  const buyerItems = store.get(`inv:${body.buyer}`) ?? [];
  const sellerCoins = store.get(`coins:${body.seller}`) ?? 0;
  const buyerCoins = store.get(`coins:${body.buyer}`) ?? 0;
  if (!sellerItems.includes(body.item)) return { ok: false, reason: 'missing' };
  if (buyerCoins < body.price) return { ok: false, reason: 'funds' };
  const before = { sellerItems, buyerItems, sellerCoins, buyerCoins };
  const entry = { state: 'pending', body, before };
  store.put(`trade:${request.key}`, entry);
  return { ok: true, receipt: finish(store, request.key, entry) };
  // endregion: trade-journal
}
