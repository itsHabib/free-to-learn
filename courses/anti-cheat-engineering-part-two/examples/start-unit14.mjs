// Set up lesson 14's starting route inside the project you already have.
// node examples/start-unit14.mjs PROJECT write      the walkthrough's starting files
// node examples/start-unit14.mjs PROJECT supplied   the unit 14 end checkpoint
// It replaces detect/features.mjs and detect/detector.mjs only while each is still the
// untouched starter (or already a route's file), adds detect/kind-budget.mjs only when it
// is missing, and records the route in PROJECT.json. It never touches detect/settings.json,
// which is yours on every route. It changes nothing if any of that would replace your own
// work, and says in one sentence what it did or why it refused.
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
const UNIT_FILES = ['features', 'detector'];

// The checkpoint sits in examples/, one folder below the course; a project's detect files
// sit two folders below it, so their imports of public/ climb one folder more, and the
// detector imports the project's features.mjs.
export function intoProject(source) {
  return source
    .replaceAll("'../public/", "'../../public/")
    .replaceAll("'./features-checkpoint.mjs'", "'./features.mjs'");
}

// The text a route puts in the project for each name.
export function routeText(route, name) {
  return route === 'write'
    ? readFileSync(join(root, 'walkthrough', 'detect', `${name}.mjs`), 'utf8')
    : intoProject(
        readFileSync(join(root, 'examples', `${name}-checkpoint.mjs`), 'utf8'),
      );
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
    const rel = `detect/${name}.mjs`;
    const target = join(project, rel);
    const wanted = routeText(route, name);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    // Untouched files this command may replace: the blank starter, and either route's file.
    const untouched = [
      readFileSync(join(root, 'starter', rel), 'utf8'),
      routeText('write', name),
      routeText('supplied', name),
    ];
    if (current === wanted) continue;
    if (current !== null && !untouched.includes(current))
      stop(
        `Nothing was changed: ${rel} holds your own edits (it is neither the starter nor a route's file), and this command never replaces your work; keep working in it, or make a new project for this route.`,
      );
    plan.push([target, wanted]);
  }
  const extra = join(project, 'detect', 'kind-budget.mjs');
  if (!existsSync(extra))
    plan.push([
      extra,
      readFileSync(
        join(root, 'walkthrough', 'detect', 'kind-budget.mjs'),
        'utf8',
      ),
    ]);
  metadata.unit14_start_route = route;
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
    `Unit 14 ${route} route set up in ${folder}: ${written.length ? `wrote ${written.join(', ')}` : 'every file was already in place'}, left your other files alone (detect/settings.json included), and recorded the route in PROJECT.json (features and detector are now the ${what}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [folder, route] = process.argv.slice(2);
  if (
    !folder ||
    !['write', 'supplied'].includes(route) ||
    process.argv.length !== 4
  )
    stop('Usage: node examples/start-unit14.mjs PROJECT write|supplied');
  start(folder, route);
}
