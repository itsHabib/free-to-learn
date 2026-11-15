// Create a fresh project for either chapter route. Never replace existing work.
import { copyFileSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [destination, route] = process.argv.slice(2);
if (
  !destination ||
  !['write', 'supplied'].includes(route) ||
  process.argv.length !== 4
) {
  throw Error(
    'Usage: node examples/start-chapter.mjs NEW_PROJECT write|supplied',
  );
}
const project = resolve(destination);
let exists = false;
try {
  lstatSync(project);
  exists = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (exists)
  throw Error(
    `Refusing existing path: ${destination}. Choose a new project folder.`,
  );
const started = spawnSync(
  process.execPath,
  [join(root, 'lab.mjs'), 'start', project],
  {
    encoding: 'utf8',
  },
);
if (started.error) throw started.error;
if (started.stderr) process.stderr.write(started.stderr);
if (started.status !== 0) {
  process.stdout.write(started.stdout ?? '');
  process.exit(started.status ?? 1);
}
// lab start created this directory exclusively. Only its fresh Machine stub is replaced.
copyFileSync(
  join(
    root,
    route === 'write'
      ? 'starter/machine-build.mjs'
      : 'examples/machine-checkpoint.mjs',
  ),
  join(project, 'machine.mjs'),
);
copyFileSync(
  join(root, 'starter/run-slice.mjs'),
  join(project, 'run-slice.mjs'),
);
const metadataPath = join(project, 'PROJECT.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
metadata.unit08_start_route = route;
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
console.log(`Created ${destination}. Unit 08 initial route: ${route}.`);
console.log(
  route === 'supplied'
    ? 'The supplied Machine should pass the unit 08 checks; reading and exercises remain.'
    : 'The Machine has six unfinished regions; its initial unit 08 checks should fail.',
);
console.log(`Work in ${destination}/machine.mjs.`);
console.log(
  'The new application remains unfinished in run-slice.mjs on both routes.',
);
