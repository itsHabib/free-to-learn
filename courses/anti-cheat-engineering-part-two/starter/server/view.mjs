// Unit 13: what each tick's message says.

// drawnView(game, info): the message for one player after a tick. game is the Lob handle
// from public/lob.mjs; info is { tick, ack }. Returns a plain object with exactly the
// fields API.md lists for the drawn view: what the official client draws, at the
// precision it draws it, and nothing else. The same game state and info must always give
// the same bytes from JSON.stringify.
export function drawnView(game, info) {
  throw new Error('drawnView: not written yet');
}
