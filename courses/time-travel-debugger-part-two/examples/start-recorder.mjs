// Choose lesson 09's starting point in an existing project. It writes
// recorder.mjs only if the project has none, or if that file is still the
// untouched stub from `node lab.mjs start`, so it never overwrites your work.
import { run, startUnit } from './route.mjs';

run(() => {
  const { destination, route, extraNew } = startUnit({
    command: 'start-recorder.mjs',
    unit: '09',
    file: 'recorder.mjs',
    starter: 'starter/recorder-build.mjs',
    checkpoint: 'examples/recorder-checkpoint.mjs',
    application: 'trim.mjs',
  });
  console.log(`Unit 09 initial route: ${route}.`);
  console.log(
    route === 'supplied'
      ? `${destination}/recorder.mjs is now the supplied recorder; with a machine that passes unit 08 it passes the unit 09 checks.`
      : `${destination}/recorder.mjs now has the supplied parts and six unfinished regions; its unit 09 checks fail until you fill them.`,
  );
  console.log(
    extraNew
      ? `${destination}/trim.mjs is the unfinished new application on both routes.`
      : `${destination}/trim.mjs already existed and was left as it was.`,
  );
});
