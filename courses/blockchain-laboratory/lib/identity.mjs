import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sha256} from './support.mjs';

// Positive allowlist: no instructor solutions, QA controls, work or private receipts.
export const learnerFiles=[
  'LICENSE.md','LICENSES/MIT.txt','LICENSES/CC-BY-4.0.txt',
  'README.md','COURSE.md','CONTRACT.md','SOURCES.md','REPORT-TEMPLATE.md','lab.mjs','build.mjs',
  'lib/support.mjs','lib/checks.mjs','lib/simulator.mjs','lib/practice.mjs','lib/identity.mjs',
  'starter/protocol.mjs','starter/vote-guard.mjs','restart.mjs','lib/restart-model.mjs','lib/restart-checks.mjs',
  'reader/style.css','reader/app.js','reader/merkle.svg',
  'lessons/01-bytes.md','lessons/02-transition.md','lessons/03-proof.md','lessons/04-mempool.md',
  'lessons/05-blocks.md','lessons/06-forks.md','lessons/07-quorum.md','lessons/08-recovery.md','lessons/09-restart.md',
].sort();
export async function sourceIdentity(root){
  const files={};for(const name of learnerFiles)files[name]=sha256(await readFile(join(root,name)));
  return {algorithm:'SHA-256',files,hash:sha256(JSON.stringify(files))};
}
