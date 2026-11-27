// Set up lesson 05 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-05.mjs ./work write
//   node examples/start-05.mjs ./work supplied
//   node examples/start-05.mjs ./work new-case
// It changes only what you have not touched: lift.mjs and flight.mjs while they
// are still files the course gave you, and the stubs of module 05's functions in
// engine.mjs. On the supplied route it also gives checkKit, aimFor and the
// options module 05's changes, where they still hold lesson 03's checkpoint code;
// where they hold yours, it leaves them and says so. If anything else it would
// replace holds code of your own, it writes nothing at all.
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
    'Usage: node examples/start-05.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);

// new-case adds only the new case's file, for a folder where you wrote
// module 05 your own way. It replaces nothing and records no route.
if (route === 'new-case') {
  if (!existsSync(join(work, 'course-work.json'))) {
    console.error(`${destination} is not a work folder made by the course.`);
    process.exit(2);
  }
  try {
    copyFileSync(
      join(root, 'starter/shot-count.mjs'),
      join(work, 'shot-count.mjs'),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(
      `${destination} already has shot-count.mjs; it is untouched.`,
    );
    process.exit(2);
  }
  console.log(
    `Added shot-count.mjs, the new case, unwritten, to ${destination}.`,
  );
  console.log('No route was recorded; nothing else changed.');
  process.exit(0);
}

const ENGINE = 'examples/engine-checkpoint-05.mjs';
const EARLIER = 'examples/engine-checkpoint-03.mjs';
// Each module 05 stub in engine.mjs, and the regions that take its place.
const STUBS = [
  ['analyse', ['analyse', 'constants-of']],
  ['sayPhysics', ['say-physics']],
  ['learnPhysics', ['learn-physics', 'check-shot']],
];
// Lesson 03's regions that module 05 changes, by the function they hold.
const CHANGED = [
  ['options', 'the options'],
  ['check-kit', 'checkKit'],
  ['aim-for', 'aimFor'],
];
const WHOLE = ['lift', 'flight'].map((name) => ({
  file: `${name}.mjs`,
  untouched: [
    `starter/${name}.mjs`,
    `starter/${name}-build.mjs`,
    `examples/${name}-checkpoint.mjs`,
  ],
  write: `starter/${name}-build.mjs`,
  supplied: `examples/${name}-checkpoint.mjs`,
}));
// Changed regions that hold the learner's own code, for the closing note.
const kept = [];

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
  // On the supplied route, lesson 03's code in a changed region becomes
  // module 05's. Code of your own there is left for you to change.
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

function plan() {
  const writes = [];
  const engine = join(work, 'engine.mjs');
  if (!existsSync(engine)) throw new Error(`${destination} has no engine.mjs`);
  writes.push(['engine.mjs', planEngine(readFileSync(engine, 'utf8'))]);
  for (const w of WHOLE) {
    const path = join(work, w.file);
    if (!existsSync(path)) throw new Error(`${destination} has no ${w.file}`);
    const text = readFileSync(path, 'utf8');
    if (!w.untouched.some((f) => course(f) === text)) {
      throw new Error(`${w.file} already has code of your own`);
    }
    writes.push([w.file, course(w[route])]);
  }
  if (!existsSync(join(work, 'shot-count.mjs'))) {
    writes.push(['shot-count.mjs', course('starter/shot-count.mjs')]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module05_start_route = route;
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
  const add = `node examples/start-05.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === 'shot-count.mjs');
const engine = readFileSync(join(work, 'engine.mjs'), 'utf8');
console.log(`Lesson 05 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'lift.mjs has 19 regions to fill, flight.mjs 11 and engine.mjs 5.'
    : "lift.mjs, flight.mjs and engine.mjs hold module 05's checkpoint code.",
);
console.log('Your code from the earlier lessons is unchanged.');
if (kept.length) {
  const yours = kept.join(', ');
  console.log(`${yours} hold your own code: make lesson 05's changes to them.`);
}
console.log(
  added
    ? 'shot-count.mjs, the new case, is added unwritten.'
    : 'shot-count.mjs was already there and is unchanged.',
);
if (/not written yet: (learnFit|checkKit|playLevel) /.test(engine)) {
  console.log('engine.mjs still has earlier stubs; finish lesson 03 first.');
}
