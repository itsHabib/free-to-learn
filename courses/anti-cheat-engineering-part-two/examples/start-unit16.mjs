// Set up lesson 16's starting route inside the project you already have.
// node examples/start-unit16.mjs PROJECT write      the walkthrough's starting file
// node examples/start-unit16.mjs PROJECT supplied   the unit 16 end checkpoint
// It replaces trade/trade.mjs only while it is still the untouched starter (or already a
// route's file), adds trade/swap.mjs only when it is missing, and records the route in
// PROJECT.json. It changes nothing if any of that would replace your own work, and says in
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
const UNIT_FILE = 'trade/trade.mjs';

// The file a route puts in the project. The checkpoint imports nothing, so it is copied as
// it is.
export function routeFile(route) {
  return route === 'write'
    ? join(root, 'walkthrough', 'trade', 'trade.mjs')
    : join(root, 'examples', 'trade-checkpoint.mjs');
}

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

function start(folder, route) {
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
  const target = join(project, UNIT_FILE);
  const wanted = readFileSync(routeFile(route), 'utf8');
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  // Untouched files this command may replace: the blank starter, and either route's file.
  const untouched = [
    join(root, 'starter', UNIT_FILE),
    routeFile('write'),
    routeFile('supplied'),
  ].map((file) => readFileSync(file, 'utf8'));
  if (current !== null && current !== wanted && !untouched.includes(current))
    stop(
      `Nothing was changed: ${UNIT_FILE} holds your own edits (it is neither the starter nor a route's file), and this command never replaces your work; keep working in it, or make a new project for this route.`,
    );
  if (current !== wanted) plan.push([target, wanted]);
  const extra = join(project, 'trade', 'swap.mjs');
  if (!existsSync(extra))
    plan.push([
      extra,
      readFileSync(join(root, 'walkthrough', 'trade', 'swap.mjs'), 'utf8'),
    ]);
  metadata.unit16_start_route = route;
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
  const what = route === 'write' ? 'file with regions to fill' : 'checkpoint';
  console.log(
    `Unit 16 ${route} route set up in ${folder}: ${written.length ? `wrote ${written.join(', ')}` : 'every file was already in place'}, left your other files alone, and recorded the route in PROJECT.json (trade/trade.mjs is now the ${what}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [folder, route] = process.argv.slice(2);
  if (
    !folder ||
    !['write', 'supplied'].includes(route) ||
    process.argv.length !== 4
  )
    stop('Usage: node examples/start-unit16.mjs PROJECT write|supplied');
  start(folder, route);
}
