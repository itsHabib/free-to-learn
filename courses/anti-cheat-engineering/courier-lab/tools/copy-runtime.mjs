import { cp, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_FILES } from '../verified-server.mjs';

const source=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2];
if(!destination||process.argv.length!==3) throw new Error('Usage: npm run runtime:copy -- new-directory');
const root=resolve(destination);
await mkdir(dirname(root),{recursive:true});
await mkdir(root);
for(const file of RUNTIME_FILES){
  await mkdir(dirname(resolve(root,file)),{recursive:true});
  await copyFile(resolve(source,file),resolve(root,file));
}
await cp(resolve(source,'public'),resolve(root,'public'),{recursive:true,errorOnExist:true,force:false});
console.log(`Copied owned runtime to ${root}. The approved manifest remains in the reference checkout. Edit only this disposable copy for the mismatch experiment.`);
