import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observePackage } from '../integrity/package.mjs';
import { RUNTIME_FILES, SUPPORTED_RELEASES } from '../verified-server.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const release=process.argv[2]??'courier-runtime-1';
if(!SUPPORTED_RELEASES.includes(release)) throw new Error('Choose a declared supported release.');
const files=await observePackage(root,{paths:RUNTIME_FILES});
await mkdir(resolve(root,'trusted'),{recursive:true});
await writeFile(resolve(root,'trusted/runtime-manifest.json'),JSON.stringify({schema:1,packageId:'courier-runtime',release,files},null,2)+'\n');
console.log(`Approved ${files.length} owned runtime files as ${release}. This command changes the trusted reference; run it only after reviewing the package.`);
