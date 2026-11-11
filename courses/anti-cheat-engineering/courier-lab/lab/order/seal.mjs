import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBundle, readBundle, sha256 } from '../trust.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixed = ['server.mjs', 'engine.mjs', 'admission.mjs', 'protocol.mjs', 'clock.mjs', 'defense.mjs',
  'clients/http-client.mjs', 'clients/scenarios.mjs', 'clients/schedules.mjs', 'tests/harness.mjs',
  'tests/proximity.test.mjs', 'telemetry/runtime.mjs', 'learning/service.mjs', 'learning/runtime.mjs', 'learning/grade.mjs', 'lab/trust.mjs', 'lab/reference-snapshot.mjs', 'lab/spatial-reporter.mjs', 'lab/check.mjs', 'lab/prepare.mjs', 'lab/core/predictions.mjs', 'lab/reference.json',
  'lab/prompt.json', 'lab/feedback.mjs', 'lab/response-template.md', 'lab/LEARNER.md', 'package.json'];
async function filesBelow(relative) {
  const result = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative + '/' + entry.name;
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    if (entry.isFile() && path !== 'lab/order/reference.json') result.push(path);
  }
  return result;
}
// Keep the spatial exercise's guard pin current as part of the reviewed seal.
const legacy = JSON.parse(await readFile(join(root, 'lab/reference.json'), 'utf8'));
legacy.sha256 = sha256(await readFile(join(root, 'defense.mjs')));
await writeFile(join(root, 'lab/reference.json'), JSON.stringify(legacy, null, 2) + '\n');
const files = [...new Set([...fixed, ...await filesBelow('public'), ...await filesBelow('lab/order'), ...await filesBelow('author/order'), ...await filesBelow('learning-support').catch((error) => { if (error.code === 'ENOENT') return []; throw error; })])].sort();
const manifest = { schema: 'courier-order-reference-v1', files: hashBundle(await readBundle(root, files)) };
await writeFile(join(root, 'lab/order/reference.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Sealed ${files.length} runtime, helper, judge and template files. Review and commit lab/reference.json and lab/order/reference.json.`);
