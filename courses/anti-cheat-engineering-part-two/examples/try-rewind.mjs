// Run your rewind functions on small cases, one named part at a time, each where lesson 15
// asks for it:
//   ring      a ring read back and three lists of round trips (after measure-rtt)
//   approach  question 15a's approach on the courier server, at windows 0 and 2 (after the
//             judge; it answers questions 15a and 15b)
//   claim     a claim older than its client's round trip (after the judge; it answers 15c)
// node examples/try-rewind.mjs PART            the unit 15 checkpoint, examples/rewind-checkpoint.mjs
// node examples/try-rewind.mjs project PART    your project's courier/rewind.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import {
  createCourierServer,
  createHistory,
  recordPosition,
  RANGE,
  TICK_MS,
} from '../public/courier.mjs';

const PARTS = ['ring', 'approach', 'claim'];
const args = process.argv.slice(2);
const [folder, part] = PARTS.includes(args[0]) ? [null, args[0]] : args;
if (!PARTS.includes(part) || args.length > (folder ? 2 : 1)) {
  console.log(
    `Name the part lesson 15 asks for, one of ${PARTS.join(', ')}: node examples/try-rewind.mjs project ${PARTS[0]}`,
  );
  process.exit(1);
}
const url = folder
  ? pathToFileURL(join(resolve(folder), 'courier', 'rewind.mjs')).href
  : new URL('./rewind-checkpoint.mjs', import.meta.url).href;
const { positionAt, measureRtt, judgeInteract } = await import(url);
const show = (value) => JSON.stringify(value);

// A function the lesson has not reached yet stops the probe with its message.
function stopAt(error) {
  if (!/not written yet/.test(error.message)) throw error;
  console.log(error.message);
  process.exit(0);
}

// ring: a ring of 40 slots written for ticks 0 to 44, so ticks 0 to 4 are overwritten.
function ringPart() {
  const ring = createHistory();
  for (let tick = 0; tick <= 44; tick++)
    recordPosition(ring, tick, 1000 + 50 * tick, 1000);
  try {
    console.log(
      `A ring of ${ring.size} slots, written for ticks 0 to 44 with x = 1000 + 50 × tick:`,
    );
    for (const [tick, note] of [
      [44, ''],
      [5, ''],
      [4, `: slot 4 now holds tick 44`],
      [45, ': never written'],
      [2.5, ': not a whole tick'],
    ])
      console.log(
        `  ${`positionAt(ring, ${tick})`.padEnd(22)} ${show(positionAt(ring, tick))}${note}`,
      );
    const late = [400, ...Array(24).fill(100)];
    for (const [what, samples] of [
      ['[]', []],
      ['[210, 190, 205]', [210, 190, 205]],
      ['25 samples: 400, then 100 24 times', late],
    ])
      console.log(
        `${`measureRtt(${what})`.padEnd(48)} ${show(measureRtt(samples))}`,
      );
  } catch (error) {
    stopAt(error);
  }
}

// approach: question 15a's approach on the real server: the core at x = 2000, a player 100 ms
// away who walks east and, at the first view that shows the courier in range, sends
// stop-and-interact. The same approach is decided at two windows.
function approach(window, oneWayMs = 100) {
  const server = createCourierServer({
    seed: 3,
    window,
    judge: judgeInteract,
    measureRtt,
    positionAt,
  });
  const toServer = [];
  const toClient = [];
  const story = {};
  let seq = 0;
  let pressed = false;
  const send = (input, atMs) =>
    toServer.push({ at: atMs + oneWayMs, input, sent: atMs });
  const sendView = () => {
    const at = server.tick * TICK_MS + oneWayMs;
    toClient.push({ at, msg: server.view() });
    const ping = server.ping();
    if (ping) toClient.push({ at, msg: ping });
  };
  sendView();
  for (let k = 1; k <= 80; k++) {
    const boundary = k * TICK_MS;
    toClient.sort((a, b) => a.at - b.at);
    while (toClient.length && toClient[0].at <= boundary) {
      const { at, msg } = toClient.shift();
      if (msg.type === 'ping') {
        toServer.push({ at: at + oneWayMs, pong: msg.id });
        continue;
      }
      const dx = msg.x - msg.core.x;
      const dy = msg.y - msg.core.y;
      if (!pressed && dx * dx + dy * dy <= RANGE * RANGE) {
        pressed = true;
        story.seen = { tick: msg.tick, x: msg.x, at };
        send(
          { v: 1, seq: ++seq, move: 'idle', interact: true, seen: msg.tick },
          at,
        );
      } else if (!pressed && msg.tick % 2 === 0)
        send(
          { v: 1, seq: ++seq, move: 'E', interact: false, seen: msg.tick },
          at,
        );
    }
    toServer.sort((a, b) => a.at - b.at);
    while (toServer.length && toServer[0].at <= boundary) {
      const m = toServer.shift();
      if (m.pong !== undefined) server.receivePong(m.pong, m.at);
      else {
        if (m.input.interact) story.arrived = m.at;
        server.admit(m.input);
      }
    }
    const decision = server.step();
    if (decision) {
      const x = (tick) => server.positions[tick].x;
      return {
        ...story,
        core: server.core.x,
        rtt: measureRtt(server.samples.slice()),
        now: decision.now,
        xNow: x(decision.now),
        verdict: {
          accept: decision.accepted,
          at: decision.at,
          reason: decision.accepted ? 'ok' : decision.reason,
        },
        xAt: x(decision.at),
      };
    }
    sendView();
  }
  return null;
}

function approachPart() {
  let runs;
  try {
    runs = [0, 2].map((window) => ({ window, run: approach(window) }));
  } catch (error) {
    stopAt(error);
  }
  const first = runs[0].run;
  console.log(
    `Question 15a's approach: the core at x = ${first.core}, 100 ms each way, no jitter.`,
  );
  console.log(
    `  tick ${first.seen.tick}: x = ${first.seen.x}, the first view in range; it reaches the client at ${first.seen.at} ms, and the client sends stop and interact`,
  );
  console.log(
    `  the input arrives at ${first.arrived} ms and is admitted for tick ${first.now}, where the courier stands at x = ${first.xNow}; measureRtt says ${first.rtt} ticks`,
  );
  for (const { window, run } of runs)
    console.log(
      `  window ${window}: ${show(run.verdict)}, x = ${run.xAt} at tick ${run.verdict.at}`,
    );
}

// claim: a claim older than the client's own round trip: the courier stood in range at tick 94
// and walked back west from there. The client's samples are at most 50 ms, one tick.
function claimPart() {
  const walk = createHistory();
  for (let tick = 80; tick <= 100; tick++)
    recordPosition(walk, tick, 2000 - 250 * Math.max(0, tick - 94), 1000);
  const claim = {
    seen: 94,
    now: 100,
    window: 6,
    rtt: measureRtt([40, 45, 50]),
    history: walk,
    target: { x: 2000, y: 1000 },
    range: RANGE,
    readyAt: 0,
    positionAt,
  };
  let verdict;
  try {
    verdict = judgeInteract(claim);
  } catch (error) {
    stopAt(error);
  }
  console.log(
    `A claim of seen ${claim.seen} at now ${claim.now}, window ${claim.window}, samples 40, 45, 50 ms (rtt ${claim.rtt}):`,
  );
  console.log(
    `  ${show(verdict)}, x = ${positionAt(walk, verdict.at)?.x} at tick ${verdict.at}; at tick ${claim.seen} it was x = ${positionAt(walk, claim.seen).x}`,
  );
}

({ ring: ringPart, approach: approachPart, claim: claimPart })[part]();
