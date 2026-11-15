// The detector corpus for unit 14: labelled sessions played on the defended server.
// Players see the drawn view through the official client, and the searcher sees the
// drawn view too. The views are generated with the full view; every client here takes
// only what the official client draws from it ('drawn' perception), so the sessions are
// the ones a server sending the drawn view would produce.
//
// makeCorpus({ split, counts }) -> [{ id, label, kind, record, rounds }]
//   record  the session's replay record (API.md, unit 12)
//   rounds  the session's per-round outcomes (session.mjs outcomes())
import { createLobSession } from './session.mjs';
import { fullView } from './full-view.mjs';
import { playSession } from './sim.mjs';
import { link } from './net.mjs';
import { makePlayer } from './players.mjs';
import { searcher } from './adversaries.mjs';
import { sessionSeed } from './runtime.mjs';
import { mixSeed } from './stats.mjs';
import { MODE } from './rules.mjs';

export const DEFAULT_COUNTS = {
  dev:     { novice: 150, skilled: 250, expert: 200, highLatency: 150, jitter: 150, reconnects: 100, searcher: 100 },
  heldout: { novice: 300, skilled: 500, expert: 400, highLatency: 300, jitter: 300, reconnects: 200, searcher: 200 },
};

// Each session's server seed is SPLIT_BASE + 100,000 * (kind's place in KINDS) + n, so the
// two splits' seeds never overlap. The game, the client and the links get their own seeds
// mixed from it.
const SPLIT_BASE = { dev: 1_000_000, heldout: 2_000_000 };
export const KINDS = ['novice', 'skilled', 'expert', 'highLatency', 'jitter', 'reconnects', 'searcher'];

export function makeCorpus({ split, counts = DEFAULT_COUNTS[split] }) {
  if (!(split in SPLIT_BASE)) throw new Error(`split must be 'dev' or 'heldout', not ${split}`);
  const cases = [];
  KINDS.forEach((kind, place) => {
    for (let n = 0; n < (counts[kind] ?? 0); n++) {
      const seed = SPLIT_BASE[split] + 100_000 * place + n;
      const { record, rounds } = playCorpusSession(kind, seed);
      cases.push({ id: `${split}-${kind}-${n}`, label: kind === 'searcher' ? 'cheat' : 'legal', kind, record, rounds });
    }
  });
  return cases;
}

// One corpus session: the client of this kind against the honest server, over its links.
// Tools may change what the client sees (screen 'full': the official client's full mode,
// or the searcher using the full view's fields) and the network (default: the kind's own).
export function playCorpusSession(kind, seed, { screen = 'drawn', network = null } = {}) {
  const client = kind === 'searcher'
    ? searcher(mixSeed(seed, 2), { perceive: screen === 'full' ? 'auto' : 'drawn' })
    : makePlayer(kind, mixSeed(seed, 2), { screen });
  const net = network ?? client.network;
  const server = createHonestServer({ seed });
  playSession({
    server,
    client,
    up: link({ seed: mixSeed(seed, 3), ...net }),
    down: link({ seed: mixSeed(seed, 4), ...net }),
  });
  return { record: server.record(), rounds: server.session().session.outcomes() };
}

// A Lob server for honest traffic, built for speed: one session (game seed
// sessionSeed(seed, 1), as the real server gives its first player), views handed over as
// objects, inputs not parsed. Honest clients send well-formed inputs, so the one input
// it drops is an input the network delivered after a newer one. An input that the
// rules would refuse for any other reason means a client model is broken: it throws.
export function createHonestServer({ seed, mode = MODE }) {
  const gameSeed = sessionSeed(seed, 1);
  const session = createLobSession({ seed: gameSeed, mode });
  const entry = { token: 's1', seed: gameSeed, session, game: session.game };
  const inputs = [];
  let queue = [];
  let newestSeq = 0;
  let firedRound = 0;
  return {
    join: () => 's1',
    session: () => entry,
    receive(token, text) { queue.push(text); },
    tick() {
      if (session.over()) return [];
      for (const text of queue) {
        const input = JSON.parse(text);
        if (input.seq <= newestSeq) continue; // overtaken on the way
        const { tick, round, flying } = session.facts();
        if (flying || (input.fire && firedRound === round)) {
          throw new Error(`corpus: a client model sent an input the rules refuse (game seed ${gameSeed}, tick ${tick}): ${text}`);
        }
        session.apply(input);
        newestSeq = input.seq;
        if (input.fire) firedRound = round;
        inputs.push({ n: inputs.length + 1, tick, seq: input.seq, angle: input.angle, power: input.power, fire: input.fire });
      }
      queue = [];
      session.step();
      return [{ token: 's1', view: fullView(session.game, { tick: session.tick, ack: newestSeq }) }];
    },
    record: () => ({ v: 1, game: 'lob', mode, seed: gameSeed, inputs: inputs.map((i) => ({ ...i })), end: session.tick, final: session.final() }),
  };
}
