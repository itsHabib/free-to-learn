import {readFile,writeFile,mkdir,copyFile,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {sha256} from './lib/support.mjs';
import {sourceIdentity} from './lib/identity.mjs';
import {runRestartChecks} from './lib/restart-checks.mjs';
import {restartIncident,sendBeforePersist} from './lib/restart-model.mjs';
import {runChecks} from './lib/checks.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const work=join(root,'work');
const [command,arg,...rest]=process.argv.slice(2);

async function main() {
  if(command==='start' && !arg) {
    await mkdir(work,{recursive:true});
    try {await copyFile(join(root,'starter/vote-guard.mjs'),join(work,'vote-guard.mjs'),constants.COPYFILE_EXCL);}
    catch(error) {if(error.code==='EEXIST') throw new Error('Work already exists; start refused to overwrite work/vote-guard.mjs.');throw error;}
    console.log('Created work/vote-guard.mjs. Read node lab.mjs lesson 09, then run node restart.mjs check. The starter must fail.');return;
  }
  if(!['check','simulate'].includes(command)) {
    console.log('Commands: node restart.mjs start | check | simulate crash | simulate rollback');return;
  }
  if(rest.length || (command==='check' && arg) || (command==='simulate' && !['crash','rollback'].includes(arg))) throw new Error('Use check, simulate crash, or simulate rollback.');
  const id=new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8);
  const directory=join(work,'restart-attempts',id);
  const files=command==='check'?['vote-guard.mjs']:['vote-guard.mjs','protocol.mjs'];
  const sources={};
  for(const name of files) sources[name]=await readFile(join(work,name),'utf8');
  await mkdir(directory,{recursive:true});
  for(const [name,source] of Object.entries(sources)) await writeFile(join(directory,name),source,{flag:'wx'});
  const receipt={id,command,scenario:arg??null,startedAt:new Date().toISOString(),runtime:process.version,
    assistance:process.env.LAB_ASSISTANCE??'not declared',
    sourceHashes:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,sha256(source)])),
    courseIdentity:await sourceIdentity(root),status:'started'};
  await writeFile(join(directory,'submission.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  const temporary=[];
  async function load(name) {
    // Import the snapshotted bytes beside learner work, preserving ../lib imports.
    const path=join(work,`.restart-${id}-${name}`);temporary.push(path);
    await writeFile(path,sources[name],{flag:'wx'});return import(pathToFileURL(path).href);
  }
  let result;
  try {
    const guard=await load('vote-guard.mjs');
    if(command==='check') {
      result=runRestartChecks(guard.planVote);
      if(result.passed!==result.total) process.exitCode=1;
    }
    if(command==='simulate') {
      const p=await load('protocol.mjs');
      const prerequisites=await runChecks(p,'07');
      if(prerequisites.passed!==prerequisites.total) {
        result={blocked:'Pass module 07 before interpreting certificate results.',prerequisites};process.exitCode=1;
      }
      if(prerequisites.passed===prerequisites.total) {
        result={prerequisites,learner:restartIncident(guard.planVote,p.verifyCertificate,{rollback:arg==='rollback',transfer:arg==='rollback'})};
        if(arg==='crash') result.sendBeforePersistControl=restartIncident(sendBeforePersist,p.verifyCertificate);
        result.interpretation=arg==='rollback'?
          'An erased committed journal is outside the crash-only guarantee. Even the correct guard can double-sign after rollback; the fault bound must count that signer.':
          'Compare your ordered effects with the deliberately unsafe control. Inspect certificates and identities; command completion is not a safety verdict.';
      }
    }
  } catch(error) {result={executionError:error.message};process.exitCode=2;}
  finally {for(const path of temporary) await unlink(path).catch(()=>{});}
  const finished={...receipt,status:'finished',finishedAt:new Date().toISOString(),result};
  await writeFile(join(directory,'result.json'),JSON.stringify(finished,null,2),{flag:'wx'});
  console.log(JSON.stringify(finished,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=2;});
