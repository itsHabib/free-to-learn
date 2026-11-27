// Reads Kettle's levels from game/levels/NAME.txt.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel } from './core.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'levels');
export const levelNames = () => readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).sort();
export function levelText(name) {
  if (!levelNames().includes(name)) throw new Error(`there is no level ${name}; the levels are ${levelNames().join(', ')}`);
  return readFileSync(join(dir, `${name}.txt`), 'utf8');
}
export const loadLevel = (name) => parseLevel(levelText(name));
