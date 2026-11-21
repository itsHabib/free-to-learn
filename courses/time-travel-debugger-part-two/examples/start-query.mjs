// Choose lesson 11's starting point in an existing project. It writes
// query.mjs only if the project has none, or if that file is still the
// untouched stub from `node lab.mjs start`, so it never overwrites your work.
import { run, startUnit } from './route.mjs';

run(() => {
  const { destination, route, extraNew } = startUnit({
    command: 'start-query.mjs',
    unit: '11',
    file: 'query.mjs',
    starter: 'starter/query-build.mjs',
    checkpoint: 'examples/query-checkpoint.mjs',
    application: 'value-sources.mjs',
  });
  console.log(`Unit 11 initial route: ${route}.`);
  console.log(
    route === 'supplied'
      ? `${destination}/query.mjs is now the supplied index; with a machine and recorder that pass units 08 and 09 it passes the unit 11 checks.`
      : `${destination}/query.mjs now has the supplied parts and ten unfinished regions; its unit 11 checks fail until you fill them.`,
  );
  console.log(
    extraNew
      ? `${destination}/value-sources.mjs is the unfinished new application on both routes.`
      : `${destination}/value-sources.mjs already existed and was left as it was.`,
  );
});
