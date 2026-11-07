#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, copyFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { digest, run, verify } from './runtime.mjs';
import { parseJSON } from './json.mjs';
import * as C from './cases.mjs';
import { normalizeJob } from './domains.mjs';
const root=dirname(fileURLToPath(import.meta.url)),execute=promisify(execFile);
const support=['runtime.mjs','editor.mjs','evidence.mjs','investigation.mjs'];
async function exists(path){try{await access(path);return true;}catch{return false;}}
async function identity(){const manifest=parseJSON(await readFile(join(root,'course.json'),'utf8'));const files={};for(const name of manifest.publicFiles)files[name]=await readFile(join(root,name),'utf8');return digest(files);}
async function initialize(work){await mkdir(work);await mkdir(join(work,'support'));await copyFile(join(root,'starter.mjs'),join(work,'optimizer.mjs'));for(const name of support)await copyFile(join(root,name),join(work,'support',name));await mkdir(join(work,'.attempts'));}
async function source(work){const files={'optimizer.mjs':await readFile(join(work,'optimizer.mjs'),'utf8')};for(const name of support)files[`support/${name}`]=await readFile(join(work,'support',name),'utf8');if(await exists(join(work,'project.mjs')))files['project.mjs']=await readFile(join(work,'project.mjs'),'utf8');return files;}
async function saveFiles(folder,files){await mkdir(join(folder,'support'),{recursive:true});for(const [name,text]of Object.entries(files))await writeFile(join(folder,name),text,{flag:'wx'});}
async function attempt(work,request,help){
  const files=await source(work),courseIdentity=await identity(),sourceIdentity=digest(files);
  const id=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`,folder=join(work,'.attempts',id);
  await mkdir(folder,{recursive:true});await saveFiles(join(folder,'snapshot'),files);
  const questionText=request.action==='check'?await readFile(join(root,'lessons',`${String(request.unit).padStart(2,'0')}.md`),'utf8'):JSON.stringify(request.job);
  const saved={...request,id,createdAt:new Date().toISOString(),courseIdentity,sourceIdentity,questionText,helpUsed:help??'not declared',modulePath:join(folder,'snapshot','optimizer.mjs'),projectPath:files['project.mjs']?join(folder,'snapshot','project.mjs'):null};
  await writeFile(join(folder,'request.json'),JSON.stringify(saved,null,2),{flag:'wx'});
  let processError=null;
  try{await execute(process.execPath,[join(root,'worker.mjs'),join(folder,'request.json'),join(folder,'result.json')],{timeout:8000,maxBuffer:1024*1024});}catch(error){processError={message:error.message,killed:error.killed===true};}
  let result;
  if(await exists(join(folder,'result.json')))result=parseJSON(await readFile(join(folder,'result.json'),'utf8'),{maxBytes:16*1024*1024,maxNodes:500000});
  else{result={passed:false,error:processError?.killed?'Execution timed out; this is not a semantic result':processError?.message??'Worker produced no result'};await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});}
  const receipt={id,courseIdentity,sourceIdentity,questionText,sourceFiles:files,helpUsed:saved.helpUsed,result,processError};
  await writeFile(join(folder,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  return receipt;
}
function example(name){
  if(name==='scalar')return {program:C.scalarKernel(),domain:{version:1,axes:[{parameter:'x',range:{from:'0',to:'255',step:'1'}}],heaps:[{}]},contract:{}};
  if(name==='branch')return {program:C.diamond(true),inputs:[C.emptyInput({})],contract:{}};
  if(name==='memory')return {program:C.memoryKernel(),inputs:[C.memoryInput(false)],contract:{distinct:[['p','q']]}};
  if(name==='loop')return {program:C.loopKernel(),inputs:[0,1,3,5].map(n=>C.loopInput(String(n))),contract:{offsets:{p:'0'},minLengths:{p:1}}};
  if(name==='transfer')return {program:C.transferKernel(),inputs:[C.emptyInput({sample:'0',bias:'0'})],contract:{}};
  throw new Error('Example must be scalar, branch, memory, loop, or transfer');
}
async function history(work){const folder=join(work,'.attempts'),restored=join(work,'restored-history.json');const results=await exists(restored)?parseJSON(await readFile(restored,'utf8'),{maxBytes:16*1024*1024,maxNodes:500000}):[];if(!await exists(folder))return results;for(const name of (await readdir(folder)).sort()){const path=join(folder,name,'receipt.json');if(await exists(path))results.push(parseJSON(await readFile(path,'utf8'),{maxBytes:16*1024*1024,maxNodes:500000}));}return results;}
async function main(){
  const args=process.argv.slice(2),command=args.shift();
  if(command==='start'){const work=resolve(args[0]??'work');await initialize(work);console.log(`Created ${work}\nEdit optimizer.mjs. Start with: node cli.mjs check 01 ${work} --help-used none`);return;}
  if(command==='lesson'){const n=String(Number(args[0])).padStart(2,'0');if(!/^0[1-9]$/.test(n))throw new Error('Lesson must be 01..09');console.log(await readFile(join(root,'lessons',`${n}.md`),'utf8'));return;}
  if(command==='question'||command==='answer'){
    const bank=parseJSON(await readFile(join(root,'practice.json'),'utf8')),item=bank.items.find(i=>i.id===args[0]);if(!item)throw new Error('Use an item ID such as 01a or 01b');
    const question={id:item.id,prompt:item.prompt,choices:item.choices};
    if(command==='question'){console.log(JSON.stringify(question,null,2));return;}
    const work=resolve(args[1]??'work'),choice=args[2];if(!Object.hasOwn(item.choices,choice))throw new Error('Choose one of the listed letters');
    const files=await source(work),id=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`,folder=join(work,'.attempts',id),helpAt=args.indexOf('--help-used');await mkdir(folder,{recursive:true});
    const request={id,question,choice,helpUsed:helpAt>=0?args[helpAt+1]:'not declared',courseIdentity:await identity(),sourceIdentity:digest(files),sourceFiles:files};
    await writeFile(join(folder,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});
    const result={unit:item.unit,item:item.id,passed:choice===item.correct,committed:choice,correct:item.correct,reason:item.why,next:item.next};
    await writeFile(join(folder,'receipt.json'),JSON.stringify({...request,result},null,2),{flag:'wx'});console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;return;
  }
  if(command==='example'){const job=example(args[0]);if(args[1]){await writeFile(resolve(args[1]),JSON.stringify(job,null,2),{flag:'wx'});console.log(resolve(args[1]));}else console.log(JSON.stringify(job,null,2));return;}
  if(command==='run'){const job=normalizeJob(parseJSON(await readFile(resolve(args[0]),'utf8')));console.log(JSON.stringify({validity:verify(job.program),domain:job.evidence,results:job.inputs.map(input=>run(job.program,input,{contract:job.contract??{}}))},null,2));return;}
  if(command==='check'){
    const unit=Number(args[0]),work=resolve(args[1]??'work'),helpAt=args.indexOf('--help-used');if(!Number.isInteger(unit)||unit<1||unit>9)throw new Error('Check one unit 01..09');
    const receipt=await attempt(work,{action:'check',unit},helpAt>=0?args[helpAt+1]:undefined);console.log(JSON.stringify({id:receipt.id,courseIdentity:receipt.courseIdentity,sourceIdentity:receipt.sourceIdentity,result:receipt.result},null,2));process.exitCode=receipt.result.error?3:receipt.result.passed?0:1;return;
  }
  if(command==='optimize'||command==='pipeline'){
    const work=resolve(args[0]),job=normalizeJob(parseJSON(await readFile(resolve(args[1]),'utf8'))),pass=args[2]??'scalar',helpAt=args.indexOf('--help-used');
    const receipt=await attempt(work,{action:command,job,pass,passes:pass.split(','),useLearnerPolicy:args.includes('--learner-policy')},helpAt>=0?args[helpAt+1]:undefined);console.log(JSON.stringify({id:receipt.id,result:receipt.result},null,2));process.exitCode=receipt.result.error?3:receipt.result.passed?0:1;return;
  }
  if(command==='status'){const work=resolve(args[0]??'work'),currentSource=digest(await source(work)),currentCourse=await identity();console.log(JSON.stringify((await history(work)).map(r=>({id:r.id,passed:r.result.passed,unit:r.result.unit,current:r.sourceIdentity===currentSource&&r.courseIdentity===currentCourse,helpUsed:r.helpUsed})),null,2));return;}
  if(command==='export'){const work=resolve(args[0]),target=resolve(args[1]);const files=await source(work),receipts=await history(work),payload={format:'optimizer-work/1',courseIdentity:await identity(),files,sourceIdentity:digest(files),receipts};const text=JSON.stringify(payload,null,2);if(Buffer.byteLength(text)>16*1024*1024)throw new Error('Export exceeds 16 MiB; existing work remains unchanged');parseJSON(text,{maxBytes:16*1024*1024,maxNodes:500000});await writeFile(target,text,{flag:'wx'});console.log(`Exported exact work and ${receipts.length} immutable receipts to ${target}`);return;}
  if(command==='restore'){
    const saved=parseJSON(await readFile(resolve(args[0]),'utf8'),{maxBytes:16*1024*1024,maxNodes:500000}),target=resolve(args[1]);
    if(saved.format!=='optimizer-work/1'||saved.courseIdentity!==await identity()||saved.sourceIdentity!==digest(saved.files))throw new Error('Invalid or different-course export; keep it and use the matching course package');
    const allowed=['optimizer.mjs','project.mjs',...support.map(n=>`support/${n}`)];if(!saved.files||typeof saved.files!=='object'||Array.isArray(saved.files)||Object.entries(saved.files).some(([n,v])=>!allowed.includes(n)||typeof v!=='string')||allowed.filter(n=>n!=='project.mjs').some(n=>typeof saved.files[n]!=='string')||!Array.isArray(saved.receipts))throw new Error('Malformed export');
    for(const receipt of saved.receipts)if(!receipt||typeof receipt.id!=='string'||typeof receipt.courseIdentity!=='string'||typeof receipt.sourceIdentity!=='string'||!receipt.sourceFiles||digest(receipt.sourceFiles)!==receipt.sourceIdentity||!receipt.result||typeof receipt.result.passed!=='boolean')throw new Error('Malformed or mismatched historical receipt');
    await mkdir(target);await saveFiles(target,saved.files);await mkdir(join(target,'.attempts'));
    await writeFile(join(target,'restored-history.json'),JSON.stringify(saved.receipts,null,2),{flag:'wx'});
    console.log(`Restored into ${target}; prior receipt history is preserved in restored-history.json. New attempts remain separate.`);return;
  }
  console.log('Commands: start WORK | lesson 01 | question 01a | answer 01a WORK LETTER --help-used none | check 01 WORK --help-used none | example scalar JOB.json | run JOB.json | optimize WORK JOB.json scalar | pipeline WORK JOB.json scalar,constants | status WORK | export WORK FILE.json | restore FILE.json NEW_WORK');
}
main().catch(error=>{console.error(error.message);process.exitCode=2;});
