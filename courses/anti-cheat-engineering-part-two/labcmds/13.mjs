// Lab commands for unit 13, listed by `node lab.mjs help` with the others:
//   leaks PROJECT [--view full]    the course's leak hunt on your view
//   cost PROJECT [--sessions N]    what hiding costs: hit rate against latency
// Every session is seeded, so the same command prints the same numbers (except the time
// `cost` took).
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fullView } from '../public/full-view.mjs';
import { HIDDEN, makeLob } from '../public/lob.mjs';
import { NOT_WRITTEN } from '../checks/harness.mjs';
import { huntSession, interferenceAt, playOne, describeSession, SEARCHED } from '../checks/encodings.mjs';

const say = (s = '') => console.log(s.trimEnd());
const lpad = (s, n) => String(s).padStart(n);
const rpad = (s, n) => String(s).padEnd(n);
const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct = (hits, shots) => (shots ? `${((100 * hits) / shots).toFixed(1)}%` : '-');

function project(dir, verb) {
  if (!dir) throw Error(`Name your project folder: node lab.mjs ${verb} PROJECT`);
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make it with a starting route from lesson 12 (node examples/start-chapter.mjs ${dir} write, or supplied)`);
  return p;
}

// Your drawnView, from PROJECT/server/view.mjs.
async function yourView(p, dir) {
  const file = join(p, 'server', 'view.mjs');
  if (!existsSync(file)) throw Error(`${dir}/server/view.mjs is missing: copy starter/server/view.mjs to begin`);
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (error) {
    throw Error(`server/view.mjs could not be loaded: ${String(error?.message ?? error).split('\n')[0]}`);
  }
  if (typeof mod.drawnView !== 'function') throw Error('server/view.mjs exports no function named drawnView');
  // Tried once on a fresh game first, so a view that is not written yet is said before anything else.
  try {
    mod.drawnView(makeLob({ seed: 1, mode: 9 }), { tick: 0, ack: 0 });
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    if (message.includes(NOT_WRITTEN)) throw Error(`drawnView in server/view.mjs is ${NOT_WRITTEN}: write it first (lesson 13).`);
    throw Error(`drawnView threw on a fresh game: ${error?.name ?? 'Error'}: ${message}`);
  }
  return mod.drawnView;
}

// Runs fn; an error thrown by a view while serving a session is said in plain words.
function serving(session, tick, fn) {
  try {
    return fn();
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    if (message.includes(NOT_WRITTEN)) throw Error(`drawnView in server/view.mjs is ${NOT_WRITTEN}: write it first (lesson 13).`);
    throw Error(`The session with ${describeSession(session)} stopped at tick ${tick()}: ${error?.name ?? 'Error'}: ${message}. Run node lab.mjs check with unit 13 to see which field is wrong.`);
  }
}

// ------------------------------------------------------------------ leaks

// The leak hunt's sessions: seeds no check uses.
const LEAK_SESSIONS = [
  { kind: 'expert', seed: 13_500_001 },
  { kind: 'novice', seed: 13_500_002 },
  { kind: 'highLatency', seed: 13_500_003 },
  { kind: 'searcher', seed: 13_500_004 },
];
const EVERY = 5; // non-interference at every 5th tick

async function leaks({ plain, o }) {
  const dir = plain[0];
  const p = project(dir, 'leaks');
  if (o.view !== undefined && o.view !== 'full') throw Error('--view takes one value, full (the full view); leave it out to hunt in your own view');
  const full = o.view === 'full';
  const view = full ? fullView : await yourView(p, dir);
  const which = full ? 'the full view (public/full-view.mjs)' : `your view (${dir}/server/view.mjs)`;

  const present = {}, changed = {};
  const searched = {}, found = {}, how = {};
  let moments = 0, messages = 0, bytes = 0, largest = 0;
  for (const s of LEAK_SESSIONS) {
    let tick = 0;
    const probe = (game, info) => {
      tick = info.tick;
      if (info.tick % EVERY !== 0) return;
      moments += 1;
      const r = interferenceAt(view, game, info);
      for (const n of r.present) present[n] = (present[n] ?? 0) + 1;
      for (const n of r.changed) changed[n] = (changed[n] ?? 0) + 1;
    };
    const hunt = serving(s, () => tick, () => huntSession(s, view, { probe }));
    messages += hunt.messages;
    bytes += hunt.bytes;
    largest = Math.max(largest, hunt.largest);
    for (const [id, n] of Object.entries(hunt.searched)) searched[id] = (searched[id] ?? 0) + n;
    for (const [id, n] of Object.entries(hunt.found)) found[id] = (found[id] ?? 0) + n;
    // How each value was found: encoding and place, counted once per message.
    const seen = new Set();
    for (const h of hunt.hits) {
      const where = `${h.encoding}, at ${h.path.replace(/\[\d+\]/g, '[]')}`;
      const key = `${h.tick}|${h.id}|${where}`;
      if (seen.has(key)) continue;
      seen.add(key);
      how[h.id] ??= {};
      how[h.id][where] = (how[h.id][where] ?? 0) + 1;
    }
  }

  say(`The leak hunt on ${which}`);
  say(`${LEAK_SESSIONS.length} sessions, each client over its own network: ${LEAK_SESSIONS.map(describeSession).join(', ')}.`);
  say();
  say(`Non-interference: ${grouped(moments)} moments (every ${EVERY}th tick); at each, every hidden thing changed three ways (setHidden k = 1, 2, 3) on a copy of the game`);
  say(`  ${rpad('hidden thing', 16)} ${lpad('present', 8)} ${lpad('changed the message', 20)}`);
  for (const n of HIDDEN) say(`  ${rpad(n, 16)} ${lpad(grouped(present[n] ?? 0), 8)} ${lpad(grouped(changed[n] ?? 0), 20)}`);
  say('  present: moments where it exists, so setHidden can change it (a shell must be in the air, an impact');
  say('  mark or a trail on screen); changed the message: moments where one of its three changes gave');
  say('  different bytes.');
  say();
  say(`Encoding search: ${grouped(messages)} messages, each searched for the hidden values present when it was built (checks/encodings.mjs)`);
  say(`  ${rpad('value', 28)} ${lpad('searched', 9)} ${lpad('found', 7)}   how it was found (messages)`);
  for (const { id, label } of SEARCHED) {
    const ways = Object.entries(how[id] ?? {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const first = ways.length ? `${ways[0][0]} (${grouped(ways[0][1])})` : '';
    say(`  ${rpad(label, 28)} ${lpad(grouped(searched[id] ?? 0), 9)} ${lpad(grouped(found[id] ?? 0), 7)}   ${first}`);
    for (const [where, n] of ways.slice(1, 3)) say(`  ${rpad('', 28)} ${lpad('', 9)} ${lpad('', 7)}   ${where} (${grouped(n)})`);
    if (ways.length > 3) say(`  ${rpad('', 28)} ${lpad('', 9)} ${lpad('', 7)}   and ${ways.length - 3} more ways`);
  }
  say('  searched: messages built while the value existed and could be searched for (a float that is a');
  say("  whole number cannot be told from a drawn number); found: messages holding it in some encoding;");
  say('  how: the encoding and where in the message, with the number of messages.');
  say();
  say(`Bytes per message: ${grouped(Math.round(bytes / messages))} on average over ${grouped(messages)} messages, ${grouped(largest)} at most.`);
  say();
  const leaking = HIDDEN.filter((n) => changed[n]);
  const foundIds = SEARCHED.filter(({ id }) => found[id]).map(({ label }) => label);
  if (!leaking.length && !foundIds.length) {
    say('No leaks found: no hidden change reached a message, and the search found no hidden value.');
    say(`A hunt over these sessions is evidence, not proof; node lab.mjs check ${dir} 13 runs the checks.`);
  } else {
    say(`Leaks found. Non-interference: ${leaking.join(', ') || 'none'}. Encoding search: ${foundIds.join('; ') || 'none'}.`);
  }
}

// ------------------------------------------------------------------ cost

// tools/calibrate.mjs's latency table: the same latencies, seeds and clients.
const LATENCIES = [0, 50, 100, 200, 400];
const COST_SESSIONS = 200;

async function cost({ plain, o }) {
  const dir = plain[0];
  const p = project(dir, 'cost');
  let sessions = COST_SESSIONS;
  if (o.sessions !== undefined) {
    sessions = typeof o.sessions === 'string' && /^\d+$/.test(o.sessions) ? Number(o.sessions) : NaN;
    if (!Number.isInteger(sessions) || sessions < 1) throw Error('--sessions takes a whole number of sessions per cell, 1 or more');
  }
  const view = await yourView(p, dir);
  const started = performance.now();
  say(`What hiding costs: hit rate against one-way latency (+ 0..10 ms jitter), ${grouped(sessions)} session${sessions === 1 ? '' : 's'} per cell, the same seeds across a row`);
  say(`  ${lpad('one-way', 8)} ${lpad('expert full', 12)} ${lpad('expert yours', 13)} ${lpad('searcher full', 14)} ${lpad('searcher yours', 15)}`);
  LATENCIES.forEach((oneWayMs, i) => {
    const network = { oneWayMs, jitterMs: 10 };
    const cells = [
      { kind: 'expert', view: fullView, screen: 'full' },
      { kind: 'expert', view, screen: 'drawn' },
      { kind: 'searcher', view: fullView },
      { kind: 'searcher', view },
    ].map((cell) => {
      let hits = 0, shots = 0;
      for (let n = 0; n < sessions; n++) {
        const s = { kind: cell.kind, seed: 4_500_000 + 10_000 * i + n };
        let tick = 0;
        const result = serving(s, () => tick, () => playOne({ ...s, view: cell.view, screen: cell.screen, network, onView: (game, info) => { tick = info.tick; } }));
        for (const r of result.outcomes) if (r.shot) { shots += 1; if (r.result === 'hit') hits += 1; }
      }
      return pct(hits, shots);
    });
    say(`  ${lpad(`${oneWayMs} ms`, 8)} ${lpad(cells[0], 12)} ${lpad(cells[1], 13)} ${lpad(cells[2], 14)} ${lpad(cells[3], 15)}`);
  });
  say('  one-way: the delay each way between client and server, plus 0 to 10 ms of jitter.');
  say("  full: the server sends the full view; the expert's official client runs the flag forward exactly");
  say('  from it, and the searching client simulates the game exactly.');
  say('  yours: the server sends your view (server/view.mjs); the official client draws only what it holds,');
  say('  and the searching client aims with only that.');
  say('  Each cell: hits over shots, in percent, with up to 12 shots a session.');
  say(`Took ${((performance.now() - started) / 1000).toFixed(1)} s.`);
}

// Rows for lab.mjs's command list: { name, args, about, run({ plain, o }) }.
export const commands = [
  { name: 'leaks', args: 'PROJECT [--view full]', about: 'the leak hunt on your view: non-interference and the encoding search', run: leaks },
  { name: 'cost', args: 'PROJECT [--sessions N]', about: 'what hiding costs: hit rate against latency, full view and yours', run: cost },
];
