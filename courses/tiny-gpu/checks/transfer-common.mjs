// Shared by checks/transfer-N.mjs: loads the learner's own
// project/transfer/N.mjs, a file the lesson asks for and no starter
// holds. Run one with:  node checks/run.mjs project transfer-N
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function learnerFile(ctx, n, fn) {
  const file = join(ctx.project, 'transfer', `${n}.mjs`);
  const shown = `transfer/${n}.mjs`;
  if (!existsSync(file)) {
    throw Error(`${fn}: not written yet (make ${shown} in your project folder, as lesson ${n} asks)`);
  }
  const mod = await import(pathToFileURL(file).href + `?v=${Date.now()}-${Math.random()}`);
  if (typeof mod[fn] !== 'function') {
    return { error: `${shown} must export a function called ${fn}.` };
  }
  return { fn: mod[fn] };
}
