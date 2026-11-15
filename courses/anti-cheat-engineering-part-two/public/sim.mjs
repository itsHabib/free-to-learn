// Play one client model against a Lob server over two seeded links.
// The simulation is event-driven, in whole milliseconds: the server ticks at every
// multiple of TICK_MS and sends that tick's message at that moment; the client acts
// whenever it asks to. Inside one millisecond the order is: arrivals at the server,
// the server's tick, arrivals at the client, then the client's own action. So an input
// that arrives exactly on a tick is decided in that tick, and one sent on a tick waits
// for the next.
//
// A client model is an object with three methods:
//   onMessage(body, atMs)   a server message arrived (JSON text, or a view object)
//   nextWake()              the next ms it wants to act at (Infinity for never; a
//                           fraction is rounded up to the next whole ms)
//   wake(atMs)              act now; return the texts to send (an array, maybe empty)
import { TICK_MS } from './rules.mjs';

export function playSession({
  server, client, up, down, rounds = Infinity, keepMessages = false, maxMs = 30 * 60 * 1000,
}) {
  const token = server.join();
  const entry = server.session(token);
  const toServer = []; // { at, order, body }
  const toClient = [];
  const messages = keepMessages ? [] : null;
  let order = 0;
  let ticks = 0;
  let lastWake = -1, wakesAtSameMs = 0;

  for (;;) {
    const nextTick = (ticks + 1) * TICK_MS;
    const now = Math.min(nextTick, Math.ceil(client.nextWake()), earliest(toServer), earliest(toClient));
    if (now > maxMs) break;

    deliver(toServer, now, (m) => server.receive(token, m.body));

    if (now === nextTick) {
      ticks += 1;
      for (const m of server.tick()) {
        if (m.token !== token) continue;
        const body = m.text ?? m.view;
        if (messages) messages.push({ tick: ticks, at: now, text: typeof body === 'string' ? body : JSON.stringify(body) });
        const at = down.delay(now);
        if (at !== null) toClient.push({ at, order: order++, body });
      }
      if (entry.session.over() || roundsEnded(entry.session) >= rounds) break;
    }

    deliver(toClient, now, (m) => client.onMessage(m.body, m.at));

    if (Math.ceil(client.nextWake()) <= now) {
      wakesAtSameMs = now === lastWake ? wakesAtSameMs + 1 : 0;
      lastWake = now;
      if (wakesAtSameMs > 1000) throw new Error(`client keeps asking to act at ${now} ms`);
      for (const text of client.wake(now)) {
        const at = up.delay(now);
        if (at !== null) toServer.push({ at, order: order++, body: text });
      }
    }
  }

  const result = { token, outcomes: entry.session.outcomes(), final: entry.session.final(), ticks };
  if (entry.recorder || entry.record) result.record = server.record(token);
  if (messages) result.messages = messages;
  return result;
}

function roundsEnded(session) {
  return session.over() ? session.round : session.round - 1;
}

function earliest(queue) {
  let t = Infinity;
  for (const m of queue) if (m.at < t) t = m.at;
  return t;
}

// Hand over every message due by `now`, earliest first (ties in the order they were sent).
function deliver(queue, now, handle) {
  for (;;) {
    let best = -1;
    for (let i = 0; i < queue.length; i++) {
      const m = queue[i];
      if (m.at > now) continue;
      if (best < 0 || m.at < queue[best].at || (m.at === queue[best].at && m.order < queue[best].order)) best = i;
    }
    if (best < 0) return;
    handle(queue.splice(best, 1)[0]);
  }
}
