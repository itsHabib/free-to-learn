// The Lob server. Each player who joins gets their own Lob session (session.mjs).
// Text in, text out: receive() queues a client's message; tick() decides on what
// arrived, runs one tick of every game and returns the messages to send.
// The trust decisions are hooks you supply:
//   admission  { parseInput, admit }   unit 12: which messages may change the game
//   view       view(game, info)        unit 13: what each tick's message says
//   recorder   createRecorder          unit 12: records what was admitted (optional)
import { createLobSession } from './session.mjs';
import { MODE, ROUNDS_PER_SESSION } from './rules.mjs';
import { mixSeed } from './stats.mjs';

// The game seed of the index-th player to join (1, 2, 3, ...): a 32-bit mix of the
// server's seed and the index (stats.mjs mixSeed), so every session has its own flags
// and winds and the same server seed always deals the same games.
export function sessionSeed(seed, index) {
  return mixSeed(seed, index);
}

export function createLobServer({
  seed, mode = MODE, admission, view, recorder = null, onEvent = null, rounds = ROUNDS_PER_SESSION,
}) {
  const sessions = [];
  const byToken = new Map();

  function entryFor(token) {
    const entry = byToken.get(token);
    if (!entry) throw new Error(`no session ${token}`);
    return entry;
  }

  function finishRecord(entry) {
    if (entry.recorder && !entry.record) entry.record = entry.recorder.finish(entry.session.tick, entry.session.final());
    return entry.record;
  }

  return {
    // For checks and tools: every session, in join order.
    sessions,
    session: entryFor,

    join() {
      const index = sessions.length + 1;
      const token = `s${index}`;
      const gameSeed = sessionSeed(seed, index);
      const session = createLobSession({ seed: gameSeed, mode, rounds });
      const entry = {
        token,
        seed: gameSeed,
        session,
        game: session.game,
        state: { lastSeq: 0, firedRound: 0 }, // admission state, given to admit and replaced by its `next`
        ack: 0,                              // the last admitted seq, sent back in every view
        queue: [],                           // texts received since the last tick, in arrival order
        decisions: [],                       // every text with what parseInput and admit said
        recorder: recorder ? recorder({ seed: gameSeed, mode }) : null,
        record: null,
        outcomes: () => session.outcomes(),
        final: () => session.final(),
      };
      sessions.push(entry);
      byToken.set(token, entry);
      return token;
    },

    receive(token, text) {
      entryFor(token).queue.push(text);
    },

    // One server tick for every session that is still playing.
    tick() {
      const messages = [];
      for (const entry of sessions) {
        const { session } = entry;
        if (session.over()) continue;
        const arrived = entry.queue;
        entry.queue = [];
        for (const text of arrived) {
          const { tick, round, flying } = session.facts();
          const parsed = admission.parseInput(text);
          let decision = null;
          if (parsed && parsed.ok) {
            decision = admission.admit(entry.state, parsed.input, { tick, round, flying });
            if (decision && decision.status === 'admitted') {
              session.apply(parsed.input);
              entry.state = decision.next;
              entry.ack = parsed.input.seq;
              if (entry.recorder) entry.recorder.admitted(tick, parsed.input);
            }
          }
          const event = { token: entry.token, tick, text, parsed, decision };
          entry.decisions.push(event);
          if (onEvent) onEvent(event);
        }
        session.step();
        if (session.over()) finishRecord(entry);
        messages.push({ token: entry.token, text: JSON.stringify(view(entry.game, { tick: session.tick, ack: entry.ack })) });
      }
      return messages;
    },

    // The session's record: finished when the session ended, or now if it is still playing.
    record: (token) => finishRecord(entryFor(token)),
  };
}
