// Set up lesson 03 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-03.mjs ./work write
//   node examples/start-03.mjs ./work supplied
//   node examples/start-03.mjs ./work new-case
// It changes only what you have not touched: the stubs of module 03's functions
// in engine.mjs, and learn.mjs while it is still a file the course gave you.
// Your lessons 01 and 02 code stays as it is. If anything it would replace
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
    'Usage: node examples/start-03.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);

// new-case adds only the new case's file, for a folder where you wrote
// module 03 your own way. It replaces nothing and records no route.
if (route === 'new-case') {
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    process.exit(2);
  }
  try {
    copyFileSync(
      join(root, 'starter/flight-time.mjs'),
      join(work, 'flight-time.mjs'),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(
      `${destination} already has flight-time.mjs; it is untouched.`,
    );
    process.exit(2);
  }
  console.log(
    `Added flight-time.mjs, the new case, unwritten, to ${destination}.`,
  );
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}

const ENGINE = 'examples/engine-checkpoint-03.mjs';
// Each module 03 stub in engine.mjs, and the regions that take its place.
const STUBS = [
  ['learnFit', ['learn-fit']],
  ['fire', ['fire']],
  ['look', ['look']],
  ['checkKit', ['repair-find', 'options', 'state-broke', 'check-kit']],
  ['aimFor', ['aim-for']],
  ['playRounds', ['play-rounds']],
  ['playLevel', ['what-fits', 'pick-repair', 'repair-once', 'play-level']],
];
// The given budget code, which the lesson tours. Markers go around it
// only where it is exactly as the course gave it; it never changes.
const TOURED = ['given-allowance', 'given-metered'];
const LEARN = {
  untouched: [
    'starter/learn.mjs',
    'starter/learn-build.mjs',
    'examples/learn-checkpoint.mjs',
  ],
  write: 'starter/learn-build.mjs',
  supplied: 'examples/learn-checkpoint.mjs',
};

const stubOf = (text, name) => {
  const head = `export (async )?function ${name}\\(.*\\) \\{\\n`;
  const body = `  throw new Error\\('not written yet: ${name} in engine.mjs'\\);\\n\\}`;
  return text.match(new RegExp(`^${head}${body}$`, 'm'))?.[0] ?? null;
};
const regionPattern = (region) =>
  new RegExp(
    `^// region: ${region}\\n([\\s\\S]*?)\\n// endregion: ${region}$`,
    'm',
  );
const regionOf = (text, region) => text.match(regionPattern(region))?.[1];
// A region on the write route: a stub for each function the listing
// defines, so that it throws "not written yet" until you write it.
const stubsFor = (code) =>
  code
    .split('\n')
    .map((line) => line.match(/^(export )?(async )?function (\w+)\(.*\) \{$/))
    .filter(Boolean)
    .map(([head, , , name]) => {
      const why = `not written yet: ${name} in engine.mjs`;
      return `${head}\n  throw new Error('${why}');\n}`;
    })
    .join('\n\n');
const block = (region, inner) =>
  `// region: ${region}\n${inner}\n// endregion: ${region}`;

// What engine.mjs becomes, worked out before anything is written.
function planEngine(text) {
  const finished = course(ENGINE);
  for (const [name, regions] of STUBS) {
    const code = regions.map((r) => regionOf(finished, r));
    const wanted = code.map((c) => (route === 'write' ? stubsFor(c) : c));
    const inside = regions.map((r) => regionOf(text, r));
    const stub = stubOf(text, name);
    const blocks = regions.map((r, i) => block(r, wanted[i])).join('\n\n');
    if (inside.every((x) => x === undefined) && stub) {
      text = text.replace(stub, () => blocks);
      continue;
    }
    const untouched = (x, i) => x === stubsFor(code[i]) || x === code[i];
    if (!inside.every(untouched)) {
      throw new Error(`engine.mjs already has your own ${name}`);
    }
    regions.forEach((r, i) => {
      text = text.replace(regionPattern(r), () => block(r, wanted[i]));
    });
  }
  for (const region of TOURED) {
    const given = regionOf(finished, region);
    if (regionOf(text, region) !== undefined || !text.includes(given)) {
      continue;
    }
    text = text.replace(`${given}\n`, () => `${block(region, given)}\n`);
  }
  return text;
}

function plan() {
  const writes = [];
  const engine = join(work, 'engine.mjs');
  if (!existsSync(engine)) throw new Error(`${destination} has no engine.mjs`);
  writes.push(['engine.mjs', planEngine(readFileSync(engine, 'utf8'))]);
  const learnFile = join(work, 'learn.mjs');
  if (!existsSync(learnFile))
    throw new Error(`${destination} has no learn.mjs`);
  const learn = readFileSync(learnFile, 'utf8');
  if (!LEARN.untouched.some((f) => course(f) === learn)) {
    throw new Error('learn.mjs already has code of your own');
  }
  writes.push(['learn.mjs', course(LEARN[route])]);
  if (!existsSync(join(work, 'flight-time.mjs'))) {
    writes.push(['flight-time.mjs', course('starter/flight-time.mjs')]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module03_start_route = route;
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
  const add = `node examples/start-03.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === 'flight-time.mjs');
const engine = readFileSync(join(work, 'engine.mjs'), 'utf8');
console.log(`Lesson 03 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'learn.mjs has 14 regions to fill and engine.mjs 13.'
    : "learn.mjs and engine.mjs hold module 03's checkpoint code.",
);
console.log('Your lessons 01 and 02 code is unchanged.');
console.log(
  added
    ? 'flight-time.mjs, the new case, is added unwritten.'
    : 'flight-time.mjs was already there and is unchanged.',
);
if (/not written yet: (choose|learnControls) /.test(engine)) {
  console.log('engine.mjs still has earlier stubs; finish lessons 01 and 02.');
}
