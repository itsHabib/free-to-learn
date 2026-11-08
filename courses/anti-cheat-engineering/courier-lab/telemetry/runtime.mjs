import { createWorld, join, admit, advance, canonical } from '../engine.mjs';

export const RUNTIME_RELEASE = 'courier-runtime-1';
export const MAX_WINDOW_EVENTS = 256;
const MAX_TICK = Number.MAX_SAFE_INTEGER - 4;
const MOVES = new Set(['N', 'S', 'E', 'W', 'idle']);
const MUTANTS = new Set(['omit-proximity', 'omit-sequence']);
const ACTOR_KEYS = ['id', 'x', 'y', 'score', 'cargo', 'lastSeq', 'lastSeen', 'expiresAt',
  'nextInteractTick', 'move', 'pendingInteract', 'lastDecision', 'detector'];

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, names) {
  if (!object(value)) return false;
  const keys = Object.keys(value);
  return keys.length === names.length && names.every((name) => Object.hasOwn(value, name));
}

function integer(value, low, high) {
  return Number.isSafeInteger(value) && value >= low && value <= high;
}

function array(value, max) {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validDecision(decision, tick) {
  if (decision === null) return true;
  if (!exact(decision, ['status', 'reason', 'tick']) || !integer(decision.tick, 1, tick)) return false;
  if (decision.status === 'applied') return decision.reason === 'pickup' || decision.reason === 'deposit';
  return decision.status === 'denied' && (decision.reason === 'range' || decision.reason === 'cooldown');
}

function validBucket(bucket, index, tick) {
  if (!exact(bucket, ['tick', 'observations']) || !array(bucket.observations, 1)) return false;
  if (bucket.tick === -1) return bucket.observations.length === 0;
  if (!integer(bucket.tick, Math.max(1, tick - 19), tick) || bucket.tick % 20 !== index) return false;
  if (bucket.observations.length !== 1) return false;
  const observation = bucket.observations[0];
  return exact(observation, ['tick', 'reason']) && observation.tick === bucket.tick && observation.reason === 'range';
}

function validDetector(detector, tick) {
  if (!exact(detector, ['buckets', 'findings'])) return false;
  if (!array(detector.buckets, 20) || detector.buckets.length !== 20) return false;
  if (!detector.buckets.every((bucket, index) => validBucket(bucket, index, tick))) return false;
  if (!array(detector.findings, 128)) return false;
  return detector.findings.every((finding, index, findings) => exact(finding, ['kind', 'tick'])
    && finding.kind === 'repeated-invalid-action' && integer(finding.tick, 3, tick)
    && (index === 0 || finding.tick > findings[index - 1].tick));
}

function validActor(actor, index, tick) {
  if (!exact(actor, ACTOR_KEYS) || actor.id !== `actor-${index + 1}`) return false;
  if (!integer(actor.x, 0, 8000) || !integer(actor.y, 0, 4000) || actor.x % 250 || actor.y % 250) return false;
  if (actor.x >= 4000 && actor.x <= 4250 && actor.y <= 2500) return false;
  if (!integer(actor.score, 0, tick) || typeof actor.cargo !== 'boolean') return false;
  if (!integer(actor.lastSeq, 0, 1_000_000) || !integer(actor.lastSeen, 0, tick)) return false;
  if (!integer(actor.expiresAt, 0, MAX_TICK + 4) || !integer(actor.nextInteractTick, 0, tick + 4)) return false;
  if (!MOVES.has(actor.move) || typeof actor.pendingInteract !== 'boolean') return false;
  if (actor.lastSeq === 0 && (actor.lastSeen !== 0 || actor.expiresAt !== 0 || actor.move !== 'idle' || actor.pendingInteract)) return false;
  if (actor.lastSeq > 0 && actor.expiresAt !== actor.lastSeen + 4) return false;
  if (!validDecision(actor.lastDecision, tick) || !validDetector(actor.detector, tick)) return false;
  if (actor.lastDecision?.status === 'applied' && actor.nextInteractTick !== actor.lastDecision.tick + 4) return false;
  return true;
}

function validCheckpoint(checkpoint) {
  if (!exact(checkpoint, ['schema', 'seed', 'tick', 'core', 'actors']) || checkpoint.schema !== 1) return false;
  if (!Number.isSafeInteger(checkpoint.seed) || !integer(checkpoint.tick, 0, MAX_TICK)) return false;
  const offset = ((checkpoint.seed % 3) + 3) % 3;
  if (!exact(checkpoint.core, ['x', 'y']) || checkpoint.core.x !== 2000 + offset * 250 || checkpoint.core.y !== 1000) return false;
  if (!array(checkpoint.actors, 4)) return false;
  return checkpoint.actors.every((actor, index) => validActor(actor, index, checkpoint.tick));
}

/** Capture causal state only. HTTP credentials and the old event log are excluded. */
export function capture(world) {
  if (!world || !Array.isArray(world.actors)) throw new Error('invalid checkpoint world');
  if (world.mutant !== undefined && !MUTANTS.has(world.mutant)) throw new Error('invalid checkpoint world');
  const actors = world.actors.map((actor) => Object.fromEntries(ACTOR_KEYS.map((key) => [key, actor[key]])));
  const checkpoint = { schema: 1, seed: world.seed, tick: world.tick, core: world.core, actors };
  if (!validCheckpoint(checkpoint)) throw new Error('invalid checkpoint state');
  return copy(checkpoint);
}

/** Restore a detached world; old v1 history starts empty and is not invented. */
export function restore(checkpoint) {
  if (!validCheckpoint(checkpoint)) throw new Error('invalid checkpoint');
  const saved = copy(checkpoint);
  const world = createWorld(saved.seed);
  world.tick = saved.tick;
  world.core = saved.core;
  world.actors = saved.actors;
  return world;
}

function validInput(input) {
  return exact(input, ['v', 'seq', 'move', 'interact']) && input.v === 1
    && integer(input.seq, 1, 1_000_000) && MOVES.has(input.move) && typeof input.interact === 'boolean';
}

function apply(world, event) {
  if (exact(event, ['type']) && event.type === 'tick') {
    if (!integer(world.tick, 0, MAX_TICK - 1)) throw new Error('tick limit reached');
    advance(world, 1);
    return;
  }
  if (exact(event, ['type', 'id']) && event.type === 'join') {
    if (event.id !== `actor-${world.actors.length + 1}`) throw new Error('invalid join identity');
    join(world);
    return;
  }
  if (exact(event, ['type', 'id', 'input']) && event.type === 'input' && validInput(event.input)) {
    if (admit(world, event.id, event.input).status === 'rejected') throw new Error('invalid input actor');
    return;
  }
  throw new Error('invalid replay event');
}

/** Compare JSON values without relying on key insertion order or Node APIs. */
export function equal(left, right) {
  const pending = [[left, right]];
  let remaining = 20_000;
  while (pending.length > 0) {
    if (--remaining < 0) return false;
    const [a, b] = pending.pop();
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) {
      if (a !== b) return false;
      continue;
    }
    if (typeof a !== 'object') {
      if (!['string', 'boolean', 'number'].includes(typeof a) || a !== b) return false;
      if (typeof a === 'number' && !Number.isFinite(a)) return false;
      continue;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (!Array.isArray(a) && (!object(a) || !object(b))) return false;
    if (Array.isArray(a) && a.length !== b.length) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
}

/** The policy uses this facade; gameplay remains the existing real engine. */
export function createReplayEngine() {
  return Object.freeze({ release: RUNTIME_RELEASE, restore, apply, canonical, equal });
}

/** Record through these wrappers. Direct mutations of .world are not recorded. */
export function createRecordedEngine(seed, { capacity = 128, mutant } = {}) {
  if (!integer(capacity, 1, MAX_WINDOW_EVENTS)) throw new Error('capacity must be an integer from 1 to 256');
  const world = createWorld(seed, { mutant });
  let checkpoint = capture(world);
  let startIndex = 0;
  let endIndex = 0;
  let events = [];

  function before() {
    if (endIndex === Number.MAX_SAFE_INTEGER) throw new Error('event index limit reached');
    return events.length === capacity ? capture(world) : null;
  }

  function append(event, nextCheckpoint) {
    if (nextCheckpoint) {
      checkpoint = nextCheckpoint;
      startIndex = endIndex;
      events = [];
    }
    endIndex += 1;
    events.push({ index: endIndex, event: copy(event) });
  }

  return {
    world,
    join() {
      const nextCheckpoint = before();
      const actor = join(world);
      append({ type: 'join', id: actor.id }, nextCheckpoint);
      return actor;
    },
    admit(id, input) {
      const nextCheckpoint = before();
      const result = admit(world, id, input);
      if (result.status !== 'rejected') append({ type: 'input', id, input }, nextCheckpoint);
      return result;
    },
    advance(ticks) {
      if (!integer(ticks, 1, 100)) throw new Error('ticks must be an integer from 1 to 100');
      if (world.tick > MAX_TICK - ticks) throw new Error('tick limit reached');
      for (let index = 0; index < ticks; index += 1) {
        const nextCheckpoint = before();
        advance(world, 1);
        append({ type: 'tick' }, nextCheckpoint);
      }
    },
    window() {
      return {
        schema: 1, runtimeRelease: RUNTIME_RELEASE, startIndex, checkpoint: copy(checkpoint),
        events: copy(events), endIndex, complete: true, final: canonical(world),
      };
    },
  };
}
