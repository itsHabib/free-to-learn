// courier/rewind.mjs (unit 15): how far back the courier server may look when it judges
// an interaction, and how to choose that limit. public/courier.mjs calls these; API.md
// (unit 15) has the exact rules the checks test.

// positionAt(history, tick) -> { x, y } or null
//   history: the server's position ring, { size, slots }; slot (tick % size) holds the
//   { tick, x, y } last written there, or null.
//   Returns where the courier stood at the end of `tick`, or null when the ring does not
//   hold that tick.
export function positionAt(history, tick) {
  throw new Error('positionAt: not written yet');
}

// measureRtt(samples) -> number
//   samples: one client's measured round trips in milliseconds, oldest first.
//   Returns that client's round trip in ticks (50 ms each; may be fractional), as API.md
//   defines it, and 0 when there are no samples.
export function measureRtt(samples) {
  throw new Error('measureRtt: not written yet');
}

// judgeInteract({ seen, now, window, rtt, history, target, range, readyAt, positionAt })
//     -> { accept, at, reason }
//   seen     the newest tick the client says it had drawn when it pressed
//   now      the tick the server is deciding in
//   window   the most ticks the server will ever rewind
//   rtt      this client's round trip in ticks, from measureRtt
//   history  the position ring; read it with positionAt(history, tick)
//   target   { x, y } of the core or the depot
//   range    the interaction range in mm
//   readyAt  the first tick the cooldown allows another interaction
//   positionAt  the ring reader the server was given (use it, or your own)
//   accept: true or false; at: the tick whose position decided it;
//   reason: 'ok' when accepted, else 'future', 'cooldown' or 'range'.
export function judgeInteract(args) {
  throw new Error('judgeInteract: not written yet');
}

// tally(outcomes) -> { honest, legit, legitRate, naive, naiveCheats, slow, slowCheats }
//   outcomes: runCourier's per-interaction outcomes.
//   honest       honest interactions
//   legit        honest interactions refused although in range at seen
//   legitRate    legit / honest, 0 when there are none
//   naive, slow  naiveFaker and slowPongFaker interactions
//   naiveCheats, slowCheats  of those, the ones accepted while not in range now
export function tally(outcomes) {
  throw new Error('tally: not written yet');
}

// pickWindow(rows, budget) -> a window, or null
//   rows: tally rows, each with its `window`. budget: the largest legit rejection rate
//   you accept, e.g. 0.01.
//   Returns, among rows within budget, the window with the fewest slowCheats (a tie goes
//   to the smaller window); null when no row is within budget.
export function pickWindow(rows, budget) {
  throw new Error('pickWindow: not written yet');
}
