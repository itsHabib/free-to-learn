import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function executionIdentity() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const files = ['checks.mjs', 'runtime/base.mjs', 'runtime/plans.mjs', 'runtime/scenario.mjs', 'runtime/foundation.mjs', 'runtime/disk.mjs'];
  return sha256(JSON.stringify(files.map(path => [path, sha256(readFileSync(join(root, path)))])));
}
