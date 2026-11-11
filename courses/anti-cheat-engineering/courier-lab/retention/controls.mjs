const project = ({ tick, actorId, reason, distanceSquared }) => ({ tick, actorId, reason, distanceSquared });
const eligible = (event, settings) => event.tick > settings.nowTick - settings.maxAgeTicks && event.tick <= settings.nowTick;
const filtered = (events, settings) => events.filter((event) => eligible(event, settings));

// Independently structured implementations; neither imports the reference policy.
export const correctPolicies = [
  { name: 'forward bounded queue', retain(events, settings) {
    const result = [];
    for (const event of events) {
      if (!eligible(event, settings)) continue;
      result.push(project(event));
      if (result.length > settings.maxEvents) result.shift();
    }
    return result;
  } },
  { name: 'reverse scan then restore order', retain(events, settings) {
    const newest = [];
    for (let index = events.length - 1; index >= 0 && newest.length < settings.maxEvents; index -= 1) {
      const event = events[index];
      if (event.tick > settings.nowTick || event.tick <= settings.nowTick - settings.maxAgeTicks) continue;
      newest.push({ tick: event.tick, actorId: event.actorId, reason: event.reason, distanceSquared: event.distanceSquared });
    }
    return newest.reverse();
  } },
];

export const wrongPolicies = [
  { name: 'include old boundary', intended: 'exclude the old edge', retain: (events, settings) => events.filter((event) => event.tick >= settings.nowTick - settings.maxAgeTicks && event.tick <= settings.nowTick).slice(-settings.maxEvents).map(project) },
  { name: 'retain future events', intended: 'exclude the old edge', retain: (events, settings) => events.filter((event) => event.tick > settings.nowTick - settings.maxAgeTicks).slice(-settings.maxEvents).map(project) },
  { name: 'keep oldest count', intended: 'keep the newest count', retain: (events, settings) => filtered(events, settings).slice(0, settings.maxEvents).map(project) },
  { name: 'copy excluded fields', intended: 'retain exactly the four', retain: (events, settings) => filtered(events, settings).slice(-settings.maxEvents).map((event) => ({ ...event })) },
  { name: 'delete source fields in place', intended: 'source unchanged', retain(events, settings) {
    const result = filtered(events, settings).slice(-settings.maxEvents);
    for (const event of result) {
      delete event.capability;
      delete event.address;
      delete event.device;
    }
    return result;
  } },
  { name: 'ignore count limit', intended: 'keep the newest count', retain: (events, settings) => filtered(events, settings).map(project) },
  { name: 'reverse equal-tick order', intended: 'equal-tick order', retain: (events, settings) => filtered(events, settings).reverse().slice(0, settings.maxEvents).map(project) },
  { name: 'round measured distance', intended: 'retain exactly the four', retain: (events, settings) => filtered(events, settings).slice(-settings.maxEvents).map((event) => ({ ...project(event), distanceSquared: Math.round(event.distanceSquared) })) },
];
