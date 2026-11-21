// Make a new project for one of lesson 12's starting routes. Never replaces existing work.
// node examples/start-chapter.mjs NEW_PROJECT write      the walkthrough's starting files
// node examples/start-chapter.mjs NEW_PROJECT supplied   the unit 12 end checkpoint
// Either route first runs `node lab.mjs init NEW_PROJECT`, which refuses an existing
// folder, then replaces only that fresh project's two unit 12 starter files.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The checkpoint sits in examples/, one folder below the course; a project's server files
// sit two folders below it, so their imports of public/ climb one folder more.
export function intoProject(source) {
  return source.replaceAll("'../public/", "'../../public/");
}

function start(destination, route) {
  const project = resolve(destination);
  const made = spawnSync(
    process.execPath,
    [join(root, 'lab.mjs'), 'init', project],
    {
      encoding: 'utf8',
    },
  );
  if (made.error) throw made.error;
  if (made.status !== 0) {
    process.stdout.write(made.stdout ?? '');
    process.stderr.write(made.stderr ?? '');
    process.exit(made.status ?? 1);
  }
  // Plain reads and writes, so a refusal names the file instead of showing a stack trace.
  try {
    for (const name of ['admission', 'recorder']) {
      const source =
        route === 'write'
          ? readFileSync(
              join(root, 'walkthrough', 'server', `${name}.mjs`),
              'utf8',
            )
          : intoProject(
              readFileSync(
                join(root, 'examples', `${name}-checkpoint.mjs`),
                'utf8',
              ),
            );
      writeFileSync(join(project, 'server', `${name}.mjs`), source);
    }
    writeFileSync(
      join(project, 'server', 'resume.mjs'),
      readFileSync(join(root, 'walkthrough', 'server', 'resume.mjs'), 'utf8'),
    );
    const metadataPath = join(project, 'PROJECT.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    metadata.unit12_start_route = route;
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  } catch (error) {
    console.log(
      `${destination} was made, but the unit 12 route's files could not be written there (${error.code ?? error.message}); check who owns the folder.`,
    );
    process.exit(1);
  }
  console.log(`Created ${destination}. Unit 12 starting route: ${route}.`);
  console.log(
    route === 'write'
      ? 'server/admission.mjs and server/recorder.mjs have eight regions to fill; the unit 12 checks fail until they are.'
      : 'server/admission.mjs and server/recorder.mjs are the unit 12 checkpoint; the unit 12 checks pass.',
  );
  console.log(
    'server/resume.mjs is the new application, unfinished on both routes.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [destination, route] = process.argv.slice(2);
  if (
    !destination ||
    !['write', 'supplied'].includes(route) ||
    process.argv.length !== 4
  )
    throw Error(
      'Usage: node examples/start-chapter.mjs NEW_PROJECT write|supplied',
    );
  start(destination, route);
}
