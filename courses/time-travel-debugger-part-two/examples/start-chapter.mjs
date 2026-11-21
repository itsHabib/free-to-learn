// Create a fresh project for either chapter route of lesson 08. Never replace
// existing work: an existing path, even an empty folder, is refused.
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  RouteError,
  copyCourseFile,
  root,
  routeArguments,
  run,
} from './route.mjs';

run(() => {
  const { destination, route, project } = routeArguments('start-chapter.mjs');
  let exists = false;
  try {
    lstatSync(project);
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (exists)
    throw new RouteError(
      `Refusing existing path: ${destination}. Choose a new project folder.`,
    );
  const started = spawnSync(
    process.execPath,
    [join(root, 'lab.mjs'), 'start', project],
    { encoding: 'utf8' },
  );
  if (started.error) throw started.error;
  if (started.stderr) process.stderr.write(started.stderr);
  if (started.status !== 0) {
    process.stdout.write(started.stdout ?? '');
    process.exit(started.status ?? 1);
  }
  // lab start created this directory exclusively. Only its fresh Machine stub is replaced.
  copyCourseFile(
    route === 'write'
      ? 'starter/machine-build.mjs'
      : 'examples/machine-checkpoint.mjs',
    join(project, 'machine.mjs'),
  );
  copyCourseFile('starter/run-slice.mjs', join(project, 'run-slice.mjs'));
  const metadataPath = join(project, 'PROJECT.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  metadata.unit08_start_route = route;
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Created ${destination}. Unit 08 initial route: ${route}.`);
  console.log(
    route === 'supplied'
      ? 'The supplied Machine should pass the unit 08 checks; reading and exercises remain.'
      : 'The Machine has six unfinished regions; its initial unit 08 checks should fail.',
  );
  console.log(`Work in ${destination}/machine.mjs.`);
  console.log(
    'The new application remains unfinished in run-slice.mjs on both routes.',
  );
});
