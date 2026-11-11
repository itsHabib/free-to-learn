import { replayWindow } from './policy.mjs';

// An independent implementation walks a shrinking sequence interval and folds
// events through the facade. It shares no validation helpers with the reference.
export function replayByInterval(record, engine) {
  const refuse = (reason) => ({ ok: false, reason });
  const names = new Set(['schema', 'runtimeRelease', 'startIndex', 'checkpoint', 'events', 'endIndex', 'complete', 'final']);
  if (record === null || typeof record !== 'object' || Array.isArray(record) || record.schema !== 1) return refuse('schema');
  if (Object.keys(record).some((key) => !names.has(key))) return refuse('schema');
  if (typeof record.runtimeRelease !== 'string' || record.runtimeRelease !== engine.release) return refuse('incompatible');
  if (record.complete !== true || !Array.isArray(record.events) || record.events.length > 256) return refuse('incomplete');
  const indices = [record.startIndex, record.endIndex];
  if (!indices.every((index) => Number.isSafeInteger(index) && index >= 0)) return refuse('sequence');
  if (record.endIndex - record.startIndex !== record.events.length) return refuse('sequence');
  let remaining = record.endIndex - record.startIndex;
  for (const item of record.events) {
    if (!item || Array.isArray(item) || typeof item !== 'object') return refuse('sequence');
    if (Object.keys(item).sort().join(',') !== 'event,index') return refuse('sequence');
    if (item.index !== record.endIndex - remaining + 1) return refuse('sequence');
    remaining -= 1;
  }
  let restored;
  try {
    restored = record.events.reduce((world, item) => {
      engine.apply(world, item.event);
      return world;
    }, engine.restore(record.checkpoint));
  } catch {
    return refuse('event');
  }
  try {
    const observed = engine.canonical(restored);
    return engine.equal(record.final, observed) ? { ok: true, state: observed } : refuse('final');
  } catch {
    return refuse('final');
  }
}

export const correctPolicies = {
  'validate-then-replay': { replayWindow },
  'interval-and-fold': { replayWindow: replayByInterval },
};

const copy = (value) => JSON.parse(JSON.stringify(value));

// These are author calibration controls. Their names describe their defect;
// none is copied into a learner workspace.
export const wrongPolicies = {
  'trust-the-final': {
    replayWindow: (record) => ({ ok: true, state: record.final }),
  },
  'ignore-completeness': {
    replayWindow: (record, engine) => replayWindow({ ...record, complete: true }, engine),
  },
  'ignore-runtime-release': {
    replayWindow: (record, engine) => replayWindow({ ...record, runtimeRelease: engine.release }, engine),
  },
  'sort-the-evidence': {
    replayWindow(record, engine) {
      const sorted = copy(record);
      if (Array.isArray(sorted?.events)) sorted.events.sort((a, b) => a.index - b.index);
      return replayWindow(sorted, engine);
    },
  },
  'renumber-the-evidence': {
    replayWindow(record, engine) {
      const changed = copy(record);
      if (!Array.isArray(changed?.events)) return replayWindow(changed, engine);
      changed.events = changed.events.map((item, index) => ({ ...item, index: changed.startIndex + index + 1 }));
      changed.endIndex = changed.startIndex + changed.events.length;
      return replayWindow(changed, engine);
    },
  },
  'omit-final-comparison': {
    replayWindow(record, engine) {
      const result = replayWindow(record, { ...engine, equal: () => true });
      return result;
    },
  },
  'discard-stale-inputs': {
    replayWindow(record, engine) {
      const changed = copy(record);
      const last = new Map();
      changed.events = changed.events.filter(({ event }) => {
        if (event?.type !== 'input') return true;
        if (event.input.seq <= (last.get(event.id) ?? 0)) return false;
        last.set(event.id, event.input.seq);
        return true;
      });
      return replayWindow(changed, engine);
    },
  },
};
