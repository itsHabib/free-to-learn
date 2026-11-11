import { createWorld, join, admit, advance } from '../engine.mjs';
import { createClock } from '../clock.mjs';

const copy = (value) => JSON.parse(JSON.stringify(value));
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.sort().join(',');
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Only finite, small scripts on the open floor are accepted by this mechanism. */
export function validateInvestigation(record) {
  if (!exact(record, ['schema', 'startMs', 'actions']) || record.schema !== 1 || !finite(record.startMs)) throw new Error('Invalid timing record envelope.');
  if (!Array.isArray(record.actions) || !record.actions.length || record.actions.length > 80) throw new Error('Timing records require 1–80 actions.');
  const ids = new Set();
  const labels = new Set();
  let now = record.startMs;
  for (const action of record.actions) {
    if (!action || typeof action.label !== 'string' || !action.label || labels.has(action.label)) throw new Error('Action labels must be unique nonempty strings.');
    labels.add(action.label);
    if (action.type === 'sample') {
      if (!exact(action, ['type', 'label', 'nowMs']) || !finite(action.nowMs) || action.nowMs < now || action.nowMs - now > 5000) throw new Error('Invalid bounded owner-clock sample.');
      now = action.nowMs;
      continue;
    }
    if (action.type === 'input') {
      const keys = ['type', 'label', 'id', 'seq', 'move', ...(Object.hasOwn(action, 'sentAtMs') ? ['sentAtMs'] : [])];
      if (!exact(action, keys) || !ids.has(action.id) || !Number.isSafeInteger(action.seq) || action.seq < 1 || action.seq > 1000000 || !['E', 'W', 'idle'].includes(action.move)) throw new Error('Invalid timing input.');
      if (Object.hasOwn(action, 'sentAtMs') && !finite(action.sentAtMs)) throw new Error('Invalid client-time annotation.');
      continue;
    }
    if (!exact(action, ['type', 'label', 'id']) || typeof action.id !== 'string' || !action.id) throw new Error('Invalid connection action.');
    if (action.type === 'join') {
      if (ids.has(action.id) || ids.size >= 4) throw new Error('Join requires a new connection label, at most four per record.');
      ids.add(action.id);
      continue;
    }
    if (!['disconnect', 'resume'].includes(action.type) || !ids.has(action.id)) throw new Error('Unknown connection action.');
  }
}

function stepOpenFloor(world, ticks) {
  for (let count = 0; count < ticks; count += 1) {
    for (const actor of world.actors) {
      if (world.tick + 1 > actor.expiresAt) continue;
      const target = actor.x + (actor.move === 'E' ? 250 : actor.move === 'W' ? -250 : 0);
      if (target < 0 || target > 3750) throw new Error('Timing investigations must stay on unobstructed floor (x=0..3750).');
    }
    advance(world, 1);
  }
}

/** A delivery outage gates receipts; it never deletes or rewinds an engine actor. */
export function runInvestigation(record) {
  validateInvestigation(record);
  const world = createWorld(17);
  const timer = createClock(record.startMs);
  const connections = new Map();
  const checkpoints = [];
  const receipts = [];
  for (const action of record.actions) {
    let receipt = null;
    let clock = null;
    const connection = connections.get(action.id);
    if (action.type === 'join') connections.set(action.id, { actor: join(world), connected: true });
    if (action.type === 'disconnect') connection.connected = false;
    if (action.type === 'resume') connection.connected = true;
    if (action.type === 'input') {
      const response = connection.connected ? admit(world, connection.actor.id, { v: 1, seq: action.seq, move: action.move, interact: false }) : { status: 'offline', tick: world.tick, seq: action.seq };
      receipt = { status: response.status, tick: response.tick, seq: response.seq };
      receipts.push({ label: action.label, connection: action.id, actorId: connection.actor.id, ...receipt, ...(Object.hasOwn(action, 'sentAtMs') ? { sentAtMs: action.sentAtMs } : {}) });
    }
    if (action.type === 'sample') {
      clock = timer.sample(action.nowMs);
      if (clock.ticks) stepOpenFloor(world, clock.ticks);
    }
    checkpoints.push({ label: action.label, tick: world.tick, actors: [...connections].map(([id, item]) => ({
      id: item.actor.id, connection: id, connected: item.connected,
      lastSeq: item.actor.lastSeq, expiresAt: item.actor.expiresAt, x: item.actor.x,
    })), receipt, clock });
  }
  return { record: copy(record), observed: { ok: true, checkpoints }, receipts };
}

const action = (type, label, fields = {}) => ({ type, label, ...fields });
const joinTab = (id = 'tab-a') => action('join', `join-${id}`, { id });
const input = (label, seq, move, fields = {}) => action('input', label, { id: 'tab-a', seq, move, ...fields });
const sample = (label, nowMs) => action('sample', label, { nowMs });
const record = (...actions) => ({ schema: 1, startMs: 0, actions });

/** The action scripts are observations to investigate, not a production workload. */
export function investigations() {
  return [
    { name: 'receipt-before-movement', section: 'receipt-and-movement', record: record(joinTab(), input('admitted-at-zero', 1, 'E'), sample('first-owner-tick', 50)) },
    { name: 'inclusive-expiry', section: 'four-processed-ticks', record: record(joinTab(), input('start', 1, 'E'), sample('fourth-tick', 200), sample('fifth-tick-stopped', 250)) },
    { name: 'delayed-client-time', section: 'receipt-and-movement', record: record(joinTab(), sample('owner-waited', 150), input('delayed-receipt', 1, 'E', { sentAtMs: 0 }), sample('four-after-receipt', 350)) },
    { name: 'duplicate-retry', section: 'retries-and-reordering', record: record(joinTab(), input('original', 4, 'E'), sample('three-ticks', 150), input('duplicate-opposite', 4, 'W'), sample('original-expiry', 200), sample('no-renewal', 250)) },
    { name: 'reordered-older-input', section: 'retries-and-reordering', record: record(joinTab(), input('newer-first', 9, 'E'), sample('one-tick', 50), input('older-arrives', 8, 'W'), sample('continue-east', 100)) },
    { name: 'fractional-callbacks', section: 'owner-clock', record: record(joinTab(), input('start', 1, 'E'), sample('fraction-24', 24), sample('fraction-49', 49), sample('whole-tick', 50), sample('same-sample', 50), sample('fraction-99', 99), sample('next-tick', 100)) },
    { name: 'bounded-pause', section: 'owner-clock', record: record(joinTab(), input('start', 1, 'E'), sample('long-pause', 826.5), input('renew-after-pause', 2, 'W'), sample('remainder-carries', 850)) },
    { name: 'outage-and-resume', section: 'connection-recovery', record: record(joinTab(), input('start', 5, 'E'), action('disconnect', 'link-lost', { id: 'tab-a' }), sample('still-active-server-intent', 100), input('undelivered-input', 6, 'W'), sample('intent-expired', 250), action('resume', 'same-binding-restored', { id: 'tab-a' }), input('retry-original', 5, 'W'), input('fresh-recovery-input', 6, 'W'), sample('recovered-one-step', 300)) },
    { name: 'fresh-rejoin', section: 'connection-recovery', record: record(joinTab(), input('old-session-start', 10, 'E'), action('disconnect', 'old-link-lost', { id: 'tab-a' }), sample('old-intent-continues', 50), joinTab('tab-b'), action('input', 'new-session-sequence-one', { id: 'tab-b', seq: 1, move: 'W' }), sample('independent-actors', 100)) },
    { name: 'renew-on-boundary', section: 'four-processed-ticks', record: record(joinTab(), input('start', 20, 'E'), sample('at-boundary', 200), input('fresh-boundary-reversal', 21, 'W'), sample('new-window-fourth', 400), sample('stop-again', 450)) },
  ];
}
