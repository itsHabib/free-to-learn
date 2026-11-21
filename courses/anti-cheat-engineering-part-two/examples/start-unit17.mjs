// Set up lesson 17 inside the project you already have.
// node examples/start-unit17.mjs PROJECT
// Lesson 17 has no new code to write or copy, so there is one route. It adds
// capstone/gain.mjs, the new application's unfinished file, only when it is missing, and
// records the route in PROJECT.json. It never touches capstone/defence.json or your detector,
// which hold your own settings. It changes nothing if it can't write both files, and says in
// one sentence what it did or why it refused.
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function why(error, path) {
  if (error.code === 'EACCES' || error.code === 'EPERM')
    return `this user may not write ${path}, so check who owns the project folder`;
  if (error.code === 'ENOENT') return `${path} does not exist`;
  return `${path}: ${error.message}`;
}

function stop(sentence) {
  console.log(sentence);
  process.exit(1);
}

function start(folder) {
  const project = resolve(folder);
  const metadataPath = join(project, 'PROJECT.json');
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch {
    stop(
      `Nothing was changed: ${folder} is not a project folder yet; make one first with lesson 12's node examples/start-chapter.mjs ${folder} write, or supplied.`,
    );
  }
  if (metadata.course !== 'anti-cheat-engineering-part-two')
    stop(`Nothing was changed: ${folder} is a project of another course.`);

  // Decide everything before writing anything.
  const plan = [];
  const extra = join(project, 'capstone', 'gain.mjs');
  if (!existsSync(extra))
    plan.push([
      extra,
      readFileSync(join(root, 'walkthrough', 'capstone', 'gain.mjs'), 'utf8'),
    ]);
  metadata.unit17_start_route = 'capstone';
  plan.push([metadataPath, JSON.stringify(metadata, null, 2) + '\n']);
  for (const [path] of plan) {
    try {
      accessSync(existsSync(path) ? path : dirname(path), constants.W_OK);
    } catch (error) {
      stop(`Nothing was changed: ${why(error, path)}.`);
    }
  }

  for (const [path, text] of plan) {
    try {
      writeFileSync(path, text);
    } catch (error) {
      stop(`Stopped part way: ${why(error, path)}.`);
    }
  }
  const written = plan
    .slice(0, -1)
    .map(([path]) => path.slice(project.length + 1));
  console.log(
    `Unit 17 set up in ${folder}: ${written.length ? `wrote ${written.join(', ')}` : 'capstone/gain.mjs was already there'}, left your other files alone (capstone/defence.json and your detector included), and recorded the route in PROJECT.json.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [folder] = process.argv.slice(2);
  if (!folder || process.argv.length !== 3)
    stop('Usage: node examples/start-unit17.mjs PROJECT');
  start(folder);
}
