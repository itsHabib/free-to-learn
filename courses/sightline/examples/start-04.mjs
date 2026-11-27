// Set up lesson 04 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-04.mjs ./work write
//   node examples/start-04.mjs ./work supplied
//   node examples/start-04.mjs ./work new-case
// It replaces wasm.mjs only while it is still a file the course gave you, and
// adds encode-leb.mjs, the new case, if it is missing. Nothing else changes.
// If wasm.mjs holds code of your own, it writes nothing at all.
import { accessSync, constants, copyFileSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const course = (file) => readFileSync(join(root, file), 'utf8');
const [destination, route] = process.argv.slice(2);
if (
  !['write', 'supplied', 'new-case'].includes(route) ||
  process.argv.length !== 4
) {
  console.error(
    'Usage: node examples/start-04.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);

// new-case adds only the new case's file, for a folder where you wrote
// module 04 your own way. It replaces nothing and records no route.
if (route === 'new-case') {
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    process.exit(2);
  }
  try {
    copyFileSync(
      join(root, 'starter/encode-leb.mjs'),
      join(work, 'encode-leb.mjs'),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(
      `${destination} already has encode-leb.mjs; it is untouched.`,
    );
    process.exit(2);
  }
  console.log(
    `Added encode-leb.mjs, the new case, unwritten, to ${destination}.`,
  );
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}

const WASM = {
  untouched: [
    'starter/wasm.mjs',
    'starter/wasm-build.mjs',
    'examples/wasm-checkpoint.mjs',
  ],
  write: 'starter/wasm-build.mjs',
  supplied: 'examples/wasm-checkpoint.mjs',
};

// What changes, worked out before anything is written.
function plan() {
  const writes = [];
  const path = join(work, 'wasm.mjs');
  if (!existsSync(path)) throw new Error(`${destination} has no wasm.mjs`);
  const wasm = readFileSync(path, 'utf8');
  if (!WASM.untouched.some((f) => course(f) === wasm)) {
    throw new Error('wasm.mjs already has code of your own');
  }
  writes.push(['wasm.mjs', course(WASM[route])]);
  if (!existsSync(join(work, 'encode-leb.mjs'))) {
    writes.push(['encode-leb.mjs', course('starter/encode-leb.mjs')]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module04_start_route = route;
  writes.push(['course-work.json', JSON.stringify(meta) + '\n']);
  return writes;
}

let writes;
try {
  if (!existsSync(join(work, 'course-work.json'))) {
    throw new Error(`${destination} is not a work folder made by the course`);
  }
  writes = plan();
  for (const [file] of writes) {
    const path = join(work, file);
    accessSync(existsSync(path) ? path : work, constants.W_OK);
  }
} catch (error) {
  const file = error.path ? basename(error.path) : '';
  const why = !error.code
    ? error.message
    : error.code === 'ENOENT'
      ? `${file} is missing`
      : `${file} can't be written`;
  // Code of your own is kept; the new case's file can still be added alone.
  const yours = /already has (your own|code of your own)/.test(why);
  const add = `node examples/start-04.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === 'encode-leb.mjs');
console.log(`Lesson 04 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'wasm.mjs has its given top and 15 regions to fill.'
    : "wasm.mjs holds module 04's checkpoint code.",
);
console.log('Your other files are unchanged.');
console.log(
  added
    ? 'encode-leb.mjs, the new case, is added unwritten.'
    : 'encode-leb.mjs was already there and is unchanged.',
);
