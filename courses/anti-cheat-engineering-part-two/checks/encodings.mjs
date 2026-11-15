// The course's leak hunt, used by the unit 13 checks and by `node lab.mjs leaks`.
//
// Two ways to find a leak:
//
// 1. Non-interference (what your findLeaks does). Change one hidden thing on a copy of
//    the game, without changing anything the screen draws, and compare the two messages
//    byte for byte. It finds a leak under any encoding, even one nobody thought of.
//
// 2. The encoding search (this file's main job). Search every message the server sent
//    for the hidden values present when it was built, written the ways a leak is usually
//    written. It only finds what it searches for, but when it finds something it can say
//    which value, written how, and where in the message, which makes the leak easy to
//    find in your code.
//
// The values searched, with their names in game.hidden:
//   the exact wind (wind)                 as a double, and as a 32-bit float
//   the flag's speed (flagSpeed)          a 32-bit float
//   the random state (rng)                a 32-bit whole number
//   the flag's exact x (flagFraction)     a 32-bit float; only its forms with a fractional
//                                         part, since the screen draws the whole pace
//   the shell's velocity (shellVelocity)  vx and vy, 32-bit floats, while the shell flies
// The flag timer and the fractions of the other positions are small numbers that occur
// all over a correct message; non-interference covers them.
//
// The ways each value is written (its "forms"):
//   decimal  4 to 17 significant digits, and 2 to 6 digits after the point. Only forms
//            with a fractional part: a whole number is what the screen draws.
//   scaled   the value times 10,000 or 1,000,000, rounded or cut to a whole number, when
//            that is 10,000 or more in size (more than any number a correct message holds)
//   whole    the random state as a whole number, when it is 100,000 or more
//   bits     a float's 32 bits read as a whole number, when that is 100,000 or more
//   hex      the value's bytes (8 for a double, 4 for a float or the random state), first
//            byte first and last byte first, in either case; the random state also as
//            rng.toString(16)
//   base64   the same bytes, standard and URL-safe alphabets, with or without padding
// A number in a message matches when it equals a form. Text (a string value, or a key)
// matches when it contains a form: a digit form not touching other digits, a hex form in
// any case, a base64 form exactly.
import { Buffer } from 'node:buffer';
import { createLobServer } from '../public/runtime.mjs';
import { playSession } from '../public/sim.mjs';
import { link } from '../public/net.mjs';
import { makePlayer } from '../public/players.mjs';
import { searcher } from '../public/adversaries.mjs';
import { fullView } from '../public/full-view.mjs';
import { mixSeed } from '../public/stats.mjs';

// ------------------------------------------------------------------ the values

// What each searched value is called in reports, and the game.hidden name it belongs to.
export const SEARCHED = [
  { id: 'wind', hidden: 'wind', label: 'the exact wind' },
  { id: 'flagSpeed', hidden: 'flagSpeed', label: "the flag's speed" },
  { id: 'rng', hidden: 'rng', label: 'the random state' },
  { id: 'flagX', hidden: 'flagFraction', label: "the flag's exact x" },
  { id: 'vx', hidden: 'shellVelocity', label: "the shell's velocity, vx" },
  { id: 'vy', hidden: 'shellVelocity', label: "the shell's velocity, vy" },
];
const LABEL = Object.fromEntries(SEARCHED.map((s) => [s.id, s.label]));

const SCALED_MIN = 10_000;
const WHOLE_MIN = 100_000;
const fractional = (n) => Number.isFinite(n) && !Number.isInteger(n);

// Whether a value can be searched for: a float with a fractional part (a float that
// happens to be a whole number looks like the whole numbers a correct message is full of),
// or a random state of 100,000 or more.
export const searchable = (v) => (v.type === 'whole' ? v.value >= WHOLE_MIN : fractional(v.value));

// The searched values the game holds right now, the ones that can be searched for:
// [{ id, value, type, note }], type 'double', 'float' or 'whole'. Read them when the
// message is built. The wind is searched twice: as the double the server keeps, and as
// that double turned into a 32-bit float.
export function hiddenAt(game) {
  const wind = game.serverWind();
  const values = [
    { id: 'wind', value: wind, type: 'double' },
    { id: 'wind', value: Math.fround(wind), type: 'float', note: 'of the wind as a 32-bit float' },
    { id: 'flagSpeed', value: game.flagSpeed(), type: 'float' },
    { id: 'rng', value: game.rng(), type: 'whole' },
    { id: 'flagX', value: game.targetX(), type: 'float' },
  ];
  if (game.flying()) {
    const { vx, vy } = game.velocity();
    values.push({ id: 'vx', value: vx, type: 'float' }, { id: 'vy', value: vy, type: 'float' });
  }
  return values.filter(searchable);
}

// ------------------------------------------------------------------ the forms

const DIGITS = 'digits', HEX = 'hex', B64 = 'base64';

function bytesOf(value, type) {
  const b = Buffer.alloc(type === 'double' ? 8 : 4);
  if (type === 'double') b.writeDoubleLE(value);
  else if (type === 'float') b.writeFloatLE(value);
  else b.writeUInt32LE(value >>> 0);
  return b;
}

// Every form of one searchable value:
// { numbers: Map(number -> encoding), texts: [{ text, encoding, match }] }.
function formsOf({ value, type, note }) {
  const numbers = new Map();
  const texts = [];
  const seenText = new Set();
  const of = note ? `, ${note}` : '';
  const addNumber = (n, encoding) => { if (!numbers.has(n)) numbers.set(n, encoding + of); };
  const addText = (text, encoding, match) => {
    const key = match === HEX ? text.toLowerCase() : text;
    if (seenText.has(match + key)) return;
    seenText.add(match + key);
    texts.push({ text: key, encoding: encoding + of, match });
  };

  if (type !== 'whole') {
    // Decimal forms: a whole-number form is what the screen draws, so it is never searched.
    const decimal = (text, encoding) => {
      const n = Number(text);
      if (!fractional(n)) return;
      addNumber(n, encoding);
      addText(text, encoding, DIGITS);
      addText(String(n), encoding, DIGITS);
    };
    decimal(String(value), 'decimal, as JavaScript prints it');
    for (let p = 4; p <= 17; p++) decimal(value.toPrecision(p), `decimal, ${p} significant digits`);
    for (let d = 2; d <= 6; d++) decimal(value.toFixed(d), `decimal, ${d} digits after the point`);
    for (const [scale, name] of [[1e4, '10,000'], [1e6, '1,000,000']]) {
      for (const [cut, how] of [[Math.round, 'rounded'], [Math.trunc, 'cut']]) {
        const n = cut(value * scale);
        if (Math.abs(n) < SCALED_MIN) continue;
        addNumber(n, `scaled: times ${name}, ${how} to a whole number`);
        addText(String(n), `scaled: times ${name}, ${how} to a whole number`, DIGITS);
      }
    }
  } else {
    addNumber(value, 'a whole number');
    addText(String(value), 'a whole number', DIGITS);
  }

  const bytes = bytesOf(value, type);
  if (type === 'float') {
    const bits = bytes.readUInt32LE(0);
    if (bits >= WHOLE_MIN) {
      addNumber(bits, "the float's 32 bits as a whole number");
      addText(String(bits), "the float's 32 bits as a whole number", DIGITS);
    }
  }
  const size = type === 'double' ? '8 bytes of the double' : type === 'float' ? '4 bytes of the float' : '4 bytes';
  for (const [b, order] of [[bytes, 'first byte first'], [Buffer.from(bytes).reverse(), 'last byte first']]) {
    addText(b.toString('hex'), `hex: the ${size}, ${order}`, HEX);
    addText(b.toString('base64').replace(/=+$/, ''), `base64: the ${size}, ${order}`, B64);
    addText(b.toString('base64url'), `base64 (URL-safe): the ${size}, ${order}`, B64);
  }
  if (type === 'whole') addText((value >>> 0).toString(16), 'hex: rng.toString(16)', HEX);
  return { numbers, texts };
}

// Forms are reused while a value stays the same (the wind holds for a round).
const cache = new Map();
function formsCached(v) {
  const key = `${v.id}:${v.type}:${v.value}`;
  let forms = cache.get(key);
  if (!forms) {
    if (cache.size > 5000) cache.clear();
    forms = formsOf(v);
    cache.set(key, forms);
  }
  return forms;
}

// A digit form inside text counts only when no other digit (or a decimal point before
// it) touches it, so 3.217 is not found inside 13.2174.
function containsDigits(haystack, needle) {
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    const before = at > 0 ? haystack[at - 1] : '';
    const after = haystack[at + needle.length] ?? '';
    if (!/[0-9.]/.test(before) && !/[0-9]/.test(after)) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}

function textHits(text, values, where, hits) {
  if (text.length < 4) return;
  const lower = text.toLowerCase();
  const hasDigit = /[0-9]/.test(text);
  for (const v of values) {
    for (const f of formsCached(v).texts) {
      if (f.match === DIGITS ? hasDigit && containsDigits(text, f.text)
        : f.match === HEX ? lower.includes(f.text)
          : text.includes(f.text)) {
        hits.push({ id: v.id, label: LABEL[v.id], value: v.value, encoding: f.encoding, form: f.text, path: where });
      }
    }
  }
}

// Search one message (its JSON text) for the given values. Returns every hit:
// { id, label, value, encoding, form, path }, path saying where in the message.
export function searchMessage(text, given) {
  const values = given.filter(searchable);
  const hits = [];
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    textHits(String(text), values, 'the message text (not valid JSON)', hits);
    return hits;
  }
  const numbers = new Map();
  for (const v of values) {
    for (const [n, encoding] of formsCached(v).numbers) {
      if (!numbers.has(n)) numbers.set(n, []);
      numbers.get(n).push({ v, encoding });
    }
  }
  const walk = (x, path) => {
    if (typeof x === 'number') {
      for (const { v, encoding } of numbers.get(x) ?? []) hits.push({ id: v.id, label: LABEL[v.id], value: v.value, encoding, form: String(x), path: path || 'the whole message' });
    } else if (typeof x === 'string') {
      textHits(x, values, path || 'the whole message', hits);
    } else if (Array.isArray(x)) {
      x.forEach((y, i) => walk(y, `${path}[${i}]`));
    } else if (x && typeof x === 'object') {
      for (const [k, y] of Object.entries(x)) {
        textHits(k, values, `the key "${k}"${path ? ` in ${path}` : ''}`, hits);
        walk(y, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(message, '');
  return hits;
}

// ------------------------------------------------------------------ non-interference

// The first hidden change that alters view's message at this moment, or null.
// Each name in game.hidden is changed with setHidden(name, k), k = 1, 2, 3, on its own
// copy of the game; the view is never run on `game` itself. A copy with nothing changed
// must give the same bytes as a second such copy, or the view depends on something other
// than the game's state and info (it then comes back as { name: null }).
// Returns { name, k, before, after } with the two messages' texts.
export function firstInterference(view, game, info) {
  const before = JSON.stringify(view(game.clone(), info));
  const again = JSON.stringify(view(game.clone(), info));
  if (again !== before) return { name: null, k: null, before, after: again };
  for (const name of game.hidden) {
    for (let k = 1; k <= 3; k++) {
      const copy = game.clone();
      if (!copy.setHidden(name, k)) continue;
      const after = JSON.stringify(view(copy, info));
      if (after !== before) return { name, k, before, after };
    }
  }
  return null;
}

// For the lab: which hidden names are present at this moment (setHidden can change them),
// and which of those change the view's message. { present: [names], changed: [names] }.
export function interferenceAt(view, game, info) {
  const before = JSON.stringify(view(game.clone(), info));
  const present = [], changed = [];
  for (const name of game.hidden) {
    let here = false, moved = false;
    for (let k = 1; k <= 3; k++) {
      const copy = game.clone();
      if (!copy.setHidden(name, k)) continue;
      here = true;
      if (JSON.stringify(view(copy, info)) !== before) { moved = true; break; }
    }
    if (here) present.push(name);
    if (moved) changed.push(name);
  }
  return { present, changed };
}

// Where two message texts first differ, in words: the first field whose value differs,
// a field one has and the other lacks, or the same fields in another order.
export function describeDifference(beforeText, afterText) {
  let a, b;
  try { a = JSON.parse(beforeText); b = JSON.parse(afterText); } catch { return 'the texts differ'; }
  const show = (x) => { const s = JSON.stringify(x); return s === undefined ? 'nothing' : s.length > 80 ? `${s.slice(0, 77)}...` : s; };
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return `${show(a)} became ${show(b)}`;
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of ka) {
    if (!(k in b)) return `field ${k} is gone`;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return `field ${k}: ${show(a[k])} became ${show(b[k])}`;
  }
  const extra = kb.find((k) => !(k in a));
  if (extra) return `a field ${extra} appeared: ${show(b[extra])}`;
  return `the same fields in another order: ${ka.join(', ')} became ${kb.join(', ')}`;
}

// ------------------------------------------------------------------ sessions

// The sessions here are played by honest clients, so they need no parser: an input is
// admitted unless it is older than the newest admitted one, the shell is in the air, or it
// is a second fire in a round (API.md's rules, without the reasons). Your own admission is
// not involved, so these sessions test your view and nothing else. A client confused by a
// wrong view may send an input those rules refuse; it is refused, as your server would.
export const honestAdmission = {
  parseInput: (text) => ({ ok: true, input: JSON.parse(text) }),
  admit(state, input, { round, flying }) {
    if (input.seq <= state.lastSeq || flying || (input.fire && state.firedRound === round)) return { status: 'refused' };
    return { status: 'admitted', next: { lastSeq: input.seq, firedRound: input.fire ? round : state.firedRound } };
  },
};

const KIND_NAMES = {
  novice: 'a novice player', skilled: 'a skilled player', expert: 'an expert player', highLatency: 'a player on a slow connection',
  jitter: 'a player on a jittery connection', reconnects: 'a player who drops out and reconnects', searcher: 'the searching client',
};
export const describeSession = (s) => `${KIND_NAMES[s.kind] ?? s.kind} (server seed ${s.seed})`;

// One session as the corpus plays it: the client from mixSeed(seed, 2), the links from
// mixSeed(seed, 3) and mixSeed(seed, 4), the client's own network unless one is given.
// `view` is what the server sends. A player's official client runs in `screen` mode
// ('drawn' or 'full', client.mjs); the searching client uses whatever the server sends.
// `onView(game, info)` runs when each message is built, before the view, and must not
// change the game. Returns playSession's result.
export function playOne({ kind, seed, view, screen = 'drawn', network = null, onView = null, keepMessages = false }) {
  const client = kind === 'searcher' ? searcher(mixSeed(seed, 2)) : makePlayer(kind, mixSeed(seed, 2), { screen });
  const net = network ?? client.network;
  const server = createLobServer({
    seed,
    admission: honestAdmission,
    view: onView ? (game, info) => { onView(game, info); return view(game, info); } : view,
  });
  return playSession({
    server,
    client,
    up: link({ seed: mixSeed(seed, 3), ...net }),
    down: link({ seed: mixSeed(seed, 4), ...net }),
    keepMessages,
  });
}

// Play a session with `view` and search every message it sent for the hidden values
// present when that message was built. `probe(game, info)`, if given, also runs as each
// message is built (it must not change the game). Returns { messages, bytes, largest,
// hits, searched, found, result }: searched and found count messages per value id.
export function huntSession(session, view, { probe = null } = {}) {
  const hiddenByTick = new Map();
  const onView = (game, info) => {
    hiddenByTick.set(info.tick, hiddenAt(game));
    if (probe) probe(game, info);
  };
  const result = playOne({ ...session, view, keepMessages: true, onView });
  const searched = {}, found = {};
  const hits = [];
  let bytes = 0, largest = 0;
  for (const m of result.messages) {
    const size = Buffer.byteLength(m.text);
    bytes += size;
    largest = Math.max(largest, size);
    const values = hiddenByTick.get(m.tick) ?? [];
    for (const id of new Set(values.map((v) => v.id))) searched[id] = (searched[id] ?? 0) + 1;
    const here = searchMessage(m.text, values);
    for (const id of new Set(here.map((h) => h.id))) found[id] = (found[id] ?? 0) + 1;
    for (const h of here) hits.push({ ...h, tick: m.tick });
  }
  return { messages: result.messages.length, bytes, largest, hits, searched, found, result };
}

// The sessions 13.view-encodings plays: legal players and the searching client, each over
// its own network.
export const CHECK_SESSIONS = [
  { kind: 'expert', seed: 13_300_002 },
  { kind: 'novice', seed: 13_300_104 },
  { kind: 'reconnects', seed: 13_300_203 },
  { kind: 'jitter', seed: 13_300_401 },
  { kind: 'searcher', seed: 13_300_301 },
  { kind: 'searcher', seed: 13_300_307 },
];

// For the course's self-test: the encoding search over every session 13.view-encodings
// plays, once with the given drawn view (a correct one must give no hits at all) and once
// with the full view (every searched value must be found, in every message where it is
// present and can be searched for). Returns { sessions, drawn, full, missed, ok }.
export function calibrate({ drawnView, sessions = CHECK_SESSIONS }) {
  const drawn = { messages: 0, hits: 0, first: null };
  const full = { messages: 0, values: {} };
  for (const id of SEARCHED.map((s) => s.id)) full.values[id] = { searched: 0, found: 0 };
  for (const s of sessions) {
    const mine = huntSession(s, drawnView);
    drawn.messages += mine.messages;
    drawn.hits += mine.hits.length;
    if (!drawn.first && mine.hits.length) drawn.first = { session: describeSession(s), ...mine.hits[0] };
    const all = huntSession(s, fullView);
    full.messages += all.messages;
    for (const id of Object.keys(full.values)) {
      full.values[id].searched += all.searched[id] ?? 0;
      full.values[id].found += all.found[id] ?? 0;
    }
  }
  const missed = Object.entries(full.values).filter(([, c]) => c.found < c.searched || c.searched === 0).map(([id, c]) => `${id} found in ${c.found} of ${c.searched} messages`);
  return { sessions: sessions.length, drawn, full, missed, ok: drawn.hits === 0 && missed.length === 0 };
}
