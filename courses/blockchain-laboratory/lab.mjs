import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sha256 } from './lib/support.mjs';
import { runChecks } from './lib/checks.mjs';
import { simulate, replayScenario } from './lib/simulator.mjs';
import { items } from './lib/practice.mjs';
import { sourceIdentity } from './lib/identity.mjs';

const root=dirname(fileURLToPath(import.meta.url)),work=join(root,'work');
const [command,arg,...rest]=process.argv.slice(2);
const read=path=>readFile(join(root,path),'utf8');
const fail=message=>{throw new Error(message);};
const validModule=x=>/^(0[1-8])$/.test(x);
async function beginAttempt(kind,scope,{code=true,submission=null}={}){
  const source=code?await read('work/protocol.mjs'):null;
  const stamp=new Date().toISOString().replaceAll(':','-'),id=`${stamp}-${randomUUID().slice(0,8)}`;
  const directory=join(work,'attempts',id);await mkdir(directory,{recursive:true});
  // Save before importing or executing learner code. A failure here prevents the run.
  if(code)await writeFile(join(directory,'protocol.mjs'),source,{flag:'wx'});
  const receipt={id,kind,scope,startedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,
    sourceHash:code?sha256(source):null,courseIdentity:await sourceIdentity(root),submission,status:'started',assistance:process.env.LAB_ASSISTANCE??'not declared'};
  await writeFile(join(directory,'submission.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  return {directory,receipt,source};
}
async function finish(attempt,result){
  const receipt={...attempt.receipt,finishedAt:new Date().toISOString(),status:'finished',result};
  await writeFile(join(attempt.directory,'result.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  console.log(JSON.stringify(receipt,null,2));
}
async function loadProtocol(attempt){
  // Execute the exact saved bytes while retaining relative imports into supplied lib/.
  // The snapshot copy lives two levels deeper, so import a source-bound sibling temp module.
  // Only the user's own local code is intended here; this runner is not a security sandbox.
  const target=join(work,`.run-${attempt.receipt.id}.mjs`);
  await writeFile(target,attempt.source,{flag:'wx'});
  return import(pathToFileURL(target).href);
}

async function main(){
  if(command==='start'){
    await mkdir(work,{recursive:true});
    try{await copyFile(join(root,'starter/protocol.mjs'),join(work,'protocol.mjs'),constants.COPYFILE_EXCL);}
    catch(e){if(e.code==='EEXIST')fail('Work already exists; start refused to overwrite work/protocol.mjs. Continue with lesson or check.');throw e;}
    console.log('Created work/protocol.mjs. Run node lab.mjs lesson 01, then node lab.mjs check 01. The starter is intentionally incomplete.');return;
  }
  if(command==='lesson'){
    if(!validModule(arg)&&arg!=='09')fail('Use lesson 01 through lesson 09');
    const name=(await readdir(join(root,'lessons'))).find(n=>n.startsWith(arg+'-'));
    console.log((await read('lessons/'+name)).replace('{{diagram:merkle}}','[Optional diagram: reader/merkle.svg. The full path is described in the text above.]'));return;
  }
  if(command==='practice'){
    const item=items.find(x=>x.id===arg);if(!item)fail('Use a practice ID such as 01a; IDs appear in each lesson.');
    const answer=rest[0];if(answer===undefined){console.log(item.question);item.options.forEach((x,i)=>console.log(`${i+1}. ${x}`));return;}
    const choice=Number(answer)-1;if(!Number.isInteger(choice)||choice<0||choice>=item.options.length)fail('Choice must be a listed option number; no attempt recorded.');
    const attempt=await beginAttempt('practice',arg,{code:false,submission:{question:item.question,options:item.options,choice:choice+1}});
    await finish(attempt,{ok:choice===item.answer,chosen:item.options[choice],correct:item.options[item.answer],reason:item.feedback[choice],assessment:'Practice only; not a mastery claim.'});return;
  }
  if(command==='check'||command==='simulate'||command==='replay'){
    if(command==='check' && arg==='09')fail('Module 09 uses separate work/vote-guard.mjs: run node restart.mjs start, then node restart.mjs check.');
    if(command==='check' && arg!=='all'&&!validModule(arg))fail('Use check 01 through 08, or check all');
    if(command==='simulate'&&!['partition','transfer'].includes(arg))fail('Use simulate partition or simulate transfer');
    if(command==='replay'&&!arg)fail('Use replay path/to/result.json from a prior simulation');
    const attempt=await beginAttempt(command,arg);
    try{
      const p=await loadProtocol(attempt);
      let result;
      if(command==='check')result=await runChecks(p,arg);
      else if(command==='simulate')result=simulate(p,arg);
      else {const receipt=JSON.parse(await readFile(resolve(arg),'utf8'));result=replayScenario(p,receipt.result?.scenario??receipt.scenario??receipt);}
      await finish(attempt,result);if(command==='check'&&result.passed!==result.total)process.exitCode=1;
    }catch(error){await finish(attempt,{executionError:error.message});process.exitCode=2;}
    return;
  }
  if(command==='status'){
    let names=[];try{names=await readdir(join(work,'attempts'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const current=await read('work/protocol.mjs').then(sha256).catch(()=>null);
    const currentCourse=(await sourceIdentity(root)).hash;
    for(const name of names.sort()){
      try{const r=JSON.parse(await read(`work/attempts/${name}/result.json`));const fresh=r.sourceHash===current&&r.courseIdentity.hash===currentCourse;console.log(`${r.id} ${r.kind} ${r.scope} ${fresh?'CURRENT SOURCE + COURSE':'historical or practice'} ${r.result.passed??''}/${r.result.total??''} ${r.result.executionError??''}`);}
      catch(e){console.log(`${name} incomplete receipt; inspect submission.json`);}
    }
    if(!names.length)console.log('No attempts recorded.');return;
  }
  console.log('Commands: start | lesson 01..09 | practice 01a [option] | check 01..08|all | simulate partition|transfer | replay receipt.json | status. Optional module 09: node restart.mjs start|check|simulate crash|simulate rollback');
}
main().catch(error=>{console.error(error.message);process.exitCode=2;});
