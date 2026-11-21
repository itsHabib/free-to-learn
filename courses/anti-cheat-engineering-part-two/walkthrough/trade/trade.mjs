// Unit 16, write route: trade/trade.mjs with the walked-through regions left to fill.
// Lesson 16 shows each region's code and says why it is there. Replace everything between
// a "// region: NAME" line and its "// endregion: NAME" line with that listing, in the
// lesson's order: finish, recover, trade-key, then trade-journal. Keep the marker lines.
// wellFormed and its two constants are supplied. API.md, unit 16, has the exact rules.

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
  throw new Error('finish: not written yet');
}
// endregion: finish

// region: recover
export function recover(store) {
  throw new Error('recover: not written yet');
}
// endregion: recover

export function trade(store, request) {
  // region: trade-key
  throw new Error('trade: not written yet');
  // endregion: trade-key
  // region: trade-journal
  // endregion: trade-journal
}
