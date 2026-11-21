// Shared by the chapter route commands (start-chapter, start-recorder,
// start-debugger, start-query, start-names) and by start-changes. Files are
// written with readFileSync and writeFileSync, which need only read access to
// the source and write access to the project, and every failure ends in one
// plain sentence instead of a stack trace.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A mistake the learner can fix: printed as it is, without "Could not ...".
export class RouteError extends Error {}

// Run a route command; on failure print one sentence and exit with status 1.
export function run(main) {
  try {
    main();
  } catch (error) {
    const said = String(error?.message ?? error).split('\n')[0];
    console.error(
      error instanceof RouteError
        ? said
        : `Could not finish: ${said}. Nothing you wrote was replaced; run the same command again, or check that you can write to the project folder.`,
    );
    process.exit(1);
  }
}

// Copy one course file into the project with plain reads and writes.
export function copyCourseFile(from, to) {
  writeFileSync(to, readFileSync(join(root, from)));
}

// Read a route command's PROJECT ROUTE arguments, or explain the usage.
export function routeArguments(command) {
  const [destination, route] = process.argv.slice(2);
  if (
    !destination ||
    !['write', 'supplied'].includes(route) ||
    process.argv.length !== 4
  )
    throw new RouteError(
      `Usage: node examples/${command} PROJECT write|supplied`,
    );
  return { destination, route, project: resolve(destination) };
}

// An existing debugger part two project: its PROJECT.json path and contents, or
// a sentence saying how to make one.
export function projectFolder(destination, project) {
  const metadataPath = join(project, 'PROJECT.json');
  if (!existsSync(metadataPath))
    throw new RouteError(
      `${destination} is not a project folder. Make one first, for example: node examples/start-chapter.mjs ${destination} supplied`,
    );
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.course !== 'time-travel-debugger-part-two')
    throw new RouteError(`${destination} is not a debugger part two project`);
  return { metadataPath, metadata };
}

// Add a new application's stub to an existing project when it has none; an
// existing file is never replaced. Returns whether the stub was added.
export function addApplication(project, application) {
  const target = join(project, application);
  if (existsSync(target)) return false;
  copyCourseFile(join('starter', application), target);
  return true;
}

// Start one unit in an existing project. The unit's file is written when the
// project has none, or replaced while it is still the untouched stub that
// `node lab.mjs start` made; otherwise nothing changes. The new application's
// stub is added when it is missing and never replaced.
export function startUnit({
  command,
  unit,
  file,
  starter,
  checkpoint,
  application,
}) {
  const { destination, route, project } = routeArguments(command);
  const { metadataPath, metadata } = projectFolder(destination, project);
  const target = join(project, file);
  const stub = readFileSync(join(root, 'starter', file), 'utf8');
  if (existsSync(target) && readFileSync(target, 'utf8') !== stub)
    throw new RouteError(
      `Refusing: ${destination}/${file} is neither missing nor the untouched stub, so it may hold your work. Nothing was changed. Move it aside, or use a new project.`,
    );
  copyCourseFile(route === 'write' ? starter : checkpoint, target);
  const extraNew = addApplication(project, application);
  metadata[`unit${unit}_start_route`] = route;
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  return { destination, route, extraNew };
}
