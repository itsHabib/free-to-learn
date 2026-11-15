import { fail, expectSame, show, CONTROLS, observed, envWith } from './harness.mjs';
import { makeGame } from '../host.mjs';

export const title = 'Text in memory';
const L = 'lesson 01';
const enc = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

// A picker that must not be asked: module 01 has no menu.
const silent = () => {
  const calls = [];
  return { calls, async decide(text) { calls.push(text); throw new Error('no decision is needed to work out the controls'); } };
};

export const cases = [
  {
    id: '01-strings', title: 'findStrings finds the help text, the status line and ROUND 1, and only runs that end in a zero byte',
    requirement: 'findStrings keeps runs of minLen or more printable bytes (32 to 126, or a newline) that end in a zero byte, with the address of their first byte.',
    reread: `${L}, finding strings`,
    async run({ fn }) {
      const findStrings = await fn('scan.mjs', 'findStrings');
      const { host, truth } = makeGame({ mode: 0, seed: 1 });
      const found = findStrings(host.memory());
      if (!Array.isArray(found)) fail({ checked: 'findStrings returns a list', observed: `findStrings returned ${show(found, 80)}`, expected: 'a list of { addr, text }' });
      const help = found.find((s) => typeof s?.text === 'string' && s.text.includes('LOB, a tiny artillery range') && s.text.includes('Land within 12 paces'));
      if (!help) fail({ checked: 'findStrings on a fresh game finds the help text as one string', input: 'the memory of a fresh game', observed: `${found.length} strings; none holds both the first and the last line of the help text. First few: ${show(found.slice(0, 4).map((s) => s.text), 200)}`, expected: 'one string from "LOB, a tiny artillery range." to "Land within 12 paces of the flag to score."' });
      if (!found.some((s) => s.addr === truth.lineAddr() && s.text === truth.line())) fail({ checked: 'findStrings finds the status line at its address', observed: show(found.map((s) => [s.addr, s.text.slice(0, 20)]), 300), expected: `{ addr: ${truth.lineAddr()}, text: ${JSON.stringify(truth.line())} }` });
      if (!found.some((s) => s.addr === truth.msgAddr() && s.text === 'ROUND 1')) fail({ checked: 'findStrings finds the message', observed: show(found.map((s) => s.text.slice(0, 20)), 300), expected: `{ addr: ${truth.msgAddr()}, text: "ROUND 1" }` });
      expectSame(findStrings(enc('AB\0WIND +2.3\0\x01\x02\0')), [{ addr: 3, text: 'WIND +2.3' }], { checked: 'findStrings on a small example', input: '"AB\\0WIND +2.3\\0\\x01\\x02\\0"', what: 'strings' });
      expectSame(findStrings(enc('AB\0WIND +2.3\0'), 10), [], { checked: 'findStrings with minLen 10', input: '"AB\\0WIND +2.3\\0", minLen 10', what: 'strings' });
      expectSame(findStrings(enc('HELLO\x01WORLD\0')), [{ addr: 6, text: 'WORLD' }], { checked: 'a run ended by byte 1 is dropped', input: '"HELLO\\x01WORLD\\0"', what: 'strings' });
      expectSame(findStrings(enc('ABCDEFGH')), [], { checked: 'a run that reaches the end of memory is dropped', input: '"ABCDEFGH" with no zero byte', what: 'strings' });
      expectSame(findStrings(enc('RIGHT\nLEFT\0')), [{ addr: 0, text: 'RIGHT\nLEFT' }], { checked: 'a newline does not end a string', input: '"RIGHT\\nLEFT\\0"', what: 'strings' });
      expectSame(findStrings(enc('ABCD\0ABC\0')), [{ addr: 0, text: 'ABCD' }], { checked: 'a string of exactly minLen characters counts, one shorter does not', input: '"ABCD\\0ABC\\0", minLen 4', what: 'strings' });
    },
  },
  {
    id: '01-read', title: 'readCString stops at a zero byte, at max, and at the end of memory',
    requirement: 'readCString(bytes, addr, max = 256) returns the text from addr up to the first zero byte, at most max characters, and never reads past the end.',
    reread: `${L}, finding strings`,
    async run({ fn }) {
      const readCString = await fn('scan.mjs', 'readCString');
      const bytes = enc('AB\0WIND +2.3\0');
      expectSame([readCString(bytes, 3), readCString(bytes, 0), readCString(enc('ABCDEFGH\0'), 0, 4), readCString(enc('ABC'), 1)], ['WIND +2.3', 'AB', 'ABCD', 'BC'], { checked: 'readCString on four cases', input: 'address 3 and 0 of "AB\\0WIND +2.3\\0"; "ABCDEFGH\\0" with max 4; address 1 of "ABC" with no zero byte', what: 'texts' });
    },
  },
  {
    id: '01-wordy', title: 'wordy needs 6 characters and three letters in a row',
    requirement: 'wordy(text) is true when text has at least 6 characters and a run of 3 letters.',
    reread: `${L}, what changes when you press a key`,
    async run({ fn }) {
      const wordy = await fn('scan.mjs', 'wordy');
      expectSame([wordy('D+CE'), wordy('SCORE 1/2'), wordy('A1B2C3'), wordy('ROUND 4'), wordy('ABCDE'), wordy('AB CDE')], [false, true, false, true, false, true], { checked: 'wordy on six texts', input: '"D+CE", "SCORE 1/2", "A1B2C3", "ROUND 4", "ABCDE", "AB CDE"', what: 'results' });
    },
  },
  {
    id: '01-changed', title: 'changedStrings keeps wordy strings at the same address whose text changed',
    requirement: 'A changed string is one whose address held a string before and holds different, wordy text now; a string at a new address is not a change, and neither are a moving number\'s bytes.',
    reread: `${L}, what changes when you press a key`,
    async run({ fn }) {
      const changedStrings = await fn('scan.mjs', 'changedStrings');
      const snapshot = await fn('scan.mjs', 'snapshot');
      const before = new Uint8Array(48), after = new Uint8Array(48);
      before.set([0x44, 0x2a, 0x43, 0x45, 0], 0); after.set([0x44, 0x2b, 0x43, 0x45, 0], 0);
      before.set(enc('ANGLE 45 POWER 60\0'), 20); after.set(enc('ANGLE 46 POWER 60\0'), 20);
      after.set(enc('NEW TEXT\0'), 8);
      expectSame(changedStrings(before, after), [{ addr: 20, text: 'ANGLE 46 POWER 60' }], { checked: 'only the status line changed in place', input: 'a float\'s bytes "D*CE" becoming "D+CE" at 0, "NEW TEXT" appearing at 8, "ANGLE 45 POWER 60" becoming "ANGLE 46 POWER 60" at 20', what: 'changed strings' });
      // On seed 24 a second string changes with every key press, and it comes first in memory.
      const { host, truth } = makeGame({ mode: 0, seed: 24 });
      const a = snapshot(host.memory());
      host.press('ArrowRight');
      host.tick(2);
      const got = changedStrings(a, snapshot(host.memory()));
      if (!Array.isArray(got) || !got.some((s) => s.addr === truth.lineAddr())) fail({ checked: 'changedStrings after pressing RIGHT on seed 24', input: 'seed 24, where another string changes too and sits before the status line in memory', observed: show(got, 200), expected: `a list that includes the status line at ${truth.lineAddr()}` });
    },
  },
  {
    id: '01-label', title: 'changedLabel names the word in front of the first change',
    requirement: 'changedLabel returns the lower-cased word before the first word that differs, or null when nothing differs.',
    reread: `${L}, what changes when you press a key`,
    async run({ fn }) {
      const changedLabel = await fn('scan.mjs', 'changedLabel');
      const a = 'ANGLE 45  POWER 60  WIND +1.0  SCORE 0/0';
      expectSame(changedLabel(a, 'ANGLE 45  POWER 61  WIND +1.0  SCORE 0/0'), 'power', { checked: 'power went up', input: show(a), what: 'label' });
      expectSame(changedLabel(a, 'ANGLE 46  POWER 60  WIND +1.0  SCORE 0/0'), 'angle', { checked: 'angle went up', input: show(a), what: 'label' });
      expectSame(changedLabel(a, a), null, { checked: 'nothing changed', input: show(a), what: 'label' });
    },
  },
  {
    id: '01-snapshot', title: 'snapshot is a copy that later changes cannot touch',
    requirement: 'snapshot(bytes) returns a new Uint8Array with the same bytes.',
    reread: `${L}, what changes when you press a key`,
    async run({ fn }) {
      const snapshot = await fn('scan.mjs', 'snapshot');
      const live = enc('ROUND 1\0'), kept = snapshot(live);
      live[6] = 0x32;
      if (!(kept instanceof Uint8Array) || kept[6] !== 0x31) fail({ checked: 'snapshot is a copy', input: '"ROUND 1", then the game writes "ROUND 2" over it', observed: `the snapshot now reads ${show(String.fromCharCode(...(kept ?? []).slice(0, 7)))}`, expected: 'the snapshot still reads "ROUND 1"' });
    },
  },
  {
    id: '01-status', title: 'parseStatus reads the numbers on the status line',
    requirement: 'parseStatus(line) returns { angle, power, wind, wind_arrows }, null for what the line does not show; wind_arrows counts > as +1 and < as -1, and ~ is 0.',
    reread: `${L}, reading the status line`,
    async run({ fn }) {
      const parseStatus = await fn('scan.mjs', 'parseStatus');
      expectSame(parseStatus('ANGLE 45  POWER 60  WIND -2.8  SCORE 0/0'), { angle: 45, power: 60, wind: -2.8, wind_arrows: null }, { checked: 'a line with the exact wind', input: '"ANGLE 45  POWER 60  WIND -2.8  SCORE 0/0"', what: 'parsed' });
      expectSame(parseStatus('ANGLE 50  POWER 61  WIND <<  SCORE 3/4'), { angle: 50, power: 61, wind: null, wind_arrows: -2 }, { checked: 'a line with arrows', input: '"ANGLE 50  POWER 61  WIND <<  SCORE 3/4"', what: 'parsed' });
      expectSame(parseStatus('ANGLE 5  POWER 100  WIND ~  SCORE 0/0'), { angle: 5, power: 100, wind: null, wind_arrows: 0 }, { checked: 'a line with no wind arrows', input: '"ANGLE 5  POWER 100  WIND ~  SCORE 0/0"', what: 'parsed' });
      expectSame(parseStatus('HIT!'), { angle: null, power: null, wind: null, wind_arrows: null }, { checked: 'a line that is not the status line', input: '"HIT!"', what: 'parsed' });
    },
  },
  {
    id: '01-probe', title: 'learnControls works out all six controls by pressing keys, with no model',
    requirement: 'On a fresh game with nothing in the kit, learnControls presses each key but fire, watches the status line, and puts the six controls, the status line\'s address and the message\'s address in the kit. It asks the decision model nothing and never presses fire.',
    reread: `${L}, the engine's first step`,
    async run({ fn }) {
      const learnControls = await fn('engine.mjs', 'learnControls');
      const game = makeGame({ mode: 0, seed: 5 });
      const { host, seen } = observed(game);
      const picker = silent(), kit = {};
      await learnControls(host, kit, envWith(picker));
      expectSame(kit.controls, CONTROLS, { checked: 'kit.controls on a fresh game', input: 'seed 5, an empty kit', what: 'kit.controls' });
      if (kit.statusLine !== game.truth.lineAddr() || kit.message !== game.truth.msgAddr()) fail({ checked: 'the addresses of the status line and the message in the kit', observed: `statusLine ${show(kit.statusLine)}, message ${show(kit.message)}`, expected: `statusLine ${game.truth.lineAddr()}, message ${game.truth.msgAddr()}` });
      if (picker.calls.length) fail({ checked: 'whether the decision model was asked', observed: `it was asked ${picker.calls.length} time(s)`, expected: 'never: pressing keys answers this' });
      if (seen.presses.Space) fail({ checked: 'the keys pressed', observed: `Space was pressed ${seen.presses.Space} times`, expected: 'Space is never pressed: once the other five keys are known, the one left is fire' });
    },
  },
  {
    id: '01-seed24', title: 'on seed 24 the status line is the changed string whose label is angle or power',
    requirement: 'Another string changes with every key press on seed 24 and comes first in memory; learnControls still takes the status line by its label.',
    reread: `${L}, the engine's first step`,
    async run({ fn }) {
      const learnControls = await fn('engine.mjs', 'learnControls');
      const game = makeGame({ mode: 0, seed: 24 });
      const kit = {};
      await learnControls(game.host, kit, envWith(silent()));
      expectSame(kit.controls, CONTROLS, { checked: 'kit.controls on seed 24', what: 'kit.controls' });
      if (kit.statusLine !== game.truth.lineAddr() || kit.message !== game.truth.msgAddr()) fail({ checked: 'the addresses in the kit on seed 24', input: 'on this seed another string changes with each key press and sits before the status line', observed: `statusLine ${show(kit.statusLine)}, message ${show(kit.message)}`, expected: `statusLine ${game.truth.lineAddr()}, message ${game.truth.msgAddr()}` });
    },
  },
  {
    id: '01-keep', title: 'keys that still work stay in the kit, at no cost',
    requirement: 'controlsHold(host, kit) is true when the kit\'s angle and power keys still move the status line as it says; learnControls then keeps the kit, presses only angle and power keys, and starts no round.',
    reread: `${L}, the engine's first step`,
    async run({ fn }) {
      const learnControls = await fn('engine.mjs', 'learnControls');
      const controlsHold = await fn('engine.mjs', 'controlsHold');
      const game = makeGame({ mode: 0, seed: 9 });
      const kit = { controls: { ...CONTROLS }, statusLine: game.truth.lineAddr(), message: game.truth.msgAddr() };
      if (controlsHold(game.host, kit) !== true) fail({ checked: 'controlsHold with the right keys and addresses', observed: show(controlsHold(game.host, kit)), expected: 'true' });
      const { host, seen } = observed(game);
      await learnControls(host, kit, envWith(silent()));
      expectSame(kit.controls, CONTROLS, { checked: 'kit.controls after learnControls with working keys', what: 'kit.controls' });
      const other = Object.keys(seen.presses).filter((k) => !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k));
      if (other.length) fail({ checked: 'the keys pressed when the kit\'s keys still work', observed: show(seen.presses), expected: 'only angle and power keys: no new round, no shot' });
      const angle = game.truth.angle(), power = game.truth.power();
      if (Math.round(angle) !== 45 || power !== 60) fail({ checked: 'the barrel after the check', observed: `angle ${angle}, power ${power}`, expected: 'angle 45 and power 60 as before: each key pressed one way is pressed back' });
      // At the top of a range, stepping up does nothing; the check must step the other way.
      for (let i = 0; i < 40; i++) host.press('ArrowRight');
      if (controlsHold(host, kit) !== true) fail({ checked: 'controlsHold with the angle at 85, the most it can be', observed: show(controlsHold(host, kit)), expected: 'true: at the top of its range the angle is stepped down and back up' });
    },
  },
  {
    id: '01-recheck', title: 'keys that no longer work are noticed and worked out again',
    requirement: 'With angle_up given as ArrowUp in the kit, controlsHold is false and learnControls presses each key again and corrects the kit, never pressing fire.',
    reread: `${L}, the engine's first step`,
    async run({ fn }) {
      const learnControls = await fn('engine.mjs', 'learnControls');
      const controlsHold = await fn('engine.mjs', 'controlsHold');
      const game = makeGame({ mode: 0, seed: 8 });
      const kit = { controls: { ...CONTROLS, angle_up: 'ArrowUp', power_up: 'ArrowRight' }, statusLine: game.truth.lineAddr(), message: game.truth.msgAddr() };
      if (controlsHold(game.host, kit) !== false) fail({ checked: 'controlsHold with angle_up and power_up exchanged', observed: show(controlsHold(game.host, kit)), expected: 'false' });
      const { host, seen } = observed(game);
      await learnControls(host, kit, envWith(silent()));
      expectSame(kit.controls, CONTROLS, { checked: 'kit.controls after learnControls with wrong keys in the kit', what: 'kit.controls' });
      if (seen.presses.Space) fail({ checked: 'the keys pressed', observed: `Space was pressed ${seen.presses.Space} times`, expected: 'never' });
      if (controlsHold(game.host, { statusLine: game.truth.lineAddr(), message: game.truth.msgAddr() }) !== false) fail({ checked: 'controlsHold with no controls in the kit', expected: 'false' });
    },
  },
];
