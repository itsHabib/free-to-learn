import { createDetector, expireObservations, interactionDenial, observeDenial } from './defense.mjs';
import { admitInput, movementActive } from './admission.mjs';

const VERSION = 1;
const MAX_ACTORS = 4;
const MAX_EVENTS = 4096;
const STEP = 250;
const DEPOT = Object.freeze({ x: 1000, y: 1000 });
const ARENA = Object.freeze({ width: 8000, height: 4000, wall: Object.freeze({ x: 4000, y: 0, width: 250, height: 2500 }) });
const DIRECTIONS = Object.freeze({ N: [0, -STEP], S: [0, STEP], E: [STEP, 0], W: [-STEP, 0], idle: [0, 0] });
const INPUT_KEYS = ['interact', 'move', 'seq', 'v'];
const MUTANTS = new Set(['omit-proximity', 'omit-sequence']);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) return false;
  return input.v === 1 && Number.isSafeInteger(input.seq) && input.seq >= 1 && input.seq <= 1_000_000
    && typeof input.move === 'string' && Object.hasOwn(DIRECTIONS, input.move) && typeof input.interact === 'boolean';
}

function recordEvent(world, event) {
  world.history.push(event);
  if (world.history.length <= MAX_EVENTS) return;
  world.history.shift();
  world.dropped += 1;
}

function requireActor(world, id) {
  const actor = world.actors.find((candidate) => candidate.id === id);
  if (!actor) throw new Error(`unknown actor: ${id}`);
  return actor;
}

function admissionState(actor) {
  return {
    lastSeq: actor.lastSeq, lastSeen: actor.lastSeen, expiresAt: actor.expiresAt,
    move: actor.move, pendingInteract: actor.pendingInteract,
  };
}

/** An owner-only in-memory world. The runtime gates mutant selection before calling this. */
export function createWorld(seed, { mutant } = {}) {
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  if (mutant !== undefined && !MUTANTS.has(mutant)) throw new Error('unknown mutant');
  const offset = ((seed % 3) + 3) % 3;
  return { seed, mutant, tick: 0, actors: [], core: { x: 2000 + offset * STEP, y: 1000 }, history: [], dropped: 0 };
}

export function join(world) {
  if (world.actors.length >= MAX_ACTORS) throw new Error('session limit reached');
  const actor = {
    id: `actor-${world.actors.length + 1}`, x: DEPOT.x, y: DEPOT.y,
    score: 0, cargo: false, lastSeq: 0, lastSeen: 0, expiresAt: 0,
    nextInteractTick: 0, move: 'idle', pendingInteract: false,
    lastDecision: null, detector: createDetector(),
  };
  world.actors.push(actor);
  recordEvent(world, { type: 'join', id: actor.id });
  return actor;
}

export function admit(world, id, input) {
  const actor = world.actors.find((candidate) => candidate.id === id);
  const seq = Number.isSafeInteger(input?.seq) ? input.seq : null;
  if (!actor) return { status: 'rejected', reason: 'unknown-actor', tick: world.tick, seq };
  if (!validInput(input)) return { status: 'rejected', reason: 'invalid-input', tick: world.tick, seq };
  recordEvent(world, { type: 'input', id, input: copy(input) });
  const policyState = admissionState(actor);
  if (world.mutant === 'omit-sequence') policyState.lastSeq = input.seq - 1;
  const result = admitInput(policyState, input, world.tick);
  // ORDER_LAB_ADMISSION_RESULT
  actor.lastSeq = result.next.lastSeq;
  actor.lastSeen = result.next.lastSeen;
  actor.expiresAt = result.next.expiresAt;
  actor.move = result.next.move;
  actor.pendingInteract = result.next.pendingInteract;
  const reason = result.status === 'stale' ? 'stale-sequence' : 'accepted';
  return { status: result.status, reason, tick: world.tick, seq: input.seq };
}

function intersectsWall(from, to) {
  const wall = ARENA.wall;
  const overlapsX = Math.max(from.x, to.x) >= wall.x && Math.min(from.x, to.x) <= wall.x + wall.width;
  const overlapsY = Math.max(from.y, to.y) >= wall.y && Math.min(from.y, to.y) <= wall.y + wall.height;
  return overlapsX && overlapsY;
}

function moveActor(world, actor) {
  if (!movementActive(admissionState(actor), world.tick)) return;
  const [dx, dy] = DIRECTIONS[actor.move];
  const target = { x: actor.x + dx, y: actor.y + dy };
  if (target.x < 0 || target.x > ARENA.width || target.y < 0 || target.y > ARENA.height) return;
  if (intersectsWall(actor, target)) return;
  actor.x = target.x;
  actor.y = target.y;
}

function interactionReason(world, actor) {
  const target = actor.cargo ? DEPOT : world.core;
  const denial = interactionDenial(actor, target, world.tick, { omitProximity: world.mutant === 'omit-proximity' });
  if (denial) return denial;
  return actor.cargo ? 'deposit' : 'pickup';
}

function interact(world, actor) {
  if (!actor.pendingInteract) return;
  actor.pendingInteract = false;
  const reason = interactionReason(world, actor);
  const applied = reason === 'pickup' || reason === 'deposit';
  actor.lastDecision = { status: applied ? 'applied' : 'denied', reason, tick: world.tick };
  if (!applied) {
    const target = actor.cargo ? DEPOT : world.core;
    const distanceSquared = (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2;
    observeDenial(actor.detector, world.tick, reason, distanceSquared);
    return;
  }
  if (reason === 'deposit') actor.score += 1;
  actor.cargo = reason === 'pickup';
  actor.nextInteractTick = world.tick + 4;
}

export function advance(world, ticks) {
  if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 100) throw new Error('ticks must be an integer from 1 to 100');
  for (let index = 0; index < ticks; index += 1) {
    world.tick += 1;
    for (const actor of world.actors) {
      expireObservations(actor.detector, world.tick);
      moveActor(world, actor);
      interact(world, actor);
    }
    recordEvent(world, { type: 'tick' });
  }
}

export function snapshot(world, id) {
  const actor = requireActor(world, id);
  // ORDER_LAB_STATE_READ
  return {
    tick: world.tick,
    actor: {
      id: actor.id, x: actor.x, y: actor.y, score: actor.score, cargo: actor.cargo,
      lastSeq: actor.lastSeq, expiresAt: actor.expiresAt, nextInteractTick: actor.nextInteractTick,
    },
    core: { ...world.core }, depot: { ...DEPOT }, arena: copy(ARENA),
    lastDecision: actor.lastDecision ? { ...actor.lastDecision } : null,
    findings: actor.detector.findings.map((finding) => ({ ...finding })),
  };
}

export function canonical(world) {
  return { tick: world.tick, actors: world.actors.map((actor) => snapshot(world, actor.id)) };
}

export function events(world) {
  return { version: VERSION, seed: world.seed, events: copy(world.history), dropped: world.dropped, final: canonical(world) };
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function replayEvent(world, event) {
  if (event?.type === 'tick' && exactKeys(event, ['type'])) return advance(world, 1);
  if (event?.type === 'join' && exactKeys(event, ['type', 'id'])) {
    if (join(world).id !== event.id) throw new Error('invalid replay join identity');
    return;
  }
  if (event?.type === 'input' && exactKeys(event, ['type', 'id', 'input'])) {
    if (admit(world, event.id, event.input).status === 'rejected') throw new Error('invalid replay input');
    return;
  }
  throw new Error('invalid replay event');
}

function sameJson(left, right) {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const keys = Object.keys(left).sort();
  const otherKeys = Object.keys(right).sort();
  return keys.length === otherKeys.length && keys.every((key, index) => key === otherKeys[index] && sameJson(left[key], right[key]));
}

/** Gameplay replay excludes HTTP authentication and real-time scheduling. */
export function replay(record) {
  if (record?.version !== VERSION) throw new Error('unsupported replay version');
  if (!Number.isSafeInteger(record.dropped) || record.dropped !== 0) throw new Error('cannot replay dropped records');
  if (!Array.isArray(record.events) || record.events.length > MAX_EVENTS) throw new Error('invalid replay events');
  const world = createWorld(record.seed);
  for (const event of record.events) replayEvent(world, event);
  const result = canonical(world);
  if (!sameJson(result, record.final)) throw new Error('replay final state mismatch');
  return result;
}
