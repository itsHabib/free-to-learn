import { isDeepStrictEqual } from 'node:util';

const event = (tick, actorId = `actor-${tick}`, reason = 'range', distanceSquared = 640_000) => ({
  tick, actorId, reason, distanceSquared,
  capability: 'synthetic-capability-example', address: 'synthetic-address-example', device: 'synthetic-device-example',
});
const kept = (tick, actorId = `actor-${tick}`, reason = 'range', distanceSquared = 640_000) => ({ tick, actorId, reason, distanceSquared });

/** Visible synthetic checks. The expected results do not call the reference policy. */
export function cases() {
  return [
    { name: 'empty input stays empty', events: [], settings: { nowTick: 10, maxAgeTicks: 4, maxEvents: 3 }, expected: [], section: 'the-contract' },
    { name: 'zero is a valid current tick', events: [event(0), event(1)], settings: { nowTick: 0, maxAgeTicks: 1, maxEvents: 2 }, expected: [kept(0)], section: 'the-tick-window' },
    { name: 'exclude the old edge and include now', events: [event(7), event(8), event(9), event(12), event(13)], settings: { nowTick: 12, maxAgeTicks: 4, maxEvents: 9 }, expected: [kept(9), kept(12)], section: 'the-tick-window' },
    { name: 'keep the newest count after filtering', events: [event(1), event(4), event(6), event(8), event(9), event(11)], settings: { nowTick: 9, maxAgeTicks: 6, maxEvents: 2 }, expected: [kept(8), kept(9)], section: 'the-count-bound' },
    { name: 'equal-tick order is stable at the count cut', events: [event(5, 'first'), event(5, 'second'), event(5, 'third'), event(6, 'fourth')], settings: { nowTick: 6, maxAgeTicks: 2, maxEvents: 3 }, expected: [kept(5, 'second'), kept(5, 'third'), kept(6, 'fourth')], section: 'the-count-bound' },
    { name: 'sparse input needs no gap filling', events: [event(2), event(30), event(80)], settings: { nowTick: 70, maxAgeTicks: 60, maxEvents: 4 }, expected: [kept(30)], section: 'the-tick-window' },
    { name: 'retain exactly the four allowed values', events: [event(10, 'synthetic-blue', 'cooldown', 0), event(11, 'synthetic-red', 'range', 562_500.25)], settings: { nowTick: 11, maxAgeTicks: 5, maxEvents: 5 }, expected: [kept(10, 'synthetic-blue', 'cooldown', 0), kept(11, 'synthetic-red', 'range', 562_500.25)], section: 'four-fields-only' },
    { name: 'all old or future events leave no export events', events: [event(1), event(3), event(9)], settings: { nowTick: 8, maxAgeTicks: 5, maxEvents: 1 }, expected: [], section: 'the-tick-window' },
  ];
}

function evidence(value) {
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (['capability', 'address', 'device'].includes(key)) return '<excluded field; value redacted>';
      if (item === undefined) return { type: 'undefined' };
      if (typeof item === 'number' && !Number.isFinite(item)) return { type: 'number', value: String(item) };
      if (['function', 'symbol', 'bigint'].includes(typeof item)) return { type: typeof item };
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return { type: 'repeated or circular reference' };
      seen.add(item);
      return item;
    }));
  } catch {
    return { type: 'unserializable result' };
  }
}

/** Expected/actual feedback describes the violated requirement and its teaching source. */
export async function assess(candidate) {
  if (typeof candidate?.retain !== 'function') return { passed: false, criteria: [{ name: 'export retain(events, settings)', passed: false, error: {
    message: 'Export the retain function declared in the contract.', expected: 'function', actual: typeof candidate?.retain, source: 'LEARNER.md#the-contract',
  } }] };
  const criteria = [];
  for (const item of cases()) {
    const events = structuredClone(item.events);
    const settings = { ...item.settings };
    let actual;
    try {
      actual = await candidate.retain(events, settings);
      const passed = isDeepStrictEqual(actual, item.expected);
      const criterion = { name: item.name, passed };
      if (!passed) criterion.error = { message: `The result violates this requirement: ${item.name}.`, expected: item.expected, actual: evidence(actual), source: `LEARNER.md#${item.section}` };
      criteria.push(criterion);
    } catch (error) {
      criteria.push({ name: item.name, passed: false, error: {
        message: 'Return a retained array for these validated inputs.', expected: item.expected, actual: { threw: String(error?.message ?? error) }, source: `LEARNER.md#${item.section}`,
      } });
    }
    const unchanged = { eventsUnchanged: isDeepStrictEqual(events, item.events), settingsUnchanged: isDeepStrictEqual(settings, item.settings) };
    const passed = unchanged.eventsUnchanged && unchanged.settingsUnchanged;
    const criterion = { name: `${item.name}: source unchanged`, passed };
    if (!passed) criterion.error = { message: 'Keep the original events and settings available for their original purpose.', expected: { eventsUnchanged: true, settingsUnchanged: true }, actual: unchanged, source: 'LEARNER.md#four-fields-only' };
    criteria.push(criterion);
  }
  return { passed: criteria.every(({ passed }) => passed), criteria };
}
