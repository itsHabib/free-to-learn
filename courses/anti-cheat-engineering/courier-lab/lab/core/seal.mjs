import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashBundle, jsonBytes, readBundle, referenceFiles, REFERENCE_PATH, REFERENCE_SCHEMA } from './trust.mjs';

export async function sealReference(root) {
  const files = await referenceFiles(root);
  const manifest = { schema: REFERENCE_SCHEMA, files: hashBundle(await readBundle(root, files)) };
  await writeFile(join(root, REFERENCE_PATH), jsonBytes(manifest));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const manifest = await sealReference(root);
  console.log(`Sealed ${Object.keys(manifest.files).length} core reference files. Review and commit ${REFERENCE_PATH}.`);
}
