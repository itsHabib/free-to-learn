// Set up lesson 06 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-06.mjs ./work write
//   node examples/start-06.mjs ./work supplied
//   node examples/start-06.mjs ./work new-case
// It changes only what you have not touched: reader.mjs while it is still a file
// the course gave you, windWord in flight.mjs while it is a stub, and the stubs of
// module 06's functions in engine.mjs. On the supplied route it also gives
// analyse, look, the options, stateBroke, checkKit and aimFor module 06's
// changes, where they still hold lesson 05's checkpoint code; where they hold
// yours, it leaves them and says so. If anything else it would replace holds code
// of your own, it writes nothing at all.
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
    'Usage: node examples/start-06.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);
const CASE = 'score-reader.mjs';

// new-case adds only the new case's file, for a folder where you wrote
// module 06 your own way. It replaces nothing and records no route.
if (route === 'new-case') {
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    process.exit(2);
  }
  try {
    copyFileSync(
      join(root, `starter/${CASE}`),
      join(work, CASE),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(`${destination} already has ${CASE}; it is untouched.`);
    process.exit(2);
  }
  console.log(`Added ${CASE}, the new case, unwritten, to ${destination}.`);
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}

const ENGINE = 'examples/engine-checkpoint-06.mjs';
const EARLIER = 'examples/engine-checkpoint-05.mjs';
const FLIGHT = 'examples/flight-checkpoint-06.mjs';
// Each module 06 stub in engine.mjs, and the regions that take its place.
const STUBS = [
  ['sayReader', ['say-reader']],
  ['learnReader', ['learn-reader', 'reader-holds', 'flag-moves']],
  ['heuristic', ['heuristic']],
];
// Lesson 05's regions that module 06 changes, by the function they hold.
const CHANGED = [
  ['analyse', 'analyse'],
  ['look', 'look'],
  ['options', 'the options'],
  ['state-broke', 'stateBroke'],
  ['check-kit', 'checkKit'],
  ['aim-for', 'aimFor'],
];
const WHOLE = {
  file: 'reader.mjs',
  untouched: [
    'starter/reader.mjs',
    'starter/reader-build.mjs',
    'examples/reader-checkpoint.mjs',
  ],
  write: 'starter/reader-build.mjs',
  supplied: 'examples/reader-checkpoint.mjs',
};
// Lines of course code in flight.mjs that module 06 makes true again.
const FLIGHT_NOTE =
  "/* eslint-disable no-unused-vars -- windWord is module 06's, a stub here */\n";
const FLIGHT_HEAD = [
  '// Lesson 05 fills the regions below.',
  '// Lessons 05 and 06 fill the regions below.',
];
// Changed regions that hold the learner's own code, for the closing note.
const kept = [];

const stubOf = (text, name, file) => {
  const head = `export (async )?function ${name}\\(.*\\) \\{\\n`;
  const why = `not written yet: ${name} in ${file}`;
  const body = `  throw new Error\\('${why}'\\);\\n\\}`;
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
const stubsFor = (code, file) =>
  code
    .split('\n')
    .map((line) => line.match(/^(export )?(async )?function (\w+)\(.*\) \{$/))
    .filter(Boolean)
    .map(([head, , , name]) => {
      const why = `not written yet: ${name} in ${file}`;
      return `${head}\n  throw new Error('${why}');\n}`;
    })
    .join('\n\n');
const block = (region, inner) =>
  `// region: ${region}\n${inner}\n// endregion: ${region}`;

// One stub of a file, or its regions if a start command put them there,
// becomes the route's regions. Code of your own there stops everything.
function planStub(text, finished, name, regions, file) {
  const code = regions.map((r) => regionOf(finished, r));
  const wanted = code.map((c) => (route === 'write' ? stubsFor(c, file) : c));
  const inside = regions.map((r) => regionOf(text, r));
  const stub = stubOf(text, name, file);
  const blocks = regions.map((r, i) => block(r, wanted[i])).join('\n');
  if (inside.every((x) => x === undefined) && stub) {
    return text.replace(stub, () => blocks);
  }
  const untouched = (x, i) => x === stubsFor(code[i], file) || x === code[i];
  if (!inside.every(untouched)) {
    throw new Error(`${file} already has your own ${name}`);
  }
  regions.forEach((r, i) => {
    text = text.replace(regionPattern(r), () => block(r, wanted[i]));
  });
  return text;
}

// What engine.mjs becomes, worked out before anything is written.
function planEngine(text) {
  const finished = course(ENGINE);
  for (const [name, regions] of STUBS) {
    text = planStub(text, finished, name, regions, 'engine.mjs');
  }
  // On the supplied route, lesson 05's code in a changed region becomes
  // module 06's. Code of your own there is left for you to change.
  if (route === 'supplied') {
    for (const [region, name] of CHANGED) {
      const inside = regionOf(text, region);
      const now = regionOf(finished, region);
      if (inside === now) continue;
      if (inside === regionOf(course(EARLIER), region)) {
        text = text.replace(regionPattern(region), () => block(region, now));
      } else kept.push(name);
    }
  }
  return text;
}

// What flight.mjs becomes: windWord's stub turns into its region.
function planFlight(text) {
  const finished = course(FLIGHT);
  text = planStub(text, finished, 'windWord', ['wind-word'], 'flight.mjs');
  if (text.startsWith(FLIGHT_NOTE)) text = text.slice(FLIGHT_NOTE.length);
  return text.replace(FLIGHT_HEAD[0], FLIGHT_HEAD[1]);
}

function plan() {
  const writes = [];
  const read = (file) => {
    const path = join(work, file);
    if (!existsSync(path)) throw new Error(`${destination} has no ${file}`);
    return readFileSync(path, 'utf8');
  };
  writes.push(['engine.mjs', planEngine(read('engine.mjs'))]);
  writes.push(['flight.mjs', planFlight(read('flight.mjs'))]);
  const text = read(WHOLE.file);
  if (!WHOLE.untouched.some((f) => course(f) === text)) {
    throw new Error(`${WHOLE.file} already has code of your own`);
  }
  writes.push([WHOLE.file, course(WHOLE[route])]);
  if (!existsSync(join(work, CASE))) {
    writes.push([CASE, course(`starter/${CASE}`)]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module06_start_route = route;
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
  const add = `node examples/start-06.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === CASE);
const engine = readFileSync(join(work, 'engine.mjs'), 'utf8');
console.log(`Lesson 06 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'reader.mjs has 10 regions to fill, flight.mjs 1 and engine.mjs 5.'
    : "reader.mjs, windWord in flight.mjs and engine.mjs hold module 06's checkpoint code.",
);
console.log('Your code from the earlier lessons is unchanged.');
if (kept.length) {
  const yours = kept.join(', ');
  console.log(`${yours} hold your own code: make lesson 06's changes to them.`);
}
console.log(
  added
    ? `${CASE}, the new case, is added unwritten.`
    : `${CASE} was already there and is unchanged.`,
);
if (/not written yet: (analyse|sayPhysics|learnPhysics) /.test(engine)) {
  console.log('engine.mjs still has earlier stubs; finish lesson 05 first.');
}
