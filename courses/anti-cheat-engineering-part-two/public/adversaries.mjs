// Clients that break the rules, for testing the Lob server. They exist only for this
// course's game.
//
// Protocol cheats play like a skilled player (players.mjs) and are honest except for
// one thing:
//   hitClaim    every fire carries an extra field `hit: true`, and once a session it
//               sends an input claiming `score: 99`
//   fireTwice   after each fire, fires again in the same round: once while the shell
//               flies, once after it lands
//   outOfRange  after one input each round it sends a copy with power 150; once a
//               session a copy with angle 4, and once one with power 60.5
//   replay      after each round, re-sends its previous round's fire byte for byte
//
// The searching client plays Lob with its own copy of the game. Each round it searches
// angle and power for the shot whose landing is nearest the flag at landing, using
// whatever the server sent. It shows that a client is bounded by what it is sent:
// every shot it fires is a legal input.
import { makePlayer, windMidpoint } from './players.mjs';
import { createFlightLab, makeLob } from './lob.mjs';
import { perceive as perceiveView } from './client.mjs';
import { makeRandom, mixSeed } from './stats.mjs';
import { TICK_MS, FRAMES_PER_TICK, ANGLE, POWER, FLAG } from './rules.mjs';

// ------------------------------------------------------------------ protocol cheats

export function hitClaim(seed) {
  let claimed = false;
  return makePlayer('skilled', seed, {
    hooks: {
      shapeInput: (message) => [JSON.stringify(message.fire ? { ...message, hit: true } : message)],
      onGlance(shown, now, ctx) {
        if (claimed || shown.round < 2) return [];
        claimed = true;
        return [JSON.stringify({ v: 1, seq: ctx.nextSeq(), angle: shown.angle, power: shown.power, fire: false, score: 99 })];
      },
    },
  });
}

export function fireTwice(seed) {
  let whileFlying = 0, afterLanding = 0; // the rounds already done
  return makePlayer('skilled', seed, {
    hooks: {
      onGlance(shown, now, ctx) {
        const fire = ctx.lastFire;
        if (!fire || shown.round !== fire.round) return [];
        const again = () => [JSON.stringify({ v: 1, seq: ctx.nextSeq(), angle: shown.angle, power: shown.power, fire: true })];
        if (shown.flying && whileFlying !== fire.round) { whileFlying = fire.round; return again(); }
        if (shown.impact && afterLanding !== fire.round) { afterLanding = fire.round; return again(); }
        return [];
      },
    },
  });
}

export function outOfRange(seed) {
  let lastRound = 0, angleSent = false, halfSent = false;
  return makePlayer('skilled', seed, {
    hooks: {
      shapeInput(message, ctx) {
        const texts = [JSON.stringify(message)];
        if (ctx.round > lastRound) {
          lastRound = ctx.round;
          texts.push(JSON.stringify({ ...message, seq: ctx.nextSeq(), power: 150 }));
        }
        if (!angleSent && ctx.round >= 2) { angleSent = true; texts.push(JSON.stringify({ ...message, seq: ctx.nextSeq(), angle: 4 })); }
        if (!halfSent && ctx.round >= 3) { halfSent = true; texts.push(JSON.stringify({ ...message, seq: ctx.nextSeq(), power: 60.5 })); }
        return texts;
      },
    },
  });
}

export function replay(seed) {
  let replayed = 0;
  return makePlayer('skilled', seed, {
    hooks: {
      onGlance(shown, now, ctx) {
        const fire = ctx.lastFire;
        if (!fire || shown.round <= fire.round || replayed === fire.round) return [];
        replayed = fire.round;
        return [fire.text]; // the previous round's fire, byte for byte, same seq
      },
    },
  });
}

// ------------------------------------------------------------------ the searching client

// searcher(seed, opts) -> a client model for sim.mjs.
//   perceive     'auto' (use full-view fields when the server sends them) or 'drawn'
//                (ignore them: see only what the official client draws)
//   fireAfterMs  it fires this long after the round's first message arrives
//   tieMargin    paces: among shots this close to the best, it takes the shortest flight
//                (0, the default: only exact ties)
export function searcher(seed, { perceive = 'auto', fireAfterMs = [400, 500], tieMargin = 0 } = {}) {
  const random = makeRandom(mixSeed(seed, 7));
  const aim = createSearchAim({ perceive, tieMargin });
  let seq = 0, wakeAt = Infinity, planned = 0, fired = 0;
  return {
    kind: 'searcher',
    network: { oneWayMs: 30, jitterMs: 10 },
    onMessage(body, atMs) {
      aim.receive(body, atMs);
      const round = aim.round();
      if (round.number > planned && !round.shot) {
        planned = round.number;
        wakeAt = round.firstArrival + random.int(fireAfterMs[0], fireAfterMs[1]);
      }
    },
    nextWake: () => wakeAt,
    wake(now) {
      wakeAt = Infinity;
      const round = aim.round();
      if (round.number !== planned || round.shot || fired === round.number) return [];
      fired = round.number;
      const { angle, power } = aim.choose(now);
      seq += 1;
      aim.sent(seq, now);
      return [JSON.stringify({ v: 1, seq, angle, power, fire: true })];
    },
  };
}

// The searching client's eyes and aim: it reads every message, measures its round trip,
// follows the flag, and picks the shot. Exported so tools can drive it; the searcher
// above is the only client in this file that uses it.
export function createSearchAim({ perceive = 'auto', tieMargin = 0 } = {}) {
  let newest = null;        // { seen, game, arrivedAt }
  const clock = [];         // recent tick * TICK_MS - arrival: the largest is the least delayed message
  const sentAt = new Map(); // seq -> ms sent
  const trips = [];         // recent round trips, ms
  let round = { number: 0, firstArrival: 0, shot: false };
  let track = [];           // [tick, flag] of the newest messages this round
  let segment = 0;          // where the flag's current straight run starts in track
  let bounced = null;       // the speed (paces per tick) seeded by a bounce, until the run has points

  // Its one-way delay: half the shortest recent round trip. Before its first round trip
  // it reads the delay off the messages' ticks, trusting its clock to agree with the
  // server's (the smallest arrival - tick * TICK_MS seen).
  const delayMs = () => (trips.length ? Math.min(...trips) / 2 : -Math.max(...clock));
  // The server's clock at client time t, from the least delayed recent message.
  const serverTime = (t) => t + Math.max(...clock) + delayMs();
  // When an input sent at t reaches the server, in the server's time.
  const arrivalAt = (t) => serverTime(t) + delayMs();

  function fitRun(points) {
    // Least squares line through (tick, flag): flag = a + b * tick.
    const n = points.length;
    let st = 0, sf = 0, stt = 0, stf = 0;
    for (const [t, f] of points) { st += t; sf += f; stt += t * t; stf += t * f; }
    const d = n * stt - st * st;
    const b = d === 0 ? 0 : (n * stf - st * sf) / d;
    return { a: (sf - b * st) / n, b };
  }

  function follow(tick, flag) {
    const run = track.slice(segment);
    track.push([tick, flag]);
    if (run.length < 2) return;
    const { a, b } = fitRun(run);
    const predicted = a + b * tick;
    if (predicted > FLAG.max || predicted < FLAG.min) {
      segment = track.length - 1; // it bounced: the same speed, the other way
      bounced = -b;
    } else if (run.length >= 3 && Math.abs(flag - predicted) > 1.5) {
      segment = track.length - 1; // it changed speed
      bounced = null;
    }
  }

  // The flag now (at the newest message's tick) and its speed in paces per tick.
  function flagEstimate() {
    const run = track.slice(segment);
    const [tick, flag] = track[track.length - 1];
    if (run.length >= 3) { const { a, b } = fitRun(run); return { x: a + b * tick, speed: b }; }
    if (bounced !== null) return { x: flag, speed: bounced };
    if (run.length === 2) return { x: flag, speed: (run[1][1] - run[0][1]) / (run[1][0] - run[0][0]) };
    return { x: flag, speed: 0 };
  }

  // Flag positions frame by frame from the newest message: exact from the full view's
  // fields (run in a local copy of the game), or estimated: a straight run at the
  // estimated speed, bouncing at both ends the way the game does.
  function flagPath(frames, game) {
    const path = new Float64Array(frames + 1);
    if (game) {
      local ??= makeLob({ seed: 1, mode: 9 });
      local.write('flying', 0);
      local.write('targetX', game.targetX);
      local.write('flagSpeed', game.flagSpeed);
      local.write('flagTimer', game.flagTimer);
      local.write('rng', game.rng);
      path[0] = local.targetX();
      for (let j = 1; j <= frames; j++) { local.tick(1); path[j] = local.targetX(); }
      return path;
    }
    let { x, speed } = flagEstimate();
    let perFrame = speed / FRAMES_PER_TICK;
    path[0] = x;
    for (let j = 1; j <= frames; j++) {
      x += perFrame;
      if (x < FLAG.min) { x = FLAG.min; perFrame = -perFrame; }
      if (x > FLAG.max) { x = FLAG.max; perFrame = -perFrame; }
      path[j] = x;
    }
    return path;
  }

  return {
    sent(seq, atMs) { sentAt.set(seq, atMs); },

    receive(body, atMs) {
      const view = typeof body === 'string' ? JSON.parse(body) : body;
      for (const [seq, at] of sentAt) {
        if (view.ack >= seq) { trips.push(atMs - at); if (trips.length > 8) trips.shift(); sentAt.delete(seq); }
      }
      clock.push(view.tick * TICK_MS - atMs);
      if (clock.length > 40) clock.shift();
      if (newest && view.tick <= newest.seen.tick) return;
      const seen = perceiveView(view, 'drawn');
      const g = view.game;
      const exact = perceive !== 'drawn' && g && ['windExact', 'flagSpeed', 'flagTimer', 'rng', 'targetX'].every((k) => typeof g[k] === 'number');
      // A view that is not the full view but still sends the exact wind under the full
      // view's name gets used too: a client reads whatever it is sent.
      const looseWind = perceive !== 'drawn' && !exact && typeof view.windExact === 'number' ? view.windExact : null;
      newest = { seen, game: exact ? g : null, windExact: looseWind, arrivedAt: atMs };
      if (seen.round !== round.number) {
        round = { number: seen.round, firstArrival: atMs, shot: false };
        track = []; segment = 0; bounced = null;
      }
      if (seen.flying || seen.impact) round.shot = true;
      follow(seen.tick, seen.flag);
    },

    round: () => round,

    // The shot to fire now. A round trip includes the wait for the server's next tick, so
    // the delay estimate runs a little long: the fire may reach the server up to 30 ms
    // before the estimate (or 10 ms after), which can be either of two ticks.
    choose(now) {
      const arrival = arrivalAt(now);
      const ticks = [...new Set([Math.ceil((arrival - 30) / TICK_MS), Math.ceil((arrival + 10) / TICK_MS)])];
      // The fire is applied before tick k runs, after k - 1 ticks: frames from the newest message.
      const fireFrames = ticks.map((k) => Math.max(0, FRAMES_PER_TICK * (k - 1 - newest.seen.tick)));
      const wind = newest.game ? newest.game.windExact : (newest.windExact ?? windMidpoint(newest.seen.wind));
      const path = flagPath(Math.max(...fireFrames) + 400, newest.game);
      return search(wind, path, fireFrames, tieMargin);
    },
  };
}

let local = null; // the searcher's local copy of the game, for exact flag paths
let range = null; // its firing range

// Coarse then fine: every fourth angle, then the angles around the best of those, each
// with its best power found by bisection. A shot's miss is its landing minus the flag at
// landing; it is judged by its worst miss over the ticks the fire might be applied in.
// The nearest wins; among shots within tieMargin of it, the shortest flight.
function search(wind, path, fireFrames, tieMargin) {
  range ??= createFlightLab();
  const flights = new Map();
  const judge = (angle, power) => {
    const key = angle * 128 + power;
    let shot = flights.get(key);
    if (!shot) {
      const { x, frames } = range.fly(angle, power, wind);
      let worst = 0, sum = 0;
      for (const f of fireFrames) {
        const miss = x - path[Math.min(path.length - 1, f + frames)];
        worst = Math.max(worst, Math.abs(miss));
        sum += miss;
      }
      shot = { angle, power, frames, worst, miss: sum / fireFrames.length };
      flights.set(key, shot);
    }
    return shot;
  };
  const bestPower = (angle) => {
    let lo = judge(angle, POWER.min), hi = judge(angle, POWER.max);
    if (lo.miss >= 0) return lo;
    if (hi.miss <= 0) return hi;
    while (hi.power - lo.power > 1) {
      const mid = judge(angle, (lo.power + hi.power) >> 1);
      if (mid.miss < 0) lo = mid; else hi = mid;
    }
    return lo.worst <= hi.worst ? lo : hi;
  };

  const best = new Map(); // angle -> best shot at that angle
  const tryAngle = (angle) => { if (angle >= ANGLE.min && angle <= ANGLE.max && !best.has(angle)) best.set(angle, bestPower(angle)); };
  for (let angle = ANGLE.min; angle <= ANGLE.max; angle += 4) tryAngle(angle);
  const coarse = [...best.values()];
  const top = Math.min(...coarse.map((s) => s.worst));
  const closest = coarse.find((s) => s.worst === top);
  for (let d = -3; d <= 3; d++) tryAngle(closest.angle + d);

  const shots = [...best.values()];
  const bestWorst = Math.min(...shots.map((s) => s.worst));
  const pick = shots
    .filter((s) => s.worst <= bestWorst + tieMargin)
    .sort((a, b) => a.frames - b.frames || a.worst - b.worst || a.angle - b.angle)[0];
  return { angle: pick.angle, power: pick.power, expectedMiss: pick.miss, frames: pick.frames };
}
