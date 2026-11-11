import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cases } from '../checks/cases.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [command='help', stage='all', ...args]=process.argv.slice(2);
const flags=[stage,...args];
const getFlag=(name,fallback)=> { const i=flags.indexOf(name); return i<0?fallback:flags[i+1]; };
const sourcePath=resolve(root,getFlag('--impl','learner/solution.mjs'));
const assistance=getFlag('--help-used','none-declared');
const sha=text=>createHash('sha256').update(text).digest('hex');

async function commitAttempt(kind, through) {
  const source=await readFile(sourcePath,'utf8');
  const questions=cases.filter(c=>c.module<=through).map(({id,requirement,input})=>({id,requirement,input}));
  const dependencies=['runtime/crypto.mjs','runtime/network.mjs','runtime/capstone.mjs','checks/cases.mjs','tools/lab.mjs','tools/worker.mjs'];
  const runtimeHashes=Object.fromEntries(await Promise.all(dependencies.map(async file=>[file,sha(await readFile(join(root,file)))])));
  const id=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID()}`;
  const folder=join(root,'attempts',id);
  // Fail before importing/executing learner code if its first attempt cannot be saved.
  await mkdir(folder,{recursive:true});
  const record={id,kind,through,createdAt:new Date().toISOString(),sourcePath,sourceHash:sha(source),
    questionHash:sha(JSON.stringify(questions)),questions,runtimeHashes,contractHash:sha(JSON.stringify(runtimeHashes)),
    runtime:{node:process.version,openssl:process.versions.openssl},assistance,status:'committed-before-execution'};
  await writeFile(join(folder,'submission.mjs'),source,{flag:'wx'});
  await writeFile(join(folder,'attempt.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  return {folder,sourceHash:record.sourceHash};
}
async function main() {
  if(command==='help') {
    console.log('Circuit Observatory — offline toy, not Tor-compatible.\n'
      +'node tools/lab.mjs check 1|2|3|4|5|6|all [--help-used hint-1]\n'
      +'node tools/lab.mjs demo\nnode tools/lab.mjs failover\nnode tools/lab.mjs capstone\n'
      +'Edit learner/solution.mjs. Read README.md and lessons/01.md first.'); return;
  }
  if(!['check','demo','failover','capstone'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const through=command==='check'?(stage==='all'?6:Number(stage)):6;
  if(!Number.isInteger(through)||through<1||through>6) throw new Error('Choose a module number 1–6 or all.');
  const {folder,sourceHash}=await commitAttempt(command,through);
  let result;
  try {
    const child=spawnSync(process.execPath,[join(root,'tools/worker.mjs'),sourcePath,sourceHash,command,String(through)],
      {timeout:5000,encoding:'utf8',maxBuffer:512000});
    if(child.error) throw child.error;
    if(child.status!==0) throw new Error(`Worker exited ${child.status}: ${child.stderr.slice(0,1000)}`);
    result=JSON.parse(child.stdout);
  } catch(error) {result={executionFailure:true,code:error.code??error.name,detail:error.message};}
  await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  if(command==='check' && result.results) {
    for(const item of result.results) {
      console.log(`${item.pass?'PASS':'FAIL'} ${item.id}: ${item.requirement}`);
      if(!item.pass) console.log(`  ${item.code}: ${item.detail}\n  Input: ${JSON.stringify(item.input)}\n  Repair: ${item.lesson}`);
    }
    console.log(`${result.passed}/${result.total} requirements pass.`);
  } else console.log(JSON.stringify(result,null,2));
  console.log(`Attempt preserved: ${folder}`);
  if(result.executionFailure || (result.results && result.passed!==result.total)
    || (result.checks && result.checks.passed!==result.checks.total)) process.exitCode=1;
}
main().catch(error=>{console.error(`Cannot run: ${error.message}. Existing attempts are unchanged.`);process.exitCode=2;});
