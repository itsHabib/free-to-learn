import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const fresh = args[0] === '--fresh';
if (fresh) args.shift();
if (args.length !== 2 || args[0] !== '--assistance' || !args[1]?.trim()) {
  console.error('Record help used: node lab/order/check.mjs --assistance "none" (or describe it).');
  process.exitCode = 2;
} else {
  try {
    const session = JSON.parse(await readFile(join(workspace, 'lab/order/session.json'), 'utf8'));
    if (!session.prepared || session.exercise !== 'courier-order-01') throw new Error('Invalid prepared session.');
    // Verify bytes before importing even the reference verification helper.
    const manifestBytes = await readFile(join(session.referenceRoot, 'lab/order/reference.json'));
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    if (hash(manifestBytes) !== session.referenceManifest) throw new Error('Reference manifest changed since preparation.');
    const manifest = JSON.parse(manifestBytes);
    if (manifest.schema !== 'courier-order-reference-v1') throw new Error('Invalid reference manifest.');
    for (const [path, expected] of Object.entries(manifest.files)) {
      if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid reference path.');
      if (hash(await readFile(join(session.referenceRoot, path))) !== expected) throw new Error(`Trusted reference changed: ${path}`);
    }
    // Execute the judge from the reference, never a workspace-supplied test or fixture.
    const { verifyReference } = await import(pathToFileURL(join(session.referenceRoot, 'lab/trust.mjs')));
    await verifyReference(session.referenceRoot, session.referenceManifest);
    const { checkSubmission } = await import(pathToFileURL(join(session.referenceRoot, 'lab/order/grade.mjs')));
    const result = await checkSubmission({ workspace, session, assistance: args[1], fresh });
    process.exitCode = result.kind === 'submission-refused' ? 2 : result.passed ? 0 : 1;
  } catch (error) {
    console.error(`Submission refused: ${error.message}\nPrepare a workspace from the sealed reference with node lab/order/prepare.mjs.`);
    process.exitCode = 2;
  }
}
