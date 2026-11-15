// Supplied by the course: lists of calls that play a game of Lob or Lob II.
//
// session({ seed, mode, plan }) returns [{ name, args }]: game_init(seed, mode),
// then one entry per key press or frame in the plan. A plan is a list of steps:
//   ['up', 5]       press a key five times (left, right, up, down, fire, new)
//   ['frames', 240] let 240 frames pass (240 calls to game_tick)
// The keys: left lowers the barrel, right raises it, up and down change the
// power, fire shoots, new starts a new round (only between shots).
//
// plan({ seed, shots }) makes a plan that aims and fires `shots` times, choosing
// how far to turn the barrel and change the power from its own seed, waits for
// each shell to land and starts a new round after it.
export const KEYS = Object.freeze({ left: 1, right: 2, up: 3, down: 4, fire: 5, new: 6 });

export function session({ seed = 1, mode = 0, plan: steps = [] } = {}) {
  const calls = [{ name: 'game_init', args: [seed, mode] }];
  for (const [what, n = 1] of steps) {
    if (what === 'frames') { for (let i = 0; i < n; i++) calls.push({ name: 'game_tick', args: [] }); continue; }
    const code = KEYS[what];
    if (!code) throw Error(`session: unknown step ${what}`);
    for (let i = 0; i < n; i++) calls.push({ name: 'game_key', args: [code] });
  }
  return calls;
}

export function plan({ seed = 1, shots = 3, flight = 360 } = {}) {
  let x = (seed * 2246822519 + 7) >>> 0 || 1;
  const pick = (n) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x % n; };
  const steps = [];
  for (let s = 0; s < shots; s++) {
    const turn = pick(21) - 10, push = pick(31) - 15;
    if (turn) steps.push([turn > 0 ? 'right' : 'left', Math.abs(turn)]);
    if (push) steps.push([push > 0 ? 'up' : 'down', Math.abs(push)]);
    steps.push(['frames', 2 + pick(5)]);
    steps.push(['fire']);
    steps.push(['frames', flight]);
    if (s < shots - 1) steps.push(['new']);
    steps.push(['frames', 2]);
  }
  return steps;
}
