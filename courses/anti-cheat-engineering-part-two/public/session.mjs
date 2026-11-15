// One player's Lob game as the server runs it. An admitted intent becomes key presses;
// each server tick runs three frames; the session starts and ends rounds.
// The runtime, the corpus and your replay all drive Lob through this file, so a game
// replayed from a record runs exactly as it ran live.
//
// Ticks are counted as "ticks run so far". The session starts at tick 0 with round 1.
// An intent applied now belongs to tick `session.tick` (it acts before the next tick's
// frames). A view built after step() shows the game after `session.tick` ticks.
import { makeLob } from './lob.mjs';
import {
  MODE, FRAMES_PER_TICK, RESULT_TICKS, ROUND_LIMIT_TICKS, ROUNDS_PER_SESSION, ANGLE, POWER, KEYS,
} from './rules.mjs';

const RESULTS = { 1: 'hit', 2: 'short', 3: 'long' };

export function createLobSession({ seed, mode = MODE, rounds = ROUNDS_PER_SESSION }) {
  const game = makeLob({ seed, mode });
  let tick = 0;
  let over = false;
  let nextRoundAt = null; // the tick the next round starts, once the shell has landed
  const played = [];
  let current = beginRound(game.round(), 0);

  function beginRound(round, start) {
    const outcome = { round, start, shot: null, impact: null, flag: null, miss: null, result: null, inputs: 0 };
    played.push(outcome);
    return outcome;
  }

  // The shell has just landed (this frame). The first landing of a round is its outcome.
  function landed() {
    if (current.impact !== null) return;
    const impact = game.impact().x;
    const flag = game.targetX();
    current.impact = round2(impact);
    current.flag = round2(flag);
    current.miss = round2(impact - flag);
    current.result = RESULTS[game.exports.r_result()] ?? null;
  }

  return {
    game,
    get tick() { return tick; },
    get round() { return current.round; },

    facts: () => ({ tick, round: current.round, flying: game.flying(), fired: current.shot !== null }),

    // Press keys until the game's angle and power equal the intent's (one step per press),
    // then SPACE if the intent fires. The caller has already admitted the intent.
    apply(intent) {
      if (over) return;
      pressToward(game, Math.round(game.angle()), intent.angle, ANGLE, KEYS.RIGHT, KEYS.LEFT);
      pressToward(game, game.power(), intent.power, POWER, KEYS.UP, KEYS.DOWN);
      current.inputs += 1;
      if (intent.fire) {
        const shotsBefore = game.shots();
        game.key(KEYS.SPACE);
        if (game.shots() > shotsBefore && current.shot === null) {
          current.shot = { tick, angle: Math.round(game.angle()), power: game.power() };
        }
      }
    },

    // One server tick: three frames, then round scheduling.
    step() {
      if (over) return;
      let landedNow = false;
      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        const wasFlying = game.flying();
        game.tick(1);
        if (wasFlying && !game.flying()) { landedNow = true; landed(); }
      }
      tick += 1;
      if (landedNow) nextRoundAt = tick + RESULT_TICKS;
      const unshot = current.shot === null && tick - current.start >= ROUND_LIMIT_TICKS;
      const resultShown = nextRoundAt === tick;
      if (!unshot && !resultShown) return;
      nextRoundAt = null;
      if (game.flying()) return; // a shell still in the air: its landing schedules the next round
      if (current.round >= rounds) { over = true; return; }
      game.key(KEYS.NEW_ROUND);
      current = beginRound(game.round(), tick);
    },

    // Per round, in order: { round, start, shot, impact, flag, miss, result, inputs }.
    outcomes: () => played.map((o) => ({ ...o, shot: o.shot && { ...o.shot } })),
    over: () => over,
    final: () => ({ round: game.round(), score: game.score(), shots: game.shots(), angle: Math.round(game.angle()), power: game.power() }),
  };
}

// Press `up` or `down` until the value reaches the target (kept inside its range).
function pressToward(game, value, target, { min, max }, up, down) {
  if (typeof target !== 'number' || !Number.isFinite(target)) return;
  const goal = Math.min(max, Math.max(min, Math.round(target)));
  for (let v = value; v < goal; v++) game.key(up);
  for (let v = value; v > goal; v--) game.key(down);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
