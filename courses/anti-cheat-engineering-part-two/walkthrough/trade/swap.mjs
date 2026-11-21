// Unit 16, new application: a swap of one item for another, with no coins. Lesson 16, "Use
// the idea on a new case", gives the task; examples/check-swap.mjs checks it. No finished
// swap is supplied.
//
// swap(store, request) -> { ok: true, receipt } or { ok: false, reason }
//   request: { key, a, b, itemA, itemB }: player a gives itemA to player b, and b gives
//   itemB to a. The checks send only well-formed requests.
//   receipt: { key, a, b, itemA, itemB }
//   reason, checked in this order:
//     'self'      a === b
//     'conflict'  a swap under the same key was carried out with a different body
//     'missing'   a does not hold itemA, or b does not hold itemB
//   A request whose key was already carried out with the same body returns the same
//   receipt and writes nothing. A refusal writes nothing. The store may crash after any put.
// recoverSwaps(store) -> the keys of the swaps it finished, sorted
//   Runs when the server restarts after a crash, and may itself crash after any put and be
//   run again. Keep swaps under journal keys of their own, such as swap:<key>.
export function swap(store, request) {
  throw new Error('swap: not written yet');
}

export function recoverSwaps(store) {
  throw new Error('recoverSwaps: not written yet');
}
