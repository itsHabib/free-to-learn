// Module 2: find where the game keeps angle, power, wind and the flag.
// Every function throws "not written yet" until you write it. API.md has the details.
// Lesson 02 fills the regions below. A listing replaces everything
// between one pair of region markers; keep the markers.
import * as S from './scan.mjs';

// region: given-search
// The most experiments one search may run.
const BUDGET = 30;

// The number at addr, read as 'f32' or 'i32', from the live memory.
export function read(host, addr, type) {
  const m = host.memory();
  const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
  if (type === 'f32') return view.getFloat32(addr, true);
  return view.getInt32(addr, true);
}

// Everything the search knows. Angle and power start as every slot
// in both views; the wind and the flag stay null until a new round.
function newSearch(bytes) {
  const all = S.allSlots(bytes);
  return {
    all,
    angle: { f32: all, i32: all },
    power: { f32: all, i32: all },
    wind: null,
    flag: null,
    found: {},
    statusLine: null,
    message: null,
    pixels: [], // the cloth's middle after each round of the line test
    history: new Map(), // a flag candidate's value after each of them
    rounds: 0,
    experiments: 0,
  };
}

// The menu's state: each value as a count, 'found' or null.
function stateOf(s) {
  const left = (name) =>
    s.found[name] ? 'found' : s[name] ? S.count(s[name]) : null;
  const lineFound = s.statusLine !== null;
  return {
    angle: left('angle'),
    power: left('power'),
    wind: left('wind'),
    flag: left('flag'),
    lineFound,
  };
}

// The state as the one line a picker reads.
function describe(state) {
  const shown = (v) => (v === null ? 'not scanned' : v);
  const names = ['angle', 'power', 'wind', 'flag'];
  return names.map((k) => `${k}: ${shown(state[k])}`).join(', ');
}
// endregion: given-search

// The experiments worth trying next: [{ kind, target, label }].
// region: experiment-menu
export function experimentMenu(state) {
  const options = [];
  for (const name of ['angle', 'power']) {
    const n = state[name];
    if (n === 'found') continue;
    if (n === null || n === 0 || n > 2) {
      // Either key narrows the value, so each is an option.
      for (const way of ['up', 'down']) {
        const target = `${name}_${way}`;
        const effect = `${name} should go ${way} by 1`;
        const label = `Press the ${name} ${way} key: ${effect}`;
        options.push({ kind: 'press', target, label });
      }
    } else {
      // One or two left: a press can't tell them apart.
      const label =
        `Write-test the ${n} ${name} candidates` +
        ' to see which one the game uses';
      options.push({ kind: 'write', target: name, label });
    }
  }
  const outside = state.wind !== 'found' || state.flag !== 'found';
  if (state.lineFound && outside) {
    const label = 'Press the new-round key: the wind and the flag move';
    options.push({ kind: 'press', target: 'new_round', label });
  }
  return options.slice(0, 5);
}
// endregion: experiment-menu

// Write, wait two frames, read back and restore each candidate: [{ type, addr, held }].
// region: write-test
export function writeTest(host, cands) {
  const results = [];
  for (const { type, addr } of S.list(cands)) {
    const was = read(host, addr, type);
    // 7 up below 50 and 7 down from 50: inside 5 to 85 and 10 to 100.
    const probe = Math.round(was) + (was < 50 ? 7 : -7);
    host.write(addr, type, probe);
    host.tick(2); // time for the game to rebuild a copy
    const held = Math.abs(read(host, addr, type) - probe) < 1e-6;
    host.write(addr, type, was);
    host.tick(2); // and time to rebuild it from the restored value
    results.push({ type, addr, held });
  }
  return results;
}
// endregion: write-test

// region: try-write
// A write-test on one value. The f32 slot that held wins, else the
// first; when none held, the candidates were wrong: start again.
function tryWrite(host, s, name) {
  const held = writeTest(host, s[name]).filter((r) => r.held);
  const best = held.find((r) => r.type === 'f32') ?? held[0];
  if (best) s.found[name] = { addr: best.addr, type: best.type };
  else s[name] = { f32: s.all, i32: s.all };
}
// endregion: try-write

// region: after-press
// Narrow every value by what one key press should have done to it.
function afterPress(s, target, before, after) {
  const changed = S.changedStrings(before, after);
  const was = (t) => S.readCString(before, t.addr);
  const label = (t) => S.changedLabel(was(t), t.text);
  const round = target === 'new_round';
  if (!round && s.statusLine === null) {
    const keyed = (t) => ['angle', 'power'].includes(label(t));
    const line = changed.find(keyed);
    s.statusLine = line ? line.addr : null;
  }
  if (round && s.message === null) {
    const caps = (t) => /^[A-Z][^a-z]*$/.test(t.text);
    const msg = changed.find((t) => t.addr !== s.statusLine && caps(t));
    s.message = msg ? msg.addr : null;
  }
  for (const name of ['angle', 'power']) {
    if (s.found[name]) continue;
    const v = s[name];
    if (target === `${name}_up`) {
      s[name] = S.filterDelta(v, before, after, 1);
    } else if (target === `${name}_down`) {
      s[name] = S.filterDelta(v, before, after, -1);
    } else s[name] = S.filterUnchanged(v, before, after);
  }
  if (round) return;
  // No key moves the wind or the flag.
  for (const name of ['wind', 'flag']) {
    if (s[name] && !s.found[name]) {
      s[name] = S.filterUnchanged(s[name], before, after);
    }
  }
}
// endregion: after-press

// region: after-round
// A new round: the wind from the status line, and one round of the
// line test.
function afterRound(host, s, before, after) {
  s.rounds++;
  const line = S.readCString(after, s.statusLine);
  const shown = line.match(/WIND\s+([-+]?\d+(?:\.\d+)?)/);
  if (!s.found.wind && shown) {
    const value = Number(shown[1]);
    // The line rounds to one decimal, so the wind is within 0.05.
    s.wind = s.wind
      ? S.filterNear(s.wind, after, value, 0.051)
      : { f32: S.scanNear(after, value, 0.051), i32: null };
  }
  const cloth = S.findRed(host.screen());
  if (!s.found.flag && cloth) lineTest(s, before, after, cloth.x);
}
// endregion: after-round

// region: line-test
// Where the flag's candidates start: f32 slots whose bits changed in
// the round and that hold a finite number between 0.001 and 100,000
// in size.
function movedFloats(before, after) {
  const all = { f32: S.allSlots(after), i32: null };
  const f = S.viewsOf(after).f32;
  const sized = (s) => Math.abs(f[s]) > 1e-3 && Math.abs(f[s]) < 1e5;
  const moved = S.filterChanged(all, before, after).f32;
  return moved.filter((s) => Number.isFinite(f[s]) && sized(s));
}

function lineTest(s, before, after, x) {
  s.flag = s.flag
    ? S.filterChanged(s.flag, before, after)
    : { f32: movedFloats(before, after), i32: null };
  const values = S.viewsOf(after).f32;
  const history = new Map();
  for (const slot of s.flag.f32) {
    history.set(slot, [...(s.history.get(slot) ?? []), values[slot]]);
  }
  s.history = history;
  s.pixels.push(x);
  if (s.pixels.length < 4) return; // two points always fit a line
  const onLine = (slot) => {
    const ys = history.get(slot);
    if (ys.length !== s.pixels.length) return false;
    const { slope, worst } = S.lineFit(s.pixels, ys);
    return slope > 0.25 && slope < 4 && worst <= 1.5;
  };
  s.flag = { f32: s.flag.f32.filter(onLine), i32: null };
}
// endregion: line-test

// region: settle
// After each experiment: one candidate left is found, none left starts
// that value again. The flag also needs four rounds of the line test.
function settle(s) {
  for (const name of ['angle', 'power']) {
    if (s.found[name] || S.count(s[name]) > 0) continue;
    s[name] = { f32: s.all, i32: s.all };
  }
  for (const name of ['wind', 'flag']) {
    if (s.found[name] || !s[name]) continue;
    const ready = name === 'wind' || s.pixels.length >= 4;
    const left = S.count(s[name]);
    if (left === 1 && ready) {
      s.found[name] = { addr: S.list(s[name])[0].addr, type: 'f32' };
    } else if (left === 0) {
      s[name] = null;
      if (name === 'flag') [s.pixels, s.history] = [[], new Map()];
    }
  }
}
// endregion: settle

// Resolves to { angle, power, wind, flag, statusLine, message, rounds, experiments }.
// region: find-values
export async function findValues(host, controls, options = {}) {
  const decide = options.decide ?? (() => 0);
  const s = newSearch(S.snapshot(host.memory()));
  const names = ['angle', 'power', 'wind', 'flag'];
  while (s.experiments < BUDGET && !names.every((n) => s.found[n])) {
    const state = stateOf(s);
    const menu = experimentMenu(state);
    if (!menu.length) break;
    const labels = menu.map((o) => o.label);
    let pick = await decide(describe(state), labels);
    // An answer that is not an index on the menu counts as option 0.
    const onMenu = pick >= 0 && pick < labels.length;
    if (!(Number.isInteger(pick) && onMenu)) pick = 0;
    const { kind, target } = menu[pick];
    s.experiments++;
    if (kind === 'write') tryWrite(host, s, target);
    else {
      const before = S.snapshot(host.memory());
      host.press(controls[target]);
      host.tick(2);
      const after = S.snapshot(host.memory());
      afterPress(s, target, before, after);
      if (target === 'new_round') afterRound(host, s, before, after);
    }
    settle(s);
  }
  const missing = names.filter((n) => !s.found[n]);
  if (s.statusLine === null) missing.push('status line');
  if (s.message === null) missing.push('message');
  if (missing.length) {
    throw new Error(`could not find ${missing.join(', ')}`);
  }
  const { found, statusLine, message, rounds, experiments } = s;
  return { ...found, statusLine, message, rounds, experiments };
}
// endregion: find-values
