// Read the function names of two builds of Lob with your functionNames.
// Usage: node examples/show-names.mjs PROJECT
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const [project] = process.argv.slice(2);
if (!project || process.argv.length !== 3) {
  console.error('Usage: node examples/show-names.mjs PROJECT');
  process.exit(2);
}
const { functionNames } = await import(
  pathToFileURL(join(resolve(project), 'names.mjs')).href
);
const course = fileURLToPath(new URL('..', import.meta.url));

for (const file of ['targets/lob-names.wasm', 'targets/lob.wasm']) {
  const bytes = new Uint8Array(readFileSync(join(course, file)));
  const names = functionNames(bytes);
  const entries = Object.entries(names);
  if (!entries.length) {
    console.log(`${file}: ${bytes.length} bytes, no name section, so {}`);
    continue;
  }
  console.log(`${file}: ${bytes.length} bytes, ${entries.length} names`);
  // Four to a line, each as INDEX NAME.
  for (let k = 0; k < entries.length; k += 4)
    console.log(
      '  ' +
        entries
          .slice(k, k + 4)
          .map(([index, name]) => `${index} ${name}`.padEnd(18))
          .join('')
          .trimEnd(),
    );
}
