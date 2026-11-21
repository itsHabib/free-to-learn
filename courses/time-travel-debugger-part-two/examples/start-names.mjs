// Choose lesson 12's starting point in an existing project. It writes names.mjs
// only if the project has none, or if that file is still the untouched stub from
// `node lab.mjs start`, so it never overwrites your work. Lesson 12 also adds to
// debugger.mjs: the supplied route replaces it only while it is still exactly
// lesson 10's supplied checkpoint, and the write route never touches it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root, run, startUnit } from './route.mjs';

run(() => {
  const { destination, route, extraNew } = startUnit({
    command: 'start-names.mjs',
    unit: '12',
    file: 'names.mjs',
    starter: 'starter/names-build.mjs',
    checkpoint: 'examples/names-checkpoint.mjs',
    application: 'next-line.mjs',
  });
  console.log(`Unit 12 initial route: ${route}.`);
  console.log(
    route === 'supplied'
      ? `${destination}/names.mjs is now the supplied names and lines; it passes 12.names and 12.lines.`
      : `${destination}/names.mjs now has the supplied parts and four unfinished regions; 12.names and 12.lines fail until you fill them.`,
  );
  const debuggerPath = join(resolve(destination), 'debugger.mjs');
  const unit10 = readFileSync(join(root, 'examples/debugger-checkpoint.mjs'));
  let current = null;
  try {
    current = readFileSync(debuggerPath);
  } catch {
    // No debugger.mjs: lesson 10 comes first.
  }
  if (route === 'supplied' && current && current.equals(unit10)) {
    writeFileSync(
      debuggerPath,
      readFileSync(join(root, 'examples/stack-checkpoint.mjs')),
    );
    console.log(
      `${destination}/debugger.mjs was exactly lesson 10's supplied checkpoint, so it is now that file with lesson 12's four changes.`,
    );
  } else if (route === 'supplied') {
    console.log(
      current
        ? `${destination}/debugger.mjs differs from lesson 10's supplied checkpoint, so it may hold your work and was left as it was; make lesson 12's four changes in it yourself.`
        : `${destination}/debugger.mjs is missing; lesson 10 makes it first.`,
    );
  } else {
    console.log(
      `${destination}/debugger.mjs was left as it was; lesson 12 shows the four changes to make in it.`,
    );
  }
  console.log(
    extraNew
      ? `${destination}/next-line.mjs is the unfinished new application on both routes.`
      : `${destination}/next-line.mjs already existed and was left as it was.`,
  );
});
