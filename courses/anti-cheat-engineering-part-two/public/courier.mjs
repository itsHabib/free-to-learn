// public/courier.mjs (unit 15, supplied): part one's courier arena, played over a network.
//
// The game is part one's. A courier starts at the depot, walks the floor in 250 mm
// steps, picks up a parcel at the core and scores a point by carrying it back to the
// depot. The server owns every position. An interaction counts only when the server's
// own courier is within 250 mm of the target, and after one counts the next waits
// 4 ticks.
//
// What is new here is the network. A player's screen always shows the past: the newest
// server tick it has drawn. By the time a press reaches the server, the courier has
// walked on. A player 150 ms away who presses the moment the screen says "in range"
// can be refused although they did nothing wrong. Servers answer this by rewinding: they
// judge the press at the moment the player saw. Rewinding is also an opening, because
// "I saw it earlier" is a claim the client makes.
//
// This module holds:
//   1. the server: part one's movement and interaction rules, exactly, for one courier,
//      plus three things part one did not need:
//        - a ring that remembers the courier's position for the last 40 ticks;
//        - a `seen` field in every input: the newest server tick the client had drawn
//          when it sent the input;
//        - a ping every 10 ticks, so the server can measure each client's round trip.
//          The server keeps the last 20 round trips (in milliseconds).
//      The server does not decide interactions itself. It asks the judge you pass in.
//   2. a seeded network: each message takes a one-way latency plus a jitter;
//   3. client models: honest couriers on many kinds of connection, and two that lie
//      about `seen`, which the course uses to test your judge;
//   4. runCourier(), which plays many sessions and reports every interaction.
//
// Everything is seeded. The same call always gives the same numbers.

// ---------------------------------------------------------------------------
// The rules (part one's numbers)
// ---------------------------------------------------------------------------

export const TICK_MS = 50;           // one server tick
export const STEP = 250;             // mm the courier moves in one tick
export const MOVE_TICKS = 4;         // an admitted input moves the courier on each of the next 4 ticks
export const RANGE = 250;            // interaction range in mm (distance squared 62,500)
export const COOLDOWN_TICKS = 4;     // after an interaction counts, the next one waits this long
export const DEPOT = Object.freeze({ x: 1000, y: 1000 });
export const ARENA = Object.freeze({ width: 8000, height: 4000, wall: Object.freeze({ x: 4000, y: 0, width: 250, height: 2500 }) });
export const DIRECTIONS = Object.freeze({ N: [0, -STEP], S: [0, STEP], E: [STEP, 0], W: [-STEP, 0], idle: [0, 0] });

// What part two adds.
export const HISTORY_TICKS = 40;     // the position ring remembers this many ticks
export const PING_EVERY = 10;        // the server pings on every tick that is a multiple of 10
export const RTT_SAMPLES = 20;       // round-trip samples kept per session
export const SESSION_TICKS = 1200;   // one simulated session: 60 seconds

const INPUT_KEYS = ['interact', 'move', 'seen', 'seq', 'v'];

/** The core sits 2000, 2250 or 2500 mm along the floor, picked by the seed (part one's rule). */
export function corePosition(seed) {
  return { x: 2000 + (((seed % 3) + 3) % 3) * STEP, y: 1000 };
}

// ---------------------------------------------------------------------------
// The position ring
// ---------------------------------------------------------------------------

// Slot (tick % size) holds { tick, x, y }: where the courier stood at the end of that
// tick. Writing tick 40 overwrites the slot that held tick 0. A slot whose `tick` is not
// the tick you asked for means that tick is no longer remembered (or never was).

export function createHistory(size = HISTORY_TICKS) {
  return { size, slots: new Array(size).fill(null) };
}

export function recordPosition(history, tick, x, y) {
  history.slots[tick % history.size] = { tick, x, y };
}

// ---------------------------------------------------------------------------
// The server for one courier
// ---------------------------------------------------------------------------

function validInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) return false;
  return input.v === 1 && Number.isSafeInteger(input.seq) && input.seq >= 1 && input.seq <= 1_000_000
    && typeof input.move === 'string' && Object.hasOwn(DIRECTIONS, input.move) && typeof input.interact === 'boolean'
    && Number.isSafeInteger(input.seen) && input.seen >= 0;
}

function crossesWall(from, to) {
  const wall = ARENA.wall;
  const overlapsX = Math.max(from.x, to.x) >= wall.x && Math.min(from.x, to.x) <= wall.x + wall.width;
  const overlapsY = Math.max(from.y, to.y) >= wall.y && Math.min(from.y, to.y) <= wall.y + wall.height;
  return overlapsX && overlapsY;
}

/**
 * One courier's server.
 *
 *   seed        picks the core (and nothing else on the server)
 *   window      the most ticks the server will rewind; 0 judges every press at "now"
 *   judge       your judgeInteract: called once per interaction (see below)
 *   measureRtt  your measureRtt: turns the round-trip samples into a round trip in ticks
 *   positionAt  your positionAt: reads a tick out of the position ring
 *
 * Each tick, in this order (part one's order): inputs that arrived are admitted, then
 * step() advances one tick: the courier moves, its position goes into the ring, then a
 * pending interaction is decided by calling
 *
 *   judge({ seen, now, window, rtt, history, target, range, readyAt, positionAt })
 *
 * with seen from the input that asked to interact, now = this tick, rtt =
 * measureRtt(samples), target = the core (no parcel) or the depot (carrying one),
 * range = 250, readyAt = the first tick the cooldown allows, and positionAt = the reader
 * the server was given. The judge returns { accept, at, reason }. An accepted
 * interaction picks up or deposits exactly as in part one.
 */
export function createCourierServer({ seed, window = 0, judge, measureRtt, positionAt } = {}) {
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  if (!Number.isInteger(window) || window < 0) throw new Error('window must be a whole number of ticks, 0 or more');
  for (const [name, fn] of Object.entries({ judge, measureRtt, positionAt })) {
    if (typeof fn !== 'function') throw new Error(`${name} must be a function`);
  }
  const core = corePosition(seed);
  const history = createHistory();
  const positions = [{ x: DEPOT.x, y: DEPOT.y }]; // every tick of the session, for scoring only; the judge never sees it
  const samples = [];                             // round trips in ms, oldest first, at most RTT_SAMPLES
  const pingsOut = new Set();                     // ping ids not yet answered
  const courier = {
    x: DEPOT.x, y: DEPOT.y, score: 0, cargo: false,
    lastSeq: 0, expiresAt: 0, nextInteractTick: 0, move: 'idle',
    pendingInteract: false, pendingSeq: 0, pendingSeen: 0, lastDecision: null,
  };
  let tick = 0;
  recordPosition(history, 0, courier.x, courier.y);

  // Part one's admission, with `seen` kept for the interaction it asks for.
  function admit(input) {
    const seq = Number.isSafeInteger(input?.seq) ? input.seq : null;
    if (!validInput(input)) return { status: 'rejected', reason: 'invalid-input', tick, seq };
    if (input.seq <= courier.lastSeq) return { status: 'stale', reason: 'stale-sequence', tick, seq };
    courier.lastSeq = input.seq;
    courier.expiresAt = tick + MOVE_TICKS;
    courier.move = input.move;
    if (input.interact && !courier.pendingInteract) {
      courier.pendingSeq = input.seq;   // presses in the same tick merge into one: the first one's seen counts
      courier.pendingSeen = input.seen;
    }
    courier.pendingInteract = courier.pendingInteract || input.interact;
    return { status: 'admitted', reason: 'accepted', tick, seq };
  }

  function move() {
    if (tick > courier.expiresAt) return;
    const [dx, dy] = DIRECTIONS[courier.move];
    const to = { x: courier.x + dx, y: courier.y + dy };
    if (to.x < 0 || to.x > ARENA.width || to.y < 0 || to.y > ARENA.height) return;
    if (crossesWall(courier, to)) return;
    courier.x = to.x;
    courier.y = to.y;
  }

  function interact() {
    if (!courier.pendingInteract) return null;
    courier.pendingInteract = false;
    const target = courier.cargo ? DEPOT : core;
    const verdict = judge({
      seen: courier.pendingSeen, now: tick, window, rtt: measureRtt(samples.slice()),
      history, target: { x: target.x, y: target.y }, range: RANGE, readyAt: courier.nextInteractTick, positionAt,
    });
    const accepted = verdict?.accept === true;
    const reason = accepted ? (courier.cargo ? 'deposit' : 'pickup') : String(verdict?.reason ?? 'refused');
    courier.lastDecision = { status: accepted ? 'applied' : 'denied', reason, tick, seq: courier.pendingSeq };
    if (accepted) {
      if (reason === 'deposit') courier.score += 1;
      courier.cargo = reason === 'pickup';
      courier.nextInteractTick = tick + COOLDOWN_TICKS;
    }
    return { accepted, reason, seen: courier.pendingSeen, now: tick, at: verdict?.at ?? null, seq: courier.pendingSeq, target: { x: target.x, y: target.y } };
  }

  /** Advance one tick. Returns the interaction decided in it, or null. */
  function step() {
    tick += 1;
    move();
    recordPosition(history, tick, courier.x, courier.y);
    positions.push({ x: courier.x, y: courier.y });
    return interact();
  }

  /** A ping to send this tick, or null. Pings go out on ticks 0, 10, 20, ... */
  function ping() {
    if (tick % PING_EVERY !== 0) return null;
    pingsOut.add(tick);
    for (const id of pingsOut) if (id < tick - 20 * PING_EVERY) pingsOut.delete(id);
    return { type: 'ping', id: tick };
  }

  /** A pong for ping `id` arrived at `atMs`. One sample per ping; unknown ids are ignored. */
  function receivePong(id, atMs) {
    if (!pingsOut.has(id)) return false;
    pingsOut.delete(id);
    samples.push(atMs - id * TICK_MS);
    if (samples.length > RTT_SAMPLES) samples.shift();
    return true;
  }

  /** What the server sends the client every tick: the screen is drawn from this. */
  function view() {
    const d = courier.lastDecision;
    return {
      type: 'view', tick, x: courier.x, y: courier.y, cargo: courier.cargo, score: courier.score,
      ack: courier.lastSeq, readyAt: courier.nextInteractTick,
      decision: d ? { seq: d.seq, accepted: d.status === 'applied', reason: d.reason, tick: d.tick } : null,
      core: { ...core }, depot: { ...DEPOT },
    };
  }

  /** The server's state, in part one's terms. */
  function snapshot() {
    const d = courier.lastDecision;
    return {
      tick, x: courier.x, y: courier.y, score: courier.score, cargo: courier.cargo,
      lastSeq: courier.lastSeq, expiresAt: courier.expiresAt, nextInteractTick: courier.nextInteractTick,
      lastDecision: d ? { status: d.status, reason: d.reason, tick: d.tick } : null,
    };
  }

  return {
    get tick() { return tick; },
    core: { ...core }, history, positions, samples,
    admit, step, ping, receivePong, view, snapshot,
  };
}

// ---------------------------------------------------------------------------
// Seeded numbers and the network
// ---------------------------------------------------------------------------

/** mulberry32: a small seeded generator. The same seed gives the same numbers everywhere. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes two numbers into one 32-bit seed (murmur3's finishing steps over a * 0x9e3779b1 ^ b). */
export function mix(a, b) {
  let h = (Math.imul(a >>> 0, 0x9e3779b1) ^ (b >>> 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A one-way link. A message sent at `sentAtMs` arrives `oneWayMs` plus a jitter of 0 to
 * `jitterMs` whole milliseconds later. The jitter comes from the send time, so a link
 * always delays a message sent at a given moment by the same amount, whatever else the
 * session did. Messages sent close together can overtake each other.
 * Returns a function: sent time in ms -> arrival time in ms.
 */
export function makeLink({ seed, oneWayMs, jitterMs = 0 }) {
  return (sentAtMs) => sentAtMs + oneWayMs + (jitterMs > 0 ? mix(seed, sentAtMs) % (jitterMs + 1) : 0);
}

// ---------------------------------------------------------------------------
// Client models
// ---------------------------------------------------------------------------

// Every client draws the newest view it has (a view that arrives late is ignored) and
// stamps every input with seen = the tick of that view. Clients act when a message
// arrives: each view, and each ping.

export const MODEL_NAMES = ['honest', 'naiveFaker', 'slowPongFaker'];

// An honest session draws its one-way latency (ms) and its jitter (ms) from these lists,
// each entry equally likely. Round trips run from 20 ms to 480 ms.
export const HONEST_LATENCIES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200];
export const HONEST_JITTERS = [0, 5, 10, 20, 30, 40];

// How an honest player handles the courier near a target:
//   stopper: walks at full speed and, the moment the screen shows the courier in range,
//            presses interact and lets go of the direction key in the same input;
//   roller:  presses interact while still walking and lets go one frame later;
//   careful: slows down near the target, nudges the courier in a step at a time, and
//            presses only once the screen shows it standing still in range.
// After a refused press, every player comes back to the target carefully.
export const HONEST_STYLES = ['stopper', 'stopper', 'roller', 'roller', 'careful'];

const PRESS_PATIENCE = 40;           // ticks a client waits to see the answer to a press before giving up on it

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const towards = (dx, dy) => (dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N');

/** What the screen says about the current target. */
function look(screen) {
  const target = screen.cargo ? screen.depot : screen.core;
  const dx = target.x - screen.x;
  const dy = target.y - screen.y;
  return {
    dx, dy,
    inRange: dx * dx + dy * dy <= RANGE * RANGE,
    stepsOut: Math.max(0, Math.ceil((Math.hypot(dx, dy) - RANGE) / STEP)),
    ready: screen.tick + 1 >= screen.readyAt, // a press sent now is decided next tick or later
  };
}

function newClient(who, oneWayMs, jitterMs) {
  return {
    who, oneWayMs, jitterMs,
    screen: null,      // the newest view drawn
    seq: 0,            // the last seq sent
    lastMove: null,    // the move of the last input sent
    sinceSend: 0,      // views drawn since the last input
    pressSeq: 0,       // seq of the press waiting for its answer, 0 when none
    pressTick: 0,      // screen tick when it was pressed
    presses: 0,        // interact inputs sent
  };
}

function sendInput(c, send, atMs, move, interact = false, seen = c.screen.tick) {
  c.seq += 1;
  c.lastMove = move;
  c.sinceSend = 0;
  send({ type: 'input', input: { v: 1, seq: c.seq, move, interact, seen } }, atMs);
}

function press(c, send, atMs, move, seen) {
  sendInput(c, send, atMs, move, true, seen);
  c.presses += 1;
  c.pressSeq = c.seq;
  c.pressTick = c.screen.tick;
}

/** Keep walking: send the direction when it changes, and every other frame to keep moving. */
function walk(c, send, atMs, dir) {
  if (c.lastMove !== dir || c.sinceSend >= 2) sendInput(c, send, atMs, dir);
}

function stop(c, send, atMs) {
  if (c.lastMove !== 'idle') sendInput(c, send, atMs, 'idle');
}

/** The answer to the last press, once the screen shows it; 'lost' if it never came. */
function answer(c) {
  const d = c.screen.decision;
  if (d && d.seq >= c.pressSeq) return d;
  return c.screen.tick - c.pressTick > PRESS_PATIENCE ? 'lost' : null;
}

function receiveWith(c, decide, pongDelay) {
  return (message, atMs, send) => {
    if (message.type === 'ping') {
      send({ type: 'pong', id: message.id }, atMs + pongDelay());
      return;
    }
    if (c.screen && message.tick <= c.screen.tick) return;
    c.screen = message;
    c.sinceSend += 1;
    decide(c, atMs, send);
  };
}

/** An honest courier on a connection drawn from the lists above. */
function honest(rng) {
  const c = newClient('honest', pick(rng, HONEST_LATENCIES), pick(rng, HONEST_JITTERS));
  c.style = pick(rng, HONEST_STYLES);
  c.mode = c.style;
  // How far the courier slides after the player lets go, as the player feels it.
  c.slide = Math.ceil((2 * c.oneWayMs + c.jitterMs) / TICK_MS) + 1;
  c.letGoAt = null;   // a roller's planned key release
  c.nudging = false;  // a careful player's nudge: one direction input, then idle on the next frame
  c.receive = receiveWith(c, decideHonest, () => 0);
  return c;
}

function decideHonest(c, atMs, send) {
  const s = c.screen;
  if (c.letGoAt !== null && atMs >= c.letGoAt) {
    c.letGoAt = null;
    sendInput(c, send, atMs, 'idle');
  }
  if (c.pressSeq) {
    const result = answer(c);
    if (!result) return;                                  // wait for the screen to show the answer
    c.pressSeq = 0;
    c.mode = result !== 'lost' && !result.accepted ? 'careful' : c.style;
  }
  if (c.nudging) {
    c.nudging = false;
    sendInput(c, send, atMs, 'idle');
    return;
  }
  const { dx, dy, inRange, stepsOut, ready } = look(s);
  const atRest = c.lastMove === 'idle' && s.ack >= c.seq;
  if (inRange) {
    if (ready && (c.mode !== 'careful' || atRest)) {
      const rolling = c.mode === 'roller' && c.lastMove !== null && c.lastMove !== 'idle';
      press(c, send, atMs, rolling ? c.lastMove : 'idle', s.tick);
      if (rolling) c.letGoAt = atMs + TICK_MS;
    } else {
      stop(c, send, atMs);
    }
    return;
  }
  const dir = towards(dx, dy);
  if (c.mode === 'careful' && stepsOut <= c.slide) {
    if (!atRest) {
      stop(c, send, atMs);
      return;
    }
    sendInput(c, send, atMs, dir);
    c.nudging = true;
    return;
  }
  walk(c, send, atMs, dir);
}

// The two fakers have a real one-way latency of 20 ms. Neither stops at a target. Each
// walks until its screen shows the courier touching the target's range, turns straight
// for the other place, and some ticks later presses interact claiming seen = the tick it
// touched. If the server accepts, the faker never had to stop or wait. If the press is
// refused it walks back and presses honestly, then tries the trick again on the next
// target.

/**
 * Answers pings at once, so its round trip measures 40 to 50 ms, but claims seen 3 to 12
 * ticks old at the server: it presses 2 to 11 ticks after its screen last showed it in
 * range, and the press takes one more tick to be decided.
 */
function naiveFaker(rng) {
  const c = newClient('naiveFaker', 20, 5);
  c.drawLag = () => 2 + Math.floor(rng() * 10);
  return fakerSetup(c, () => 0);
}

/**
 * Picks a pretend round trip of 300 to 370 ms and holds every pong so that each sample
 * measures 300 to 400 ms. Then it claims seen no older than the pretend round trip
 * allows: 3 ticks up to the round trip in whole ticks.
 */
function slowPongFaker(rng) {
  const c = newClient('slowPongFaker', 20, 5);
  c.fakeRttMs = 300 + Math.floor(rng() * 71);
  const fakeTicks = Math.ceil(c.fakeRttMs / TICK_MS);
  c.drawLag = () => 2 + Math.floor(rng() * (fakeTicks - 2));
  return fakerSetup(c, () => c.fakeRttMs - 2 * c.oneWayMs + Math.floor(rng() * 21));
}

function fakerSetup(c, pongDelay) {
  c.lag = c.drawLag();
  c.honestMode = false;
  c.lastIn = null;     // the last screen tick that showed the courier in range of the target
  c.receive = receiveWith(c, decideFaker, pongDelay);
  return c;
}

function decideFaker(c, atMs, send) {
  const s = c.screen;
  if (c.pressSeq) {
    const result = answer(c);
    if (!result) return;
    c.pressSeq = 0;
    c.honestMode = result === 'lost' || !result.accepted;
    c.lastIn = null;
  }
  const { dx, dy, inRange, ready } = look(s);
  if (c.honestMode) {
    if (inRange && ready) press(c, send, atMs, 'idle', s.tick);
    else if (inRange) stop(c, send, atMs);
    else walk(c, send, atMs, towards(dx, dy));
    return;
  }
  // The other place: the depot when heading for the core, the core when heading for the depot.
  const other = s.cargo ? s.core : s.depot;
  const ox = other.x - s.x;
  const oy = other.y - s.y;
  const atOther = ox * ox + oy * oy <= RANGE * RANGE;
  if (inRange) {
    c.lastIn = s.tick;                                   // touched: turn for the other place at once
    walk(c, send, atMs, towards(ox, oy));
    return;
  }
  if (c.lastIn === null) {
    walk(c, send, atMs, towards(dx, dy));
    return;
  }
  if (s.tick - c.lastIn >= c.lag && ready) {
    // The lie: "my screen showed tick lastIn when I pressed".
    press(c, send, atMs, atOther ? 'idle' : towards(ox, oy), c.lastIn);
    c.lag = c.drawLag();
    return;
  }
  if (atOther) stop(c, send, atMs);
  else walk(c, send, atMs, towards(ox, oy));
}

const MODELS = { honest, naiveFaker, slowPongFaker };

// ---------------------------------------------------------------------------
// Playing sessions
// ---------------------------------------------------------------------------

function post(queue, item) {
  let index = queue.length;
  while (index > 0 && queue[index - 1].arrival > item.arrival) index -= 1;
  queue.splice(index, 0, item);
}

function playSession({ who, session, sessionSeed, window, judge, measureRtt, positionAt, ticks, outcomes }) {
  const client = MODELS[who](makeRng(sessionSeed));
  const server = createCourierServer({ seed: sessionSeed, window, judge, measureRtt, positionAt });
  const down = makeLink({ seed: mix(sessionSeed, 1), oneWayMs: client.oneWayMs, jitterMs: client.jitterMs });
  const up = makeLink({ seed: mix(sessionSeed, 2), oneWayMs: client.oneWayMs, jitterMs: client.jitterMs });
  const toClient = [];
  const toServer = [];
  const sendUp = (message, atMs) => post(toServer, { arrival: up(atMs), message });
  const sendDown = (message) => post(toClient, { arrival: down(server.tick * TICK_MS), message });
  const near = (p, t) => (p.x - t.x) ** 2 + (p.y - t.y) ** 2 <= RANGE * RANGE;
  let interacts = 0;

  sendDown(server.view());
  sendDown(server.ping());
  for (let k = 1; k <= ticks; k += 1) {
    const boundary = k * TICK_MS;
    while (toClient.length && toClient[0].arrival <= boundary) {
      const { message, arrival } = toClient.shift();
      client.receive(message, arrival, sendUp);
    }
    while (toServer.length && toServer[0].arrival <= boundary) {
      const { message, arrival } = toServer.shift();
      if (message.type === 'input') server.admit(message.input);
      else server.receivePong(message.id, arrival);
    }
    const decision = server.step();
    if (decision) {
      interacts += 1;
      const { seen, now, target } = decision;
      outcomes.push({
        who, session, accepted: decision.accepted, reason: decision.reason,
        inRangeNow: near(server.positions[now], target),
        inRangeAtSeen: seen <= now && near(server.positions[seen], target),
        seen, now, at: decision.at,
      });
    }
    sendDown(server.view());
    const ping = server.ping();
    if (ping) sendDown(ping);
  }
  return {
    who, session, deliveries: server.snapshot().score, presses: client.presses, interacts,
    oneWayMs: client.oneWayMs, jitterMs: client.jitterMs, style: client.style ?? null,
  };
}

/**
 * Plays `sessions` sessions of each model in `models` and reports every interaction.
 *
 *   seed        the run's seed; session n of a model always gets the same connection,
 *               style and network, whatever the judge or window
 *   sessions    how many sessions of each model
 *   models      model names from MODEL_NAMES
 *   judge, measureRtt, positionAt, window   as createCourierServer takes them
 *   ticks       session length in ticks (default 1200, one minute)
 *
 * Returns { outcomes, sessions }:
 *   outcomes: one per interaction the server decided:
 *     { who, session, accepted, reason, inRangeNow, inRangeAtSeen, seen, now, at }
 *     inRangeNow: the courier was within range of the target at the deciding tick;
 *     inRangeAtSeen: it was within range at the tick the client claimed to have seen
 *     (false when seen is after now). These come from the server's full record of the
 *     session, not from the 40-tick ring.
 *   sessions: one per session:
 *     { who, session, deliveries, presses, interacts, oneWayMs, jitterMs, style }
 *     presses: interact inputs the client sent; interacts: interactions the server decided
 */
export function runCourier({ seed = 1, sessions = 40, models = MODEL_NAMES, judge, measureRtt, positionAt, window = 0, ticks = SESSION_TICKS } = {}) {
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  if (!Number.isInteger(sessions) || sessions < 1) throw new Error('sessions must be a whole number, 1 or more');
  if (!Number.isInteger(ticks) || ticks < 1) throw new Error('ticks must be a whole number, 1 or more');
  const outcomes = [];
  const perSession = [];
  for (const who of models) {
    const index = MODEL_NAMES.indexOf(who);
    if (index < 0) throw new Error(`unknown model: ${who}`);
    for (let n = 1; n <= sessions; n += 1) {
      const sessionSeed = mix(mix(seed, index + 1), n);
      perSession.push(playSession({ who, session: `${who}-${n}`, sessionSeed, window, judge, measureRtt, positionAt, ticks, outcomes }));
    }
  }
  return { outcomes, sessions: perSession };
}
