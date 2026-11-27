// Show what module 08's step does to a kit carried to another game.
// Usage, from the course folder:
//   node examples/trace-08.mjs ./work kit
// It hands your playLevel a kit holding all eight entries a game teaches,
// marked as Lob's, on level 8, and stops it the first time your engine reads
// the new game's memory or screen or presses a key, to show what the kit
// still holds then.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameBytes } from '../host.mjs';
import { LEVELS, referee } from '../levels.mjs';

const [work, step] = process.argv.slice(2);
if (!work || step !== 'kit' || process.argv.length !== 4) {
  console.error('Usage: node examples/trace-08.mjs ./work kit');
  process.exit(2);
}
const E = await import(pathToFileURL(join(resolve(work), 'engine.mjs')).href);

// The id gameId gives a game's file: its length and a checksum of its bytes.
const idOf = (game) => {
  const bytes = gameBytes(game);
  let sum = 0;
  for (const b of bytes) sum = (sum * 31 + b) >>> 0;
  return `${bytes.length}:${sum}`;
};
const KEYS = [
  'ArrowRight',
  'ArrowLeft',
  'ArrowUp',
  'ArrowDown',
  'KeyN',
  'Space',
];
const controls = Object.fromEntries(
  ['angle_up', 'angle_down', 'power_up', 'power_down', 'new_round', 'fire'].map(
    (k, i) => [k, KEYS[i]],
  ),
);
// Each entry a game teaches, with a stand-in value; the controls as well.
const kit = {
  game: idOf('lob'),
  controls,
  ...{ statusLine: 1, message: 2, found: {}, shots: [] },
  ...{ fit: { game: idOf('lob') }, physics: { game: idOf('lob') } },
  ...{ reader: { game: idOf('lob'), which: 0 } },
  ...{ mover: { game: idOf('lob'), which: 0 } },
};
const named = (k) => Object.keys(k).filter((x) => x !== 'game');
// A list of entries, wrapped to fit under its heading.
function listed(keys) {
  const lines = [''];
  for (const k of keys) {
    if (lines.at(-1).length + k.length > 56) lines.push('');
    lines[lines.length - 1] += `${lines.at(-1) ? ', ' : ''}${k}`;
  }
  return lines.map((l) => `    ${l}`).join('\n');
}
console.log('the kit handed to level 8 holds:');
console.log(listed(named(kit)));
console.log(`  kit.game is Lob's: ${kit.game === idOf('lob')}`);

const level = LEVELS[7];
const real = referee(level).host;
class Stop extends Error {}
let seen = null;
const first = (what) => () => {
  seen ??= { what, keys: named(kit), game: kit.game };
  throw new Stop(what);
};
const host = {
  binary: () => real.binary(),
  memory: first('read its memory'),
  screen: first('read its screen'),
  press: first('pressed a key'),
  write: first('wrote to it'),
  tick: first('let a frame pass'),
};
const env = {
  models: { decide: async () => ({ choice: 0, ms: 1 }) },
  log() {},
};
try {
  await E.playLevel(host, level, kit, env);
} catch (error) {
  if (!(error instanceof Stop)) throw error;
}
console.log(`when your engine first ${seen.what}, it holds:`);
console.log(listed(seen.keys));
console.log(`  kit.game is Lob II's: ${seen.game === idOf('lob2')}`);
