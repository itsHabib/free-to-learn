const RECORD_KEYS = ['schema', 'runtimeRelease', 'startIndex', 'checkpoint', 'events', 'endIndex', 'complete', 'final'];

/** Check one complete causal window. This does not authenticate its producer. */
export function replayWindow(record, engine) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.schema !== 1) return { ok: false, reason: 'schema' };
  if (Object.keys(record).some((key) => !RECORD_KEYS.includes(key))) return { ok: false, reason: 'schema' };
  if (typeof record.runtimeRelease !== 'string' || record.runtimeRelease !== engine.release) return { ok: false, reason: 'incompatible' };
  if (record.complete !== true || !Array.isArray(record.events) || record.events.length > 256) return { ok: false, reason: 'incomplete' };
  if (!Number.isSafeInteger(record.startIndex) || record.startIndex < 0 || !Number.isSafeInteger(record.endIndex)) return { ok: false, reason: 'sequence' };
  if (record.endIndex !== record.startIndex + record.events.length) return { ok: false, reason: 'sequence' };
  for (let offset = 0; offset < record.events.length; offset += 1) {
    const entry = record.events[offset];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false, reason: 'sequence' };
    if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'event') || !Object.hasOwn(entry, 'index') || entry.index !== record.startIndex + offset + 1) return { ok: false, reason: 'sequence' };
  }
  let world;
  try {
    world = engine.restore(record.checkpoint);
    for (const { event } of record.events) engine.apply(world, event);
  } catch {
    return { ok: false, reason: 'event' };
  }
  try {
    const state = engine.canonical(world);
    if (!engine.equal(state, record.final)) return { ok: false, reason: 'final' };
    return { ok: true, state };
  } catch {
    return { ok: false, reason: 'final' };
  }
}
