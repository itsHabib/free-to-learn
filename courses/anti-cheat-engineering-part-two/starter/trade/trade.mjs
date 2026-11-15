// trade/trade.mjs (unit 16): a trade between two players that survives the server
// crashing after any write. The store is public/store.mjs's; it is passed in. API.md
// (unit 16) has the exact rules the checks test.

// trade(store, request) -> { ok: true, receipt } or { ok: false, reason }
//   request: { key, seller, buyer, item, price } from a client. A client that got no
//   answer sends the same request again with the same key.
//   receipt: { key, seller, buyer, item, price }
//   reason: 'shape', 'self', 'conflict', 'missing' or 'funds'.
//   The store may crash after any put. After the server restarts, every trade must be
//   wholly applied or wholly absent, and a repeated request must never apply twice.
export function trade(store, request) {
  throw new Error('trade: not written yet');
}

// recover(store) -> the keys of the trades it finished, sorted
//   Runs when the server restarts after a crash. Finishes every trade the crash left
//   part done. It may itself crash after any put and be run again.
export function recover(store) {
  throw new Error('recover: not written yet');
}
