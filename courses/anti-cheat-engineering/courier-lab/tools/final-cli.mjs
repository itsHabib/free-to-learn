import { dirname, basename, resolve } from 'node:path';
import { regularFile, saveJson } from '../lab/core/trust.mjs';
import { runTrial } from '../recovery/runtime.mjs';
import { investigations, runInvestigation } from '../timing/runtime.mjs';
import { withRepairServer } from '../capstone/server.mjs';
import { session, submit } from '../capstone/client.mjs';
const [action,sourcePath,output]=process.argv.slice(2);
try {
 if(!['recovery','timing','capstone'].includes(action)||!output)throw new Error('Usage: final-cli.mjs <recovery|timing|capstone> <policy.mjs|reference> <new-output.json>');
 let candidate;
 if(action!=='timing'){
  const path=resolve(sourcePath);const source=await regularFile(dirname(path),basename(path));
  candidate=await import(`data:text/javascript;base64,${source.toString('base64')}`);
 }
 let report;
 if(action==='recovery')report=await runTrial(candidate);
 if(action==='timing')report=investigations().map(item=>({name:item.name,...runInvestigation(item.record)}));
 if(action==='capstone' && typeof candidate.repair!=='function')throw new Error('Policy must export repair; no reference fallback is used.');
 if(action==='capstone')report=await withRepairServer(async server=>{
  const actor=await session(server.base);
  server.moveActor(actor.id,{x:400,y:0});
  const request={requestId:'repair-1',stationId:'alpha'};
  const first=await submit(server.base,actor.token,request);
  server.moveActor(actor.id,{x:9000,y:9000});
  const retry=await submit(server.base,actor.token,request);
  const distant=await submit(server.base,actor.token,{...request,requestId:'repair-2'});
  return {schema:1,first,retry,distant,trace:server.record(),limit:'Actual local HTTP requests; no production security claim.'};
 },{policy:candidate.repair});
 await saveJson(resolve(output),report);console.log(`Saved ${action} evidence to ${resolve(output)}`);
}catch(error){console.error(`Experiment refused: ${error.message}`);process.exitCode=2;}
