// Set up lesson 02 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-02.mjs ./work write
//   node examples/start-02.mjs ./work supplied
//   node examples/start-02.mjs ./work new-case
// It changes only what you have not touched: the stubs of module 02's functions
// in scan.mjs and engine.mjs, and find.mjs while it is still a file the course
// gave you. Your lesson 01 code stays as it is. If anything it would replace
// holds code of your own, it writes nothing at all.
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
    'Usage: node examples/start-02.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);

// new-case adds only the new case's file, for a folder where you wrote
// module 02 your own way. It replaces nothing and records no route.
if (route === 'new-case') {
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    process.exit(2);
  }
  try {
    copyFileSync(
      join(root, 'starter/landing-age.mjs'),
      join(work, 'landing-age.mjs'),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(
      `${destination} already has landing-age.mjs; it is untouched.`,
    );
    process.exit(2);
  }
  console.log(
    `Added landing-age.mjs, the new case, unwritten, to ${destination}.`,
  );
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}

// Module 02's functions in each file, with the region each one goes in.
const STUBBED = {
  'scan.mjs': {
    checkpoint: 'examples/scan-checkpoint-02.mjs',
    regions: [
      ['viewsOf', 'views-of'],
      ['allSlots', 'all-slots'],
      ['count', 'count'],
      ['list', 'list'],
      ['filterDelta', 'filter-delta'],
      ['filterUnchanged', 'filter-unchanged'],
      ['filterChanged', 'filter-changed'],
      ['scanNear', 'scan-near'],
      ['filterNear', 'filter-near'],
      ['lineFit', 'line-fit'],
      ['findRed', 'find-red'],
    ],
  },
  'engine.mjs': {
    checkpoint: 'examples/engine-checkpoint-02.mjs',
    regions: [['choose', 'choose']],
  },
};
// The starter's note that its stubs leave parameters unused. Once module 02
// is in place scan.mjs has no stubs left, so the note goes too.
const NOTE =
  "/* eslint-disable no-unused-vars -- later modules use the stubs' parameters */\n";
const FIND = {
  untouched: [
    'starter/find.mjs',
    'starter/find-build.mjs',
    'examples/find-checkpoint.mjs',
  ],
  write: 'starter/find-build.mjs',
  supplied: 'examples/find-checkpoint.mjs',
};

const stubOf = (text, file, name) => {
  const head = `export (async )?function ${name}\\(.*\\) \\{\\n`;
  const body = `  throw new Error\\('not written yet: ${name} in ${file}'\\);\\n\\}`;
  return text.match(new RegExp(`^${head}${body}$`, 'm'))?.[0] ?? null;
};
const regionPattern = (region) =>
  new RegExp(
    `^// region: ${region}\\n([\\s\\S]*?)\\n// endregion: ${region}$`,
    'm',
  );
const regionOf = (text, region) => text.match(regionPattern(region))?.[1];

// What each file becomes, worked out before anything is written.
function plan() {
  const writes = [];
  for (const [file, { checkpoint, regions }] of Object.entries(STUBBED)) {
    const path = join(work, file);
    if (!existsSync(path)) throw new Error(`${destination} has no ${file}`);
    const starter = course(`starter/${file}`);
    const finished = course(checkpoint);
    let text = readFileSync(path, 'utf8');
    for (const [name, region] of regions) {
      const stub = stubOf(starter, file, name);
      const code = regionOf(finished, region);
      const wanted = route === 'write' ? stub : code;
      const block = `// region: ${region}\n${wanted}\n// endregion: ${region}`;
      const inside = regionOf(text, region);
      if (inside === stub || inside === code) {
        text = text.replace(regionPattern(region), () => block);
      } else if (inside === undefined && text.includes(stub)) {
        text = text.replace(stub, () => block);
      } else {
        throw new Error(`${file} already has your own ${name}`);
      }
    }
    if (file === 'scan.mjs') text = text.replace(NOTE, '');
    writes.push([file, text]);
  }
  const find = readFileSync(join(work, 'find.mjs'), 'utf8');
  if (!FIND.untouched.some((f) => course(f) === find)) {
    throw new Error('find.mjs already has code of your own');
  }
  writes.push(['find.mjs', course(FIND[route])]);
  if (!existsSync(join(work, 'landing-age.mjs'))) {
    writes.push(['landing-age.mjs', course('starter/landing-age.mjs')]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module02_start_route = route;
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
  const add = `node examples/start-02.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === 'landing-age.mjs');
const scan = readFileSync(join(work, 'scan.mjs'), 'utf8');
console.log(`Lesson 02 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'scan.mjs has 11 regions to fill, find.mjs 8 and engine.mjs 1.'
    : "scan.mjs, find.mjs and engine.mjs hold module 02's checkpoint code.",
);
console.log('Your lesson 01 code in scan.mjs and engine.mjs is unchanged.');
console.log(
  added
    ? 'landing-age.mjs, the new case, is added unwritten.'
    : 'landing-age.mjs was already there and is unchanged.',
);
if (/not written yet: (snapshot|findStrings|changedStrings) /.test(scan)) {
  console.log('scan.mjs still has lesson 01 stubs; finish lesson 01 first.');
}
