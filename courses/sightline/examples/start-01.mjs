// Create a new work folder for lesson 01 on the route you choose.
// Usage, from the course folder:
//   node examples/start-01.mjs ./work write
//   node examples/start-01.mjs ./work supplied
// It refuses a folder that already exists, so it never replaces your work.
// A folder made with "node lab.mjs start" gets only the new case's file:
//   node examples/start-01.mjs ./work new-case
// That adds read-result.mjs if it is missing and records no route.
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [destination, route] = process.argv.slice(2);
const routes = ['write', 'supplied', 'new-case'];
if (!destination || !routes.includes(route) || process.argv.length !== 4) {
  console.error('Usage: node examples/start-01.mjs NEW_FOLDER write|supplied');
  console.error('   or: node examples/start-01.mjs EXISTING_FOLDER new-case');
  process.exit(2);
}
const work = resolve(destination);

if (route === 'new-case') {
  // Only the new case's file, into a folder "node lab.mjs start" made.
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    console.error('Create one with a route, or with: node lab.mjs start.');
    process.exit(2);
  }
  const target = join(work, 'read-result.mjs');
  try {
    copyFileSync(
      join(root, 'starter/read-result.mjs'),
      target,
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(
      `${destination} already has read-result.mjs; it is untouched.`,
    );
    process.exit(2);
  }
  console.log(
    `Added read-result.mjs, the new case, unwritten, to ${destination}.`,
  );
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}
let exists = true;
try {
  lstatSync(work);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  exists = false;
}
if (exists) {
  console.error(`Refusing ${destination}: it already exists.`);
  console.error('Choose a new folder name; your files are untouched.');
  console.error(
    `If you made it with node lab.mjs start, add the new case's file with: node examples/start-01.mjs ${destination} new-case`,
  );
  process.exit(2);
}

// The usual start: nine starter files and opcodes.mjs.
const lab = join(root, 'lab.mjs');
const started = spawnSync(process.execPath, [lab, 'start', work], {
  encoding: 'utf8',
});
if (started.error) throw started.error;
if (started.status !== 0) {
  process.stderr.write(started.stderr ?? '');
  process.exit(started.status ?? 1);
}

// Then only the two files lesson 01 works in are replaced, in this new folder.
const from = {
  write: ['starter/scan-build.mjs', 'starter/engine-build.mjs'],
  supplied: ['examples/scan-checkpoint.mjs', 'examples/engine-checkpoint.mjs'],
}[route];
copyFileSync(join(root, from[0]), join(work, 'scan.mjs'));
copyFileSync(join(root, from[1]), join(work, 'engine.mjs'));
copyFileSync(
  join(root, 'starter/read-result.mjs'),
  join(work, 'read-result.mjs'),
);
const record = join(work, 'course-work.json');
const meta = JSON.parse(readFileSync(record, 'utf8'));
meta.module01_start_route = route;
writeFileSync(record, JSON.stringify(meta) + '\n');

console.log(`Created ${destination}. Lesson 01 route: ${route}.`);
console.log(
  route === 'write'
    ? 'scan.mjs and engine.mjs have 11 regions to fill; check 01 fails.'
    : 'scan.mjs and engine.mjs are lesson 01 finished; check 01 passes.',
);
console.log('read-result.mjs, the new case, is unwritten on both routes.');
