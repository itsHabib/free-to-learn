// Add lesson 13's new application to an existing project. Lesson 13 writes
// nothing else new, so this has no route and records none: it copies
// starter/changes.mjs to PROJECT/changes.mjs only when the project has no
// changes.mjs, and never replaces one.
import { resolve } from 'node:path';
import { RouteError, addApplication, projectFolder, run } from './route.mjs';

run(() => {
  const [destination] = process.argv.slice(2);
  if (!destination || process.argv.length !== 3)
    throw new RouteError('Usage: node examples/start-changes.mjs PROJECT');
  const project = resolve(destination);
  projectFolder(destination, project);
  console.log(
    addApplication(project, 'changes.mjs')
      ? `${destination}/changes.mjs is now the unfinished new application, copied from starter/changes.mjs.`
      : `${destination}/changes.mjs already existed and was left as it was.`,
  );
});
