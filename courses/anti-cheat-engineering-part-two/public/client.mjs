// The official client: what a player's screen shows, given the server's messages so far.
// It draws the same screen from either view: the HUD (angle, power, wind arrows,
// score), the message, the flag, the shell, the impact mark. Its newest message is
// already old when it arrives, so it draws the flag where it estimates the flag is now,
// in mode 'full' from the full view and in mode 'drawn' from a drawn view.
// It estimates its one-way delay as half its measured round trip: it stamps the time
// each input is sent, and the first message whose `ack` reaches that seq closes the trip.
import { TICK_MS, FRAMES_PER_TICK, FLAG } from './rules.mjs';

const TRIPS_KEPT = 8;

export function createScreen({ mode = 'drawn' } = {}) {
  let newest = null;        // { seen, arrivedAt, flagState }
  let track = [];           // [tick, flag] of the newest messages this round, oldest first
  const sentAt = new Map(); // seq -> ms it was sent
  const trips = [];         // the latest round trips, ms

  // Half the shortest recent round trip: the shortest is the one that waited least for
  // the server's next tick.
  const delayMs = () => (trips.length ? Math.min(...trips) / 2 : 0);

  function velocityPerTick() {
    const [t1, f1] = track[track.length - 1];
    for (let i = track.length - 2; i >= 0; i--) {
      const [t0, f0] = track[i];
      if (f0 !== f1) return (f1 - f0) / (t1 - t0);
    }
    return 0;
  }

  return {
    mode,
    sent(seq, atMs) {
      sentAt.set(seq, atMs);
    },

    receive(body, atMs) {
      const view = typeof body === 'string' ? JSON.parse(body) : body;
      for (const [seq, at] of sentAt) {
        if (view.ack >= seq) {
          trips.push(atMs - at);
          if (trips.length > TRIPS_KEPT) trips.shift();
          sentAt.delete(seq);
        }
      }
      if (newest && view.tick <= newest.seen.tick) return; // older than what is shown
      const seen = perceive(view, mode);
      if (!newest || seen.round !== newest.seen.round) track = [];
      track.push([seen.tick, Math.round(seen.flag)]);
      if (track.length > 12) track.shift();
      const flagState = mode === 'full' && view.game
        ? { x: view.game.targetX, v: view.game.flagSpeed, timer: view.game.flagTimer, rng: view.game.rng }
        : null;
      newest = { seen, arrivedAt: atMs, flagState };
    },

    // The screen at atMs, or null before the first message.
    show(atMs) {
      if (!newest) return null;
      const ageMs = atMs - newest.arrivedAt + delayMs();
      let flag;
      if (newest.flagState) {
        flag = moveFlag(newest.flagState, FRAMES_PER_TICK * Math.floor(ageMs / TICK_MS)).x;
      } else {
        flag = Math.min(FLAG.max, Math.max(FLAG.min, newest.seen.flag + velocityPerTick() * (ageMs / TICK_MS)));
      }
      return { ...newest.seen, flag, delayMs: delayMs(), ageMs };
    },

    // The newest message as perceived, without running anything forward.
    latest: () => (newest ? newest.seen : null),
  };
}

// What the screen takes from a message. A full view is drawn the same way as a drawn
// view (arrows only, whole paces), except that mode 'full' keeps the flag's exact x to
// run it forward.
export function perceive(view, mode = 'drawn') {
  if (view.game) {
    const g = view.game;
    return {
      tick: view.tick, ack: view.ack,
      round: g.round, score: g.score, shots: g.shots,
      angle: Math.round(g.angle), power: g.power, wind: g.windLevel,
      flag: mode === 'full' ? g.targetX : Math.round(g.targetX),
      flying: g.flying,
      shell: g.flying ? [Math.round(g.px), Math.round(g.py)] : null,
      impact: g.impactAge >= 0 ? { x: Math.round(g.impactX), age: g.impactAge } : null,
      message: view.hud.message,
    };
  }
  return {
    tick: view.tick, ack: view.ack,
    round: view.round, score: view.score, shots: view.shots,
    angle: view.angle, power: view.power, wind: windLevel(view.wind),
    flag: view.flag,
    flying: view.shell !== null,
    shell: view.shell,
    impact: view.impact,
    message: view.message,
  };
}

// '>>' is 2, '<' is -1, '~' is 0.
export function windLevel(arrows) {
  if (typeof arrows !== 'string') return 0;
  let level = 0;
  for (const c of arrows) level += c === '>' ? 1 : c === '<' ? -1 : 0;
  return level;
}

// The moving flag, frame by frame, with the game's own single-precision arithmetic:
// slide by speed / 60, bounce off 420 and 900, and when the timer runs out pick a new
// speed and timer from the game's xorshift random state. Returns the state after `frames`.
const f32 = Math.fround;
const DT = f32(1 / 60);
export function moveFlag(start, frames) {
  const s = { ...start };
  for (let i = 0; i < frames; i++) {
    let x = f32(s.x + f32(s.v * DT));
    if (x < FLAG.min) { x = FLAG.min; s.v = -s.v; }
    if (x > FLAG.max) { x = FLAG.max; s.v = -s.v; }
    s.x = x;
    s.timer -= 1;
    if (s.timer <= 0) {
      s.v = f32(f32(f32(randomUnit(s) * 2) - 1) * 140);
      s.timer = 120 + (nextRandom(s) % 180);
    }
  }
  return s;
}
function nextRandom(s) {
  let x = s.rng;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  s.rng = x;
  return x;
}
function randomUnit(s) {
  return (nextRandom(s) >>> 8) / 16777216;
}
