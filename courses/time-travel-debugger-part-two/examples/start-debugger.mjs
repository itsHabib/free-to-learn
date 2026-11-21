// Choose lesson 10's starting point in an existing project. It writes
// debugger.mjs only if the project has none, or if that file is still the
// untouched stub from `node lab.mjs start`, so it never overwrites your work.
import { run, startUnit } from './route.mjs';

run(() => {
  const { destination, route, extraNew } = startUnit({
    command: 'start-debugger.mjs',
    unit: '10',
    file: 'debugger.mjs',
    starter: 'starter/debugger-build.mjs',
    checkpoint: 'examples/debugger-checkpoint.mjs',
    application: 'reverse-find.mjs',
  });
  console.log(`Unit 10 initial route: ${route}.`);
  console.log(
    route === 'supplied'
      ? `${destination}/debugger.mjs is now the supplied debugger; with a machine and recorder that pass units 08 and 09 it passes the unit 10 checks.`
      : `${destination}/debugger.mjs now has the supplied parts and eight unfinished regions; its unit 10 checks fail until you fill them.`,
  );
  console.log(
    extraNew
      ? `${destination}/reverse-find.mjs is the unfinished new application on both routes.`
      : `${destination}/reverse-find.mjs already existed and was left as it was.`,
  );
});
