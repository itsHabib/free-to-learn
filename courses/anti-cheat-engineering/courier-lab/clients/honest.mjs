import { pathToFileURL } from 'node:url';
import { parseOptions, runLiveHonest } from './live.mjs';

export { runLiveHonest };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { base } = parseOptions(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(await runLiveHonest(base), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Honest client failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
