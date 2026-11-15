// Seeded network links. A link turns the time a message is sent into the time it
// arrives, or null when it is lost. Every message is delayed on its own (the one-way
// delay plus a uniform jitter), so with jitter, messages can overtake each other.
// Outages drop everything sent inside them.
import { makeRandom } from './stats.mjs';

export function link({ seed, oneWayMs, jitterMs = 0, loss = 0, outages = [] }) {
  const random = makeRandom(seed);
  return {
    delay(sentAtMs) {
      // Two draws per message whatever happens, so one lost message never shifts the rest.
      const jitter = random.next();
      const lose = random.next();
      if (outages.some(({ at, ms }) => sentAtMs >= at && sentAtMs < at + ms)) return null;
      if (lose < loss) return null;
      return sentAtMs + oneWayMs + Math.floor(jitter * (jitterMs + 1));
    },
  };
}
