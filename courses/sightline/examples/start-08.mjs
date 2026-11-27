// Set up lesson 08 in the work folder you already have, on the route you choose.
// Usage, from the course folder:
//   node examples/start-08.mjs ./work write
//   node examples/start-08.mjs ./work supplied
//   node examples/start-08.mjs ./work new-case
// Module 08's new code is one step of playLevel and the helper it calls. The
// command adds the helper's region, forgetOtherGame, in front of playLevel in
// engine.mjs: a stub on the write route, the checkpoint's code on the supplied
// route. On the supplied route it also gives playLevel module 08's step, where
// playLevel still holds lesson 07's checkpoint code; where it holds yours, it
// leaves it and says so. If the helper's region already holds code of your own,
// it writes nothing at all.
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
    'Usage: node examples/start-08.mjs ./work write|supplied|new-case',
  );
  process.exit(2);
}
const work = resolve(destination);
const CASE = 'score-anywhere.mjs';

// new-case adds only the new case's file, for a folder where you wrote
// module 08 your own way. It replaces nothing and records no route.
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

const ENGINE = 'examples/engine-checkpoint-08.mjs';
const EARLIER = 'examples/engine-checkpoint-07.mjs';
// Lesson 07's regions that module 08 changes, by the function they hold.
const CHANGED = [['play-level', 'playLevel']];
// Changed regions that hold the learner's own code, for the closing note.
const kept = [];

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

// What engine.mjs becomes, worked out before anything is written: the
// helper's region goes in front of playLevel, or replaces a region a start
// command put there.
function planEngine(text) {
  const finished = course(ENGINE);
  const code = regionOf(finished, 'forget-game');
  const wanted = route === 'write' ? stubsFor(code, 'engine.mjs') : code;
  const inside = regionOf(text, 'forget-game');
  const yours = new Error('engine.mjs already has your own forgetOtherGame');
  if (inside === undefined) {
    if (/\bfunction forgetOtherGame\(/.test(text)) throw yours;
    const marked = text.search(/^\/\/ region: play-level$/m);
    const at =
      marked >= 0 ? marked : text.search(/^export async function playLevel\(/m);
    if (at < 0) throw new Error('engine.mjs has no playLevel');
    text = `${text.slice(0, at)}${block('forget-game', wanted)}\n${text.slice(at)}`;
  } else {
    const untouched =
      inside === code || inside === stubsFor(code, 'engine.mjs');
    if (!untouched) throw yours;
    text = text.replace(regionPattern('forget-game'), () =>
      block('forget-game', wanted),
    );
  }
  // On the supplied route, lesson 07's playLevel becomes module 08's. Code of
  // your own there is left for you to change.
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
  const read = (file) => {
    const path = join(work, file);
    if (!existsSync(path)) throw new Error(`${destination} has no ${file}`);
    return readFileSync(path, 'utf8');
  };
  writes.push(['engine.mjs', planEngine(read('engine.mjs'))]);
  if (!existsSync(join(work, CASE))) {
    writes.push([CASE, course(`starter/${CASE}`)]);
  }
  const record = join(work, 'course-work.json');
  const meta = JSON.parse(readFileSync(record, 'utf8'));
  meta.module08_start_route = route;
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
  const add = `node examples/start-08.mjs ${destination} new-case`;
  const also = yours ? `; to add only the new case's file, run ${add}` : '';
  console.error(`Nothing was written: ${why}${also}.`);
  process.exit(2);
}
for (const [file, text] of writes) writeFileSync(join(work, file), text);

const added = writes.some(([file]) => file === CASE);
const engine = readFileSync(join(work, 'engine.mjs'), 'utf8');
console.log(`Lesson 08 route: ${route}, in ${destination}.`);
console.log(
  route === 'write'
    ? 'engine.mjs has 1 region to fill, forgetOtherGame, in front of playLevel.'
    : "engine.mjs holds module 08's checkpoint code.",
);
console.log('Your code from the earlier lessons is unchanged.');
if (kept.length) {
  const yours = kept.join(', ');
  console.log(`${yours} hold your own code: make lesson 08's changes to them.`);
}
console.log(
  added
    ? `${CASE}, the new case, is added unwritten.`
    : `${CASE} was already there and is unchanged.`,
);
if (/not written yet: (sayMover|learnMotion|pickDecider|sweep) /.test(engine)) {
  console.log('engine.mjs still has earlier stubs; finish lesson 07 first.');
}
