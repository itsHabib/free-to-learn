// Set up lesson 13's starting route inside the project you already have.
// node examples/start-unit13.mjs PROJECT write      the walkthrough's starting files
// node examples/start-unit13.mjs PROJECT supplied   the unit 13 end checkpoint
// It replaces server/view.mjs and server/leaks.mjs only while each is still the untouched
// starter (or already the route's file), adds server/spectator.mjs only when it is missing,
// and records the route in PROJECT.json. It changes nothing if any of that would replace
// your own work, and says in one sentence what it did or why it refused.
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
const UNIT_FILES = ['view', 'leaks'];

// The file a route puts in the project for each name.
export function routeFile(route, name) {
  return route === 'write'
    ? join(root, 'walkthrough', 'server', `${name}.mjs`)
    : join(root, 'examples', `${name}-checkpoint.mjs`);
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
  for (const name of UNIT_FILES) {
    const rel = `server/${name}.mjs`;
    const target = join(project, rel);
    const wanted = readFileSync(routeFile(route, name), 'utf8');
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    // Untouched files this command may replace: the blank starter, and either route's file.
    const untouched = [
      join(root, 'starter', rel),
      routeFile('write', name),
      routeFile('supplied', name),
    ].map((file) => readFileSync(file, 'utf8'));
    if (current === wanted) continue;
    if (current !== null && !untouched.includes(current))
      stop(
        `Nothing was changed: ${rel} holds your own edits (it is neither the starter nor a route's file), and this command never replaces your work; keep working in it, or make a new project for this route.`,
      );
    plan.push([target, wanted]);
  }
  const spectator = join(project, 'server', 'spectator.mjs');
  if (!existsSync(spectator))
    plan.push([
      spectator,
      readFileSync(
        join(root, 'walkthrough', 'server', 'spectator.mjs'),
        'utf8',
      ),
    ]);
  metadata.unit13_start_route = route;
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
  const what = route === 'write' ? 'files with regions to fill' : 'checkpoint';
  console.log(
    `Unit 13 ${route} route set up in ${folder}: ${written.length ? `wrote ${written.join(', ')}` : 'every file was already in place'}, left your other files alone, and recorded the route in PROJECT.json (view and leaks are now the ${what}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [folder, route] = process.argv.slice(2);
  if (
    !folder ||
    !['write', 'supplied'].includes(route) ||
    process.argv.length !== 4
  )
    stop('Usage: node examples/start-unit13.mjs PROJECT write|supplied');
  start(folder, route);
}
