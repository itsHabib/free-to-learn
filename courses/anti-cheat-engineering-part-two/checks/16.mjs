// Unit 16: the duplicated item. Every case builds stores with public/store.mjs and calls
// your trade and recover. After a crash the check plays the server: it restarts the
// store and calls your recover before anything else (recovery may itself be crashed and
// rerun), then the client sends its request again. Only inv: and coins: keys are read;
// every other key is yours. Inventories are compared as lists in any order, and a
// missing inventory counts as empty, missing coins as 0.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createStore, Crash } from '../public/store.mjs';
import { fail, show, NOT_WRITTEN } from './harness.mjs';

export const title = 'The duplicated item';

const FILE = 'trade/trade.mjs';
const notWritten = (error) => String(error?.message ?? error).includes(NOT_WRITTEN);

function whereIn(error, workDir) {
  const roots = new Set([workDir, pathToFileURL(workDir).href]);
  try { const real = realpathSync(workDir); roots.add(real); roots.add(pathToFileURL(real).href); } catch { /* keep the given path */ }
  for (const line of String(error?.stack ?? '').split('\n')) {
    for (const root of roots) {
      const i = line.indexOf(root);
      if (i < 0) continue;
      const m = line.slice(i + root.length).match(/^\/?([^:]+):(\d+)/);
      if (m) return `${decodeURIComponent(m[1])} line ${m[2]}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------- worlds and requests

const WORLDS = {
  market: { 'inv:ana': ['sword', 'lamp'], 'inv:bo': ['bow'], 'inv:cy': ['cap'], 'coins:ana': 20, 'coins:bo': 100, 'coins:cy': 60 },
  sparse: { 'inv:dee': ['gem'], 'inv:fay': ['map', 'rope'], 'coins:eli': 35, 'coins:fay': 12 },
  odd: { 'inv:gus': ['hat', 'map9', 'key-9'], 'inv:hal': [], 'inv:ivy': ['orb'], 'coins:gus': 0, 'coins:hal': 0, 'coins:ivy': 7 },
};
const req = (key, seller, buyer, item, price) => ({ key, seller, buyer, item, price });
const SALE = req('sale-1', 'ana', 'bo', 'sword', 40);
const RIVAL = req('sale-2', 'ana', 'cy', 'sword', 30);
const LONG_KEY = 'K'.repeat(36) + '_9-z';

// Scripts for the crash cases: no item is sold twice under two keys.
const SCRIPTS = [
  { name: 'one sale', world: 'market', requests: [[SALE, 'ok']] },
  { name: 'a buyer with exactly the price, and missing keys', world: 'sparse', requests: [[req('k7', 'dee', 'eli', 'gem', 35), 'ok']] },
  { name: 'price 0, an item last in its list, an empty inventory, a refusal between sales', world: 'odd', requests: [[req(LONG_KEY, 'gus', 'hal', 'key-9', 0), 'ok'], [req('b2', 'ivy', 'gus', 'orb', 0), 'ok'], [req('b3', 'gus', 'ivy', 'hat', 8), 'funds'], [req('b4', 'gus', 'ivy', 'map9', 7), 'ok']] },
  { name: 'three sales, a repeat and a changed body', world: 'market', requests: [[SALE, 'ok'], [req('s4', 'cy', 'ana', 'cap', 15), 'ok'], [SALE, 'ok'], [{ ...SALE, price: 45 }, 'conflict'], [req('s5', 'bo', 'cy', 'bow', 50), 'ok']] },
];

const RECEIPT = ['key', 'seller', 'buyer', 'item', 'price'];
const receiptOf = (r) => Object.fromEntries(RECEIPT.map((k) => [k, r[k]]));
const describe = (r) => (r && typeof r === 'object' && !Array.isArray(r) && typeof r.key === 'string' && 'price' in r ? `${r.key}: ${r.seller} sells ${r.buyer} the ${r.item} for ${show(r.price)}` : show(r));

// The answers and belongings API.md requires for a script run without crashes.
function model(script) {
  const world = JSON.parse(JSON.stringify(WORLDS[script.world]));
  const done = new Map();
  return script.requests.map(([request, reason]) => {
    const before = JSON.parse(JSON.stringify(world));
    const body = JSON.stringify([request.seller, request.buyer, request.item, request.price]);
    if (reason === 'ok' && done.get(request.key) !== body) {
      done.set(request.key, body);
      const { seller, buyer, item, price } = request;
      const from = world[`inv:${seller}`] ?? [];
      from.splice(from.indexOf(item), 1);
      world[`inv:${seller}`] = from;
      world[`inv:${buyer}`] = [...(world[`inv:${buyer}`] ?? []), item];
      world[`coins:${buyer}`] = (world[`coins:${buyer}`] ?? 0) - price;
      world[`coins:${seller}`] = (world[`coins:${seller}`] ?? 0) + price;
    }
    const want = reason === 'ok' ? { ok: true, receipt: receiptOf(request) } : { ok: false, reason };
    return { request, want, before, after: JSON.parse(JSON.stringify(world)) };
  });
}

// ---------------------------------------------------------------- belongings

const OWN = /^(inv|coins):/;
const playersIn = (...snaps) => [...new Set(snaps.flatMap((s) => Object.keys(s).filter((k) => OWN.test(k)).map((k) => k.slice(k.indexOf(':') + 1))))].sort();
// Belongings only, normalized: inventories sorted, players with nothing left out.
function canon(snap) {
  return JSON.stringify(playersIn(snap).map((p) => {
    const inv = snap[`inv:${p}`];
    return [p, Array.isArray(inv) ? [...inv].sort() : inv ?? [], snap[`coins:${p}`] ?? 0];
  }).filter(([, inv, coins]) => !(Array.isArray(inv) && !inv.length && coins === 0)));
}
const coinTotal = (snap) => Object.entries(snap).filter(([k, v]) => k.startsWith('coins:') && typeof v === 'number').reduce((sum, [, v]) => sum + v, 0);
function worldText(snap, also = {}) {
  const parts = playersIn(snap, also).map((p) => {
    const inv = snap[`inv:${p}`];
    const coins = snap[`coins:${p}`];
    return `${p} ${Array.isArray(inv) ? `[${inv.join(' ')}]` : inv === undefined ? '[]' : show(inv, 40)} ${coins === undefined ? 0 : show(coins, 20)}`;
  });
  return `${parts.join(', ')} (coins ${coinTotal(snap)})`;
}

// What breaks the invariants: an item held other than exactly once, or a coin total that changed.
function invariantProblems(snap, world) {
  const out = [];
  const holders = new Map();
  for (const [key, value] of Object.entries(snap)) {
    if (key.startsWith('inv:')) {
      if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) { out.push(`${key} holds ${show(value, 60)}, not a list of item ids`); continue; }
      for (const id of value) holders.set(id, [...(holders.get(id) ?? []), key.slice(4)]);
    } else if (key.startsWith('coins:') && !Number.isSafeInteger(value)) out.push(`${key} holds ${show(value, 60)}, not a whole number`);
  }
  const items = Object.entries(world).filter(([k]) => k.startsWith('inv:')).flatMap(([, list]) => list);
  for (const id of items) {
    const h = holders.get(id) ?? [];
    if (h.length !== 1) out.push(`the ${id} is held ${h.length ? `${h.length} times (${h.join(', ')})` : 'by nobody'}`);
  }
  for (const [id, h] of holders) if (!items.includes(id)) out.push(`the ${id}, which did not exist, is held by ${h.join(', ')}`);
  if (coinTotal(snap) !== coinTotal(world)) out.push(`the coins add up to ${coinTotal(snap)}, not ${coinTotal(world)}`);
  return out;
}

const sameAnswer = (got, want) => !!got && typeof got === 'object' && (want.ok
  ? got.ok === true && !!got.receipt && typeof got.receipt === 'object' && RECEIPT.every((k) => got.receipt[k] === want.receipt[k])
  : got.ok === false && got.reason === want.reason);
const showAnswer = (a) => show(a, 300);
const writesText = (n) => `${n} ${n === 1 ? 'write' : 'writes'}`;

// ---------------------------------------------------------------- calling your code

// Calls your function. A Crash and "not written yet" pass through; any other error is a
// failure that says where in the story it happened.
function call(env, name, fn, args, story) {
  try {
    return fn(...args);
  } catch (error) {
    if (error instanceof Crash || notWritten(error)) throw error;
    const where = whereIn(error, env.workDir);
    return fail({ checked: `your ${name} runs`, input: story(), observed: `your ${name} threw ${error?.name ?? 'Error'}: ${String(error?.message ?? error).split('\n')[0]}${where ? ` (${where})` : ''}`, expected: 'an answer by the rules in API.md' });
  }
}
const copyOf = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

async function load(env) {
  return { trade: await env.fn(FILE, 'trade'), recover: await env.fn(FILE, 'recover') };
}

// The script without crashes: its answers and belongings must be the model's. Returns the
// writes each request made: [first, last] (first > last when it wrote nothing).
function clean(env, f, script, steps) {
  const store = createStore(WORLDS[script.world]);
  const ranges = [];
  const story = () => `the ${script.world} world (${worldText(WORLDS[script.world])}), script "${script.name}": ${steps.map((s, i) => `${i + 1}. ${describe(s.request)}`).join('; ')}; no crash`;
  for (const [i, step] of steps.entries()) {
    const first = store.writes + 1;
    let answer;
    try {
      answer = call(env, 'trade', f.trade, [store, copyOf(step.request)], story);
    } catch (error) {
      if (error instanceof Crash) fail({ checked: 'trade runs without a crash', input: story(), observed: 'a Crash came out of the store although no crash was armed (does your code call crashAfter?)', expected: 'no crash' });
      throw error;
    }
    if (!sameAnswer(answer, step.want)) fail({ checked: `without any crash, request ${i + 1} is answered by the rules`, input: story(), observed: `request ${i + 1} (${describe(step.request)}) answered ${showAnswer(answer)}`, expected: showAnswer(step.want) });
    if (canon(store.snapshot()) !== canon(step.after)) fail({ checked: `without any crash, request ${i + 1} moves exactly its item and coins`, input: story(), observed: `after request ${i + 1}: ${worldText(store.snapshot(), step.after)}`, expected: worldText(step.after) });
    ranges.push([first, store.writes]);
  }
  return ranges;
}

function crashText(script, steps, ranges, g, recoveryCrashes) {
  const i = ranges.findIndex(([a, b]) => g >= a && g <= b);
  const [a, b] = ranges[i];
  const where = steps.length === 1
    ? `crash after write ${g} of the trade (${b} writes; ${describe(steps[0].request)})`
    : `crash after write ${g} of the script: write ${g - a + 1} of ${b - a + 1} of request ${i + 1} (${describe(steps[i].request)})`;
  const recovery = recoveryCrashes.map((m) => `then recover, crashed after its write ${m}`).join(', ');
  return `${where}, ${recovery ? `${recovery}, ` : ''}then recover, then the retry`;
}

// Runs the script with a crash after write g, restarts, and runs recovery crashed after
// each write in recoveryCrashes (restarting after each). Stops before the last recovery.
function upToRecovery(env, f, script, steps, g, recoveryCrashes, story) {
  const store = createStore(WORLDS[script.world]);
  store.crashAfter(g);
  for (const [i, step] of steps.entries()) {
    try {
      call(env, 'trade', f.trade, [store, copyOf(step.request)], story);
    } catch (error) {
      if (!(error instanceof Crash)) throw error;
      store.restart();
      for (const m of recoveryCrashes) {
        store.crashAfter(m);
        let fired = false;
        try { call(env, 'recover', f.recover, [store], story); } catch (inner) { if (!(inner instanceof Crash)) throw inner; fired = true; }
        store.restart();
        if (!fired) fail({ checked: 'recovery makes the same writes when it runs again from the same store', input: story(), observed: `recover finished before its write ${m}`, expected: `a crash after recovery's write ${m}, as on an identical store before` });
      }
      return { store, index: i };
    }
  }
  return fail({ checked: 'the trade makes the same writes when run again', input: story(), observed: `the crash armed for write ${g} never came: with it armed, your trades made only ${writesText(store.writes)}`, expected: `at least ${g} writes, as without the crash` });
}

// The last recovery, the checks after it, the client's retry, then the rest of the script.
function finishScenario(env, f, script, steps, store, index, story) {
  const step = steps[index];
  const pre = store.snapshot();
  const finished = call(env, 'recover', f.recover, [store], story);
  const post = store.snapshot();
  const shown = `before the request: ${worldText(step.before)}; after recovery: ${worldText(post, step.before)}`;
  const broken = invariantProblems(post, WORLDS[script.world]);
  if (broken.length) fail({ checked: 'after recovery every item is in exactly one inventory and the coins add up', input: story(), observed: `${broken.join('; ')}. ${shown}`, expected: `every item held once and ${coinTotal(WORLDS[script.world])} coins in all; with the trade made the world is ${worldText(step.after)}` });
  const made = canon(post) === canon(step.after);
  if (!made && canon(post) !== canon(step.before)) fail({ checked: 'after recovery the trade happened wholly or not at all', input: story(), observed: shown, expected: `either the world before the request, or the trade made: ${worldText(step.after)}` });
  const key = step.request.key;
  if (!Array.isArray(finished) || finished.some((k) => typeof k !== 'string')) fail({ checked: 'recover returns the keys of the trades it finished', input: story(), observed: `recover returned ${show(finished)}`, expected: 'a list of request keys' });
  if (finished.some((k, i) => i > 0 && !(finished[i - 1] < k))) fail({ checked: 'recover returns the keys sorted, each once', input: story(), observed: `recover returned ${show(finished)}`, expected: 'the keys sorted, each once' });
  const stray = finished.find((k) => k !== key);
  if (stray !== undefined) fail({ checked: 'recover returns the keys of the trades it finished', input: story(), observed: `recover returned ${show(finished)}, which names ${show(stray)}`, expected: `only ${show(key)} could have been interrupted` });
  if (finished.includes(key) && !made) fail({ checked: 'recover returns the keys of the trades it finished', input: story(), observed: `recover returned ${show(finished)}, but the trade is not made: ${shown}`, expected: `${show(key)} only when the trade is made after recovery` });
  if (!finished.includes(key) && made && canon(pre) !== canon(step.after)) fail({ checked: 'recover returns the keys of the trades it finished', input: story(), observed: `recover returned ${show(finished)}, yet it completed the trade: before recovery ${worldText(pre, step.before)}, after it ${worldText(post, step.before)}`, expected: `${show([key])}` });
  // The client gets no answer from a server that crashed, so it sends the request again.
  const retry = call(env, 'trade', f.trade, [store, copyOf(step.request)], story);
  if (!sameAnswer(retry, step.want)) fail({ checked: 'the retry returns the receipt of the trade that happened', input: story(), observed: `the retry answered ${showAnswer(retry)}; ${shown}`, expected: showAnswer(step.want) });
  if (canon(store.snapshot()) !== canon(step.after)) fail({ checked: 'after the retry the trade has happened exactly once', input: story(), observed: `after the retry: ${worldText(store.snapshot(), step.after)}; ${shown}`, expected: worldText(step.after) });
  if (step.want.ok) {
    const writes = store.writes;
    const again = call(env, 'trade', f.trade, [store, copyOf(step.request)], story);
    if (!sameAnswer(again, step.want) || store.writes !== writes) fail({ checked: 'nothing happens twice: a second retry returns the same receipt and writes nothing', input: story(), observed: `the second retry answered ${showAnswer(again)} and made ${writesText(store.writes - writes)}`, expected: `${showAnswer(step.want)} and no writes` });
    const changed = { ...step.request, price: step.request.price + 1 };
    const other = call(env, 'trade', f.trade, [store, changed], story);
    if (other?.ok !== false || other?.reason !== 'conflict' || store.writes !== writes) fail({ checked: 'after recovery, the same key with a different body is a conflict', input: `${story()}, then ${describe(changed)}`, observed: `answered ${showAnswer(other)} and made ${writesText(store.writes - writes)}`, expected: '{ ok: false, reason: "conflict" } and no writes' });
  }
  for (const [j, later] of steps.entries()) {
    if (j <= index) continue;
    const answer = call(env, 'trade', f.trade, [store, copyOf(later.request)], story);
    if (!sameAnswer(answer, later.want)) fail({ checked: 'after recovery and the retry, the rest of the script is answered as without a crash', input: story(), observed: `request ${j + 1} (${describe(later.request)}) answered ${showAnswer(answer)}`, expected: showAnswer(later.want) });
  }
  const last = steps.at(-1).after;
  if (canon(store.snapshot()) !== canon(last)) fail({ checked: 'after the whole script the world is as without a crash', input: story(), observed: worldText(store.snapshot(), last), expected: worldText(last) });
}

function storyOf(script, steps, ranges, g, recoveryCrashes) {
  return () => `the ${script.world} world (${worldText(WORLDS[script.world])}), script "${script.name}": ${steps.map((s, i) => `${i + 1}. ${describe(s.request)}`).join('; ')}; ${crashText(script, steps, ranges, g, recoveryCrashes)}`;
}

// How many writes one more recovery makes from where upToRecovery stopped.
function recoveryWrites(env, f, script, steps, g, recoveryCrashes, story) {
  const { store } = upToRecovery(env, f, script, steps, g, recoveryCrashes, story);
  const copy = createStore(store.snapshot());
  call(env, 'recover', f.recover, [copy], story);
  return copy.writes;
}

// ---------------------------------------------------------------- cases

// Requests the shape rule refuses, each against the market world.
const BAD_SHAPES = [
  [null, 'not an object'], [['sale-1'], 'a list'], ['sale-1', 'a string'],
  [{ key: 'q1', seller: 'ana', buyer: 'bo', item: 'sword' }, 'no price'],
  [{ seller: 'ana', buyer: 'bo', item: 'sword', price: 40 }, 'no key'],
  [{ ...req('q2', 'ana', 'bo', 'sword', 40), note: 'hi' }, 'an extra field'],
  [req('', 'ana', 'bo', 'sword', 40), 'an empty key'],
  [req('k'.repeat(41), 'ana', 'bo', 'sword', 40), 'a key of 41 characters'],
  [req('a b', 'ana', 'bo', 'sword', 40), 'a space in the key'],
  [req('a.b', 'ana', 'bo', 'sword', 40), 'a dot in the key'],
  [req('café', 'ana', 'bo', 'sword', 40), 'a letter outside A-Z a-z'],
  [req(5, 'ana', 'bo', 'sword', 40), 'a number as the key'],
  [req('q3', 7, 'bo', 'sword', 40), 'a number as the seller'],
  [req('q4', 'ana', null, 'sword', 40), 'null as the buyer'],
  [req('q5', 'ana', 'bo', 'sw/rd', 40), 'a slash in the item'],
  [req('q6', 'ana', 'bo', 's'.repeat(41), 40), 'an item of 41 characters'],
  [req('q7', 'ana', 'bo', 'sword', -1), 'a price below 0'],
  [req('q8', 'ana', 'bo', 'sword', 1.5), 'a price that is not whole'],
  [req('q9', 'ana', 'bo', 'sword', '40'), 'a price given as text'],
  [req('q10', 'ana', 'bo', 'sword', NaN), 'NaN as the price'],
  [req('q11', 'ana', 'bo', 'sword', Infinity), 'Infinity as the price'],
  [req('q12', 'bo', 'bo', 'bow', -1), 'a bad price and seller equal to buyer: shape comes first'],
];

// Requests in order against one store, each with the answer API.md requires.
const TRADE_SCRIPTS = [
  { name: 'sales, repeats, conflicts and refusals', world: 'market', requests: [
    [SALE, 'ok'],
    [SALE, 'ok'],
    [{ ...SALE, price: 45 }, 'conflict'],
    [{ ...SALE, buyer: 'cy' }, 'conflict'],
    [{ ...SALE, item: 'lamp' }, 'conflict'],
    [{ ...SALE, buyer: 'cy', price: 1000 }, 'conflict'],
    [{ ...SALE, buyer: 'ana' }, 'self'],
    [req('x1', 'bo', 'bo', 'bow', 5), 'self'],
    [req('x2', 'bo', 'cy', 'bow', 61), 'funds'],
    [req('x3', 'bo', 'cy', 'bow', 60), 'ok'],
    [req('x4', 'ana', 'cy', 'cap', 5), 'missing'],
    [req('x5', 'ana', 'bo', 'gem', 5), 'missing'],
    [req('x6', 'ana', 'cy', 'shield', 1000), 'missing'],
    [req('x2', 'cy', 'ana', 'cap', 10), 'ok'],
    [SALE, 'ok'],
  ] },
  { name: 'missing keys and a buyer with exactly the price', world: 'sparse', requests: [
    [req('k7', 'dee', 'eli', 'gem', 36), 'funds'],
    [req('k7', 'dee', 'eli', 'gem', 35), 'ok'],
    [req('k8', 'kim', 'dee', 'ring', 0), 'missing'],
    [req('k9', 'fay', 'jo', 'map', 1), 'funds'],
  ] },
  { name: 'price 0, the longest key, every allowed character', world: 'odd', requests: [
    [req(LONG_KEY, 'gus', 'hal', 'key-9', 0), 'ok'],
    [req('Ab_9-z', 'gus', 'jo', 'map9', 0), 'ok'],
    [req('Ab_9-z', 'gus', 'jo', 'map9', 0), 'ok'],
    [req('z', 'ivy', 'gus', 'orb', 8), 'funds'],
  ] },
];

export const cases = [
  {
    id: '16.trade', title: 'trade answers by the rules, with no crash', timeLimitMs: 10000,
    requirement: 'trade refuses shape, self, conflict, missing and funds in that order and writes nothing when it refuses; a sale moves the item and the coins and returns the receipt; the same key and body again returns the same receipt and writes nothing.',
    async run(env) {
      const f = await load(env);
      for (const [request, about] of BAD_SHAPES) {
        const store = createStore(WORLDS.market);
        const story = () => `the market world (${worldText(WORLDS.market)}): trade(store, ${show(request, 200)}): ${about}`;
        const answer = call(env, 'trade', f.trade, [store, copyOf(request)], story);
        if (answer?.ok !== false || answer?.reason !== 'shape') fail({ checked: 'trade refuses a request of the wrong shape', input: story(), observed: `answered ${showAnswer(answer)}`, expected: '{ ok: false, reason: "shape" }' });
        if (store.writes) fail({ checked: 'a refusal writes nothing', input: story(), observed: `it made ${writesText(store.writes)}`, expected: 'no writes' });
      }
      for (const script of TRADE_SCRIPTS) {
        const steps = model(script);
        const store = createStore(WORLDS[script.world]);
        for (const [i, step] of steps.entries()) {
          const story = () => `the ${script.world} world (${worldText(WORLDS[script.world])}), requests in order on one store: ${steps.slice(0, i + 1).map((s, j) => `${j + 1}. ${describe(s.request)}`).join('; ')}`;
          const writes = store.writes;
          const before = canon(store.snapshot());
          const answer = call(env, 'trade', f.trade, [store, copyOf(step.request)], story);
          if (!sameAnswer(answer, step.want)) fail({ checked: `request ${i + 1} is answered by the rules`, input: story(), observed: `request ${i + 1} answered ${showAnswer(answer)}; the world before it: ${worldText(step.before)}`, expected: showAnswer(step.want) });
          const repeat = canon(step.before) === canon(step.after);
          if (repeat && store.writes !== writes) fail({ checked: step.want.ok ? 'a request whose key was carried out with the same body writes nothing' : 'a refusal writes nothing', input: story(), observed: `request ${i + 1} made ${writesText(store.writes - writes)}`, expected: 'no writes' });
          if (repeat && canon(store.snapshot()) !== before) fail({ checked: 'a request that changes nothing leaves every belonging as it was', input: story(), observed: worldText(store.snapshot(), step.before), expected: worldText(step.before) });
          if (canon(store.snapshot()) !== canon(step.after)) fail({ checked: `request ${i + 1} moves exactly its item and its coins`, input: story(), observed: `after request ${i + 1}: ${worldText(store.snapshot(), step.after)}`, expected: worldText(step.after) });
        }
      }
    },
  },
  {
    id: '16.crash-trade', title: 'a crash after any write of a trade, then recover and the retry', timeLimitMs: 20000,
    requirement: 'For a crash after every write of a trade, then recover, then the client\'s retry: every item is in exactly one inventory, the coins add up, the trade happened wholly or not at all, recover names the trade it finished, and the retry returns the receipt without anything happening twice.',
    async run(env) {
      const f = await load(env);
      for (const script of SCRIPTS) {
        const steps = model(script);
        const ranges = clean(env, f, script, steps);
        const total = ranges.at(-1)[1];
        for (let g = 1; g <= total; g += 1) {
          const story = storyOf(script, steps, ranges, g, []);
          const { store, index } = upToRecovery(env, f, script, steps, g, [], story);
          finishScenario(env, f, script, steps, store, index, story);
        }
        // With nothing interrupted, recovery has nothing to finish.
        const store = createStore(WORLDS[script.world]);
        for (const step of steps) call(env, 'trade', f.trade, [store, copyOf(step.request)], () => `script "${script.name}" without a crash`);
        const finished = call(env, 'recover', f.recover, [store], () => `script "${script.name}" without a crash, then recover`);
        if (!Array.isArray(finished) || finished.length) fail({ checked: 'recover finishes nothing when no crash interrupted a trade', input: `the ${script.world} world, script "${script.name}": ${steps.map((s, i) => `${i + 1}. ${describe(s.request)}`).join('; ')}; no crash, then recover`, observed: `recover returned ${show(finished)}`, expected: '[]' });
      }
    },
  },
  {
    id: '16.crash-recover', title: 'a crash during recovery, then recover again', timeLimitMs: 30000,
    requirement: 'After a crash in a trade, recovery itself is crashed after each of its writes (and the second recovery after each of its own), then recover runs to the end: the same guarantees hold, and the retry returns the receipt.',
    async run(env) {
      const f = await load(env);
      for (const script of SCRIPTS) {
        const steps = model(script);
        const ranges = clean(env, f, script, steps);
        const total = ranges.at(-1)[1];
        const deep = script.requests.length === 1;  // two levels of recovery crashes for the short scripts
        for (let g = 1; g <= total; g += 1) {
          const first = recoveryWrites(env, f, script, steps, g, [], storyOf(script, steps, ranges, g, []));
          for (let m = 1; m <= first; m += 1) {
            const story = storyOf(script, steps, ranges, g, [m]);
            const { store, index } = upToRecovery(env, f, script, steps, g, [m], story);
            finishScenario(env, f, script, steps, store, index, story);
            if (!deep) continue;
            const second = recoveryWrites(env, f, script, steps, g, [m], story);
            for (let m2 = 1; m2 <= second; m2 += 1) {
              const story2 = storyOf(script, steps, ranges, g, [m, m2]);
              const again = upToRecovery(env, f, script, steps, g, [m, m2], story2);
              finishScenario(env, f, script, steps, again.store, again.index, story2);
            }
          }
        }
      }
    },
  },
  {
    id: '16.double-sell', title: 'one item sold to two buyers', timeLimitMs: 20000,
    requirement: 'Two sales of one item to two buyers never both succeed, with or without a crash in the first: the other is refused missing, and the item\'s new owner can sell it on.',
    async run(env) {
      const f = await load(env);
      const sell = (store, request, story) => call(env, 'trade', f.trade, [store, copyOf(request)], story);
      const expectAnswer = (got, want, checked, story, store) => {
        if (!sameAnswer(got, want)) fail({ checked, input: story(), observed: `answered ${showAnswer(got)}; the world now: ${worldText(store.snapshot())}`, expected: showAnswer(want) });
      };
      const ok = (r) => ({ ok: true, receipt: receiptOf(r) });
      const missing = { ok: false, reason: 'missing' };
      // Without a crash, in two worlds.
      for (const [world, first, rival, resale, late] of [
        ['market', SALE, RIVAL, req('sale-3', 'bo', 'cy', 'sword', 50), req('sale-4', 'ana', 'bo', 'sword', 10)],
        ['odd', req('h1', 'gus', 'hal', 'hat', 0), req('h2', 'gus', 'ivy', 'hat', 0), req('h3', 'hal', 'ivy', 'hat', 0), req('h4', 'gus', 'hal', 'hat', 0)],
      ]) {
        const store = createStore(WORLDS[world]);
        const done = [];
        const story = () => `the ${world} world (${worldText(WORLDS[world])}), requests in order: ${done.map((r, i) => `${i + 1}. ${describe(r)}`).join('; ')}`;
        for (const [request, want, checked] of [
          [first, ok(first), 'the first sale succeeds'],
          [rival, missing, 'a second sale of the same item by the same seller is refused missing'],
          [resale, ok(resale), 'the new owner can sell the item on'],
          [late, missing, 'the first seller still cannot sell it'],
          [first, ok(first), 'the first sale\'s request again still returns its receipt'],
        ]) {
          done.push(request);
          expectAnswer(sell(store, request, story), want, checked, story, store);
        }
        const broken = invariantProblems(store.snapshot(), WORLDS[world]);
        if (broken.length) fail({ checked: 'every item is in exactly one inventory', input: story(), observed: `${broken.join('; ')}: ${worldText(store.snapshot())}`, expected: 'every item held once' });
      }
      // A crash after each write of the first sale; after recovery the rival comes first, then the retry.
      const steps = model(SCRIPTS[0]);
      const ranges = clean(env, f, SCRIPTS[0], steps);
      for (let g = 1; g <= ranges[0][1]; g += 1) {
        const base = storyOf(SCRIPTS[0], steps, ranges, g, []);
        const story = () => base().replace(/then the retry$/, `then ${describe(RIVAL)}, then the retry of sale-1`);
        const { store } = upToRecovery(env, f, SCRIPTS[0], steps, g, [], story);
        call(env, 'recover', f.recover, [store], story);
        const rival = sell(store, RIVAL, story);
        const retry = sell(store, SALE, story);
        const wins = [rival?.ok === true, retry?.ok === true].filter(Boolean).length;
        const now = worldText(store.snapshot());
        if (wins !== 1) fail({ checked: 'exactly one of the two sales of the sword succeeds', input: story(), observed: `${describe(RIVAL)} answered ${showAnswer(rival)}; the retry answered ${showAnswer(retry)}; the world now: ${now}`, expected: `one ok with its receipt, the other { ok: false, reason: "missing" }` });
        const [won, lost, lostAnswer] = rival.ok ? [RIVAL, SALE, retry] : [SALE, RIVAL, rival];
        expectAnswer(won === RIVAL ? rival : retry, ok(won), `the sale that succeeded returns its receipt`, story, store);
        expectAnswer(lostAnswer, missing, `the other sale (${lost.key}) is refused missing`, story, store);
        const broken = invariantProblems(store.snapshot(), WORLDS.market);
        if (broken.length) fail({ checked: 'every item is in exactly one inventory', input: story(), observed: `${broken.join('; ')}: ${now}`, expected: 'every item held once' });
        const holder = store.snapshot()[`inv:${won.buyer}`] ?? [];
        if (!holder.includes('sword')) fail({ checked: 'the sword went to the buyer of the sale that succeeded', input: story(), observed: now, expected: `${won.buyer} holds the sword` });
        const onward = req('sale-9', won.buyer, won.buyer === 'bo' ? 'cy' : 'bo', 'sword', 0);
        expectAnswer(sell(store, onward, story), ok(onward), 'the new owner can sell the sword on', story, store);
      }
    },
  },
];
