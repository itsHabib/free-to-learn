// Legal player models: people playing Lob through the official client.
// A player sees only what screen.show(now) returns. Each round they notice it, think,
// press keys at a human pace (sending an input whenever the values change), fire once,
// read the result and correct toward it the next time.
//
// Their aim is the true mapping from the game itself (where a shell lands for an angle,
// a power and a wind level; the official client could ship such a table), plus what a
// person adds: a per-session bias, per-shot noise, and a lead for the flag's motion
// that is only as good as what they see on screen.
import { createScreen } from './client.mjs';
import { createFlightLab } from './lob.mjs';
import { makeRandom, mixSeed } from './stats.mjs';
import { ANGLE, POWER, FLAG, TICK_MS } from './rules.mjs';

// How each kind of player behaves. Times are medians of lognormal draws, in ms.
// Bias and noise are in paces of landing distance; `lead` is the share of the flag's
// apparent motion they allow for (drawn once per session from the range), over the
// shell's flight, plus their one-way delay for players who `leadsPing`; `learn` is how far
// they move their aim toward correcting each miss.
export const PROFILES = {
  novice:  { reactionMs: 900, fireMs: 5000, angles: [35, 60], lead: [0, 0],       biasSd: 70, noiseSd: 60, learn: 0.2, angleChange: 0.25 },
  skilled: { reactionMs: 600, fireMs: 3000, angles: [40, 55], lead: [0.5, 0.65],  biasSd: 25, noiseSd: 16, learn: 0.4, angleChange: 0.15 },
  expert:  { reactionMs: 450, fireMs: 2000, angles: [30, 50], lead: [0.88, 0.98], biasSd: 15, noiseSd: 8,  learn: 0.6, angleChange: 0.1, leadsPing: true },
};

// The kinds the corpus uses: three skill levels on an ordinary connection, and skilled
// players on three hard ones.
export const PLAYER_KINDS = {
  novice:      { profile: 'novice',  network: { oneWayMs: 30, jitterMs: 10 } },
  skilled:     { profile: 'skilled', network: { oneWayMs: 30, jitterMs: 10 } },
  expert:      { profile: 'expert',  network: { oneWayMs: 30, jitterMs: 10 } },
  highLatency: { profile: 'skilled', network: { oneWayMs: 250, jitterMs: 30 } },
  jitter:      { profile: 'skilled', network: { oneWayMs: 60, jitterMs: 60 } },   // packets overtake each other
  reconnects:  { profile: 'skilled', network: { oneWayMs: 40, jitterMs: 10, outages: true } }, // 2-3 outages of 2-6 s
};

const POLL_MS = [80, 130];       // how often a player glances at the screen
const CADENCE_MS = [80, 250];    // the gap between two inputs while pressing keys
const LEAD_WINDOW_MS = 500;      // the motion they judge the flag's speed from
const ROUND_DEADLINE_MS = 9000;  // a player fires before this long after they saw the round start
const REFIRE_TICKS = 20;         // no acknowledgement a second (plus a round trip) after firing: the fire was lost

// makePlayer(kind, seed, { screen, hooks }) -> a client model for sim.mjs.
//   screen  'drawn' (default) or 'full': the official client's mode
//   hooks   for the protocol cheats in adversaries.mjs only:
//           shapeInput(message, ctx) -> the texts to send for one input
//           onGlance(shown, now, ctx) -> extra texts to send at a glance at the screen
export function makePlayer(kind, seed, { screen: screenMode = 'drawn', hooks = {} } = {}) {
  const spec = PLAYER_KINDS[kind];
  if (!spec) throw new Error(`unknown player kind ${kind}; the kinds are ${Object.keys(PLAYER_KINDS).join(', ')}`);
  const profile = PROFILES[spec.profile];
  const session = makeRandom(mixSeed(seed, 1)); // who this player is today
  const timing = makeRandom(mixSeed(seed, 2));  // when they act
  const hand = makeRandom(mixSeed(seed, 3));    // how their shots scatter
  const screen = createScreen({ mode: screenMode });

  const network = { ...spec.network, outages: spec.network.outages ? drawOutages(session) : [] };
  const preferredAngle = session.int(profile.angles[0], profile.angles[1]);
  const lead = session.uniform(profile.lead[0], profile.lead[1]);
  const bias = session.normal() * profile.biasSd;

  let seq = 0;
  let sent = { angle: 45, power: 60 }; // the game starts at angle 45, power 60
  let correction = 0;                  // paces, learned from results
  let phase = 'watch';                 // watch -> notice -> act -> fired -> watch
  let wakeAt = 0;
  let lastRound = 0;                   // the last round this player started on
  let round = null;                    // this round's plan
  let fired = null;                    // { round, seq, firstTick, refires, text, landAt }
  let samples = [];                    // [ms, flag] of recent glances, for the lead
  let lastMessageAt = null;

  // What a hook (adversaries.mjs) may use: a fresh seq, the round the player is on and
  // the player's last fire.
  const ctx = {
    nextSeq: () => ++seq,
    get round() { return round ? round.number : 0; },
    get lastFire() { return fired; },
  };

  function input(fields, fire, now, out) {
    seq += 1;
    const message = { v: 1, seq, angle: fields.angle, power: fields.power, fire };
    sent = { angle: fields.angle, power: fields.power };
    screen.sent(seq, now);
    const texts = hooks.shapeInput ? hooks.shapeInput(message, ctx) : [JSON.stringify(message)];
    out.push(...texts);
    return texts[texts.length - 1];
  }

  // The flag's speed as it looked on screen over the last half second, paces per second
  // (the slope of a straight line through their glances).
  function apparentSpeed(now) {
    const recent = samples.filter(([t]) => t >= now - LEAD_WINDOW_MS);
    if (recent.length < 2 || recent[recent.length - 1][0] - recent[0][0] < 150) return 0;
    const n = recent.length;
    let st = 0, sf = 0, stt = 0, stf = 0;
    for (const [t, f] of recent) { st += t; sf += f; stt += t * t; stf += t * f; }
    return ((n * stf - st * sf) / (n * stt - st * st)) * 1000;
  }

  // Where to aim: the flag as shown, led by the share of its motion this player allows
  // for over the shell's flight (bouncing off the ends as the flag does). `landAt` is
  // where they want the shell to land; the power they pick for it carries what they have
  // learned, their bias and (for the real shot) their noise.
  function aim(shown, now, noise) {
    const angle = round.angle;
    const speed = apparentSpeed(now);
    let landAt = shown.flag;
    let power = powerFor(angle, shown.wind, landAt + correction + bias);
    // Experts also allow for their own delay, the ping the official client shows.
    const extra = profile.leadsPing ? shown.delayMs / 1000 : 0;
    for (let i = 0; i < 2; i++) {
      landAt = bounce(shown.flag + lead * speed * (flightSeconds(angle, power, shown.wind) + extra));
      power = powerFor(angle, shown.wind, landAt + correction + bias + noise);
    }
    return { angle, power: clamp(Math.round(power), POWER.min, POWER.max), landAt };
  }

  function startRound(shown, now) {
    const deadline = round.seenAt + ROUND_DEADLINE_MS;
    const fireAt = Math.min(now + Math.round(timing.lognormal(profile.fireMs, 0.4)), deadline);
    const walkStart = now + timing.int(100, 300);
    const walkMs = Math.max(1, (fireAt - walkStart) * timing.uniform(0.5, 0.8));
    const angle = timing.chance(profile.angleChange)
      ? clamp(preferredAngle + timing.pick([-3, -2, -1, 1, 2, 3]), ANGLE.min, ANGLE.max)
      : preferredAngle;
    round = { ...round, angle, fireAt, walkStart, walkMs, nextInputAt: walkStart, from: { ...sent } };
    round.target = aim(shown, now, 0);
  }

  function walk(now, out) {
    const f = Math.min(1, (now - round.walkStart) / round.walkMs);
    const angle = Math.round(round.from.angle + (round.target.angle - round.from.angle) * f);
    const power = Math.round(round.from.power + (round.target.power - round.from.power) * f);
    if (angle !== sent.angle || power !== sent.power) input({ angle, power }, false, now, out);
    round.nextInputAt = f < 1 ? now + timing.int(CADENCE_MS[0], CADENCE_MS[1]) : Infinity;
  }

  function watch(shown, now) {
    if (shown && shown.round > lastRound && !shown.flying && !shown.impact) {
      lastRound = shown.round;
      round = { number: shown.round, seenAt: now };
      phase = 'notice';
      wakeAt = now + Math.round(timing.lognormal(profile.reactionMs, 0.35));
      return;
    }
    wakeAt = now + timing.int(POLL_MS[0], POLL_MS[1]);
  }

  return {
    kind,
    network,

    onMessage(body, atMs) {
      const resumed = lastMessageAt !== null && atMs - lastMessageAt > 1000;
      screen.receive(body, atMs);
      lastMessageAt = atMs;
      // The first message after a fire: from here the player counts the server's ticks.
      if (fired && fired.firstTick === null) fired.firstTick = screen.latest().tick;
      // Back after an outage: the next input is max(own seq, server's ack) + 1.
      if (resumed) seq = Math.max(seq, screen.latest().ack);
    },

    nextWake: () => wakeAt,

    wake(now) {
      const out = [];
      const shown = screen.show(now);
      if (shown) {
        samples.push([now, shown.flag]);
        if (samples.length > 16) samples = samples.slice(-16);
        if (hooks.onGlance) out.push(...hooks.onGlance(shown, now, ctx));
      }
      if (phase === 'watch') {
        watch(shown, now);
      } else if (phase === 'notice') {
        if (!shown || shown.round !== round.number || shown.flying || shown.impact) { phase = 'watch'; watch(shown, now); return out; }
        startRound(shown, now);
        phase = 'act';
      }
      if (phase === 'act') {
        if (!shown || shown.round !== round.number || shown.flying || shown.impact) { phase = 'watch'; watch(shown, now); return out; }
        if (now >= round.fireAt) {
          const final = aim(shown, now, hand.normal() * profile.noiseSd);
          const text = input(final, true, now, out);
          fired = { round: round.number, seq, firstTick: null, refires: 0, text, landAt: final.landAt };
          phase = 'fired';
          wakeAt = now + timing.int(POLL_MS[0], POLL_MS[1]);
        } else {
          if (now >= round.nextInputAt) walk(now, out);
          wakeAt = Math.min(round.nextInputAt, round.fireAt, now + 100);
        }
        return out;
      }
      if (phase === 'fired') {
        const miss = shown && shown.round === fired.round ? missFrom(shown.message) : null;
        if (miss !== null) {
          // Correct toward where the shell should have landed: the impact mark against the
          // spot they aimed for (or the message's miss when the mark is not on screen).
          const error = shown.impact ? shown.impact.x - fired.landAt : miss;
          correction -= profile.learn * error;
          phase = 'watch';
          wakeAt = now + timing.int(POLL_MS[0], POLL_MS[1]);
        } else if (shown && shown.round > fired.round) {
          phase = 'watch';
          watch(shown, now);
        } else {
          const wait = REFIRE_TICKS + Math.ceil((2 * (shown ? shown.delayMs : 0)) / TICK_MS);
          const unanswered = fired.firstTick !== null && shown && shown.tick > fired.firstTick + wait && shown.ack < fired.seq;
          if (unanswered && !shown.flying && !shown.impact && fired.refires < 5) {
            // A second of the server's ticks (plus a round trip) since we fired, and it never
            // acknowledged the fire: it was lost on the way. Fire again.
            const text = input(sent, true, now, out);
            fired = { ...fired, seq, firstTick: null, refires: fired.refires + 1, text };
          }
          wakeAt = now + timing.int(POLL_MS[0], POLL_MS[1]);
        }
      }
      return out;
    },
  };
}

// The result message as a signed miss: SHORT BY 37 is -37, LONG BY 5 is 5, HIT! is 0.
function missFrom(message) {
  if (message === 'HIT!') return 0;
  const m = /^(SHORT|LONG) BY (\d+)$/.exec(message);
  if (!m) return null;
  return m[1] === 'SHORT' ? -Number(m[2]) : Number(m[2]);
}

// 2 or 3 outages of 2 to 6 s, spread over the first minute of the session.
function drawOutages(random) {
  const n = random.int(2, 3);
  const slot = Math.floor(60000 / n);
  const outages = [];
  for (let i = 0; i < n; i++) {
    const at = 3000 + i * slot + Math.floor(random.uniform(0, slot - 6000));
    outages.push({ at, ms: random.int(2000, 6000) });
  }
  return outages;
}

// The true mapping. For an angle: where the shell lands and how many frames it flies,
// for every power and every wind level, with the wind at the middle of the level's band
// (the arrows are all a player knows). Computed once from the game, then reused.
let lab = null;
const tables = new Map();

export function windMidpoint(level) {
  if (level >= 3) return 4.375;   // the band is 3.75 to 5
  if (level <= -3) return -4.375;
  return level * 1.5;
}

export function rangeTable(angle) {
  let table = tables.get(angle);
  if (!table) {
    lab ??= createFlightLab();
    table = {};
    for (let level = -3; level <= 3; level++) {
      const x = [], frames = [];
      for (let power = POWER.min; power <= POWER.max; power++) {
        const shot = lab.fly(angle, power, windMidpoint(level));
        x.push(shot.x);
        frames.push(shot.frames);
      }
      table[level] = { x, frames };
    }
    tables.set(angle, table);
  }
  return table;
}

// The power (a fraction, between whole powers) that lands at targetX for this angle and
// wind level, by the table.
export function powerFor(angle, level, targetX) {
  const { x } = rangeTable(angle)[clamp(level, -3, 3)];
  if (targetX <= x[0]) return POWER.min;
  for (let i = 1; i < x.length; i++) {
    if (targetX < x[i]) return POWER.min + i - 1 + (targetX - x[i - 1]) / (x[i] - x[i - 1]);
  }
  return POWER.max;
}

export function flightSeconds(angle, power, level) {
  const { frames } = rangeTable(angle)[clamp(level, -3, 3)];
  return frames[clamp(Math.round(power), POWER.min, POWER.max) - POWER.min] / 60;
}

// A position past either end of the flag's range, folded back the way the flag bounces.
function bounce(x) {
  if (x > FLAG.max) return Math.max(FLAG.min, 2 * FLAG.max - x);
  if (x < FLAG.min) return Math.min(FLAG.max, 2 * FLAG.min - x);
  return x;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}
