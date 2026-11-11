import { realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { observePackage } from './integrity/package.mjs';
import { checkPackage } from './integrity/policy.mjs';
import { readJsonFile } from './tools/read-json.mjs';

// This launcher/observer and the approval process are the local trust anchor.
// The inventory is independent of the manifest being checked.
export const RUNTIME_FILES = Object.freeze([
  'server.mjs', 'engine.mjs', 'admission.mjs', 'defense.mjs', 'protocol.mjs', 'clock.mjs',
  'telemetry/runtime.mjs', 'telemetry/policy.mjs',
  'learning/service.mjs', 'learning/runtime.mjs', 'learning/grade.mjs',
]);
const ROOT = dirname(fileURLToPath(import.meta.url));
export const SUPPORTED_RELEASES = Object.freeze(['courier-runtime-1', 'courier-runtime-2']);

export async function checkLaunch({ root = ROOT, manifestPath = resolve(ROOT, 'trusted/runtime-manifest.json'), policy = { checkPackage } } = {}) {
  const manifest = await readJsonFile(manifestPath,{maxBytes:64*1024});
  const observed = await observePackage(await realpath(root), { paths: RUNTIME_FILES });
  return { result: await policy.checkPackage({manifest,observed,supported:[...SUPPORTED_RELEASES]}), manifest, observed };
}

async function main() {
  const args = process.argv.slice(2);
  const serverArgs = [];
  let root=ROOT;
  let manifestPath=resolve(ROOT,'trusted/runtime-manifest.json');
  let policy={checkPackage};
  for(let i=0;i<args.length;i+=1){
    const flag=args[i];
    if(flag==='--package-root'||flag==='--manifest'||flag==='--policy'){
      const value=args[++i];
      if(!value) throw new Error(`${flag} needs a path.`);
      if(flag==='--package-root') root=resolve(value);
      if(flag==='--manifest') manifestPath=resolve(value);
      if(flag==='--policy') policy=await import(pathToFileURL(resolve(value)));
      continue;
    }
    serverArgs.push(flag);
  }
  root=await realpath(root);
  const {result,manifest,observed}=await checkLaunch({root,manifestPath,policy});
  if(result?.ok!==true) throw new Error(`Runtime refused: ${result?.reason??'invalid policy result'}`);
  process.stdout.write(JSON.stringify({type:'verified',release:manifest.release,files:observed.length})+'\n');
  process.argv=[process.argv[0],resolve(root,'server.mjs'),...serverArgs];
  await import(pathToFileURL(resolve(root,'server.mjs')));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch((error)=>{process.stderr.write(`Verified startup failed: ${error.message}\n`);process.exitCode=1;});
}
