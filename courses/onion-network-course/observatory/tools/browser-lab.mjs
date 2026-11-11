// Offline rehearsal of the actual browser worker bundle. Not browser acceptance.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {executeOffline} from './offline-worker.mjs';
import {requirements} from '../browser/runner.mjs';
import {workshopContract,validateWorkshop} from '../browser/workshop.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [command='check',setting='1',file='learner/browser-solution.js',assistance='none-declared']=process.argv.slice(2);
const sha=value=>createHash('sha256').update(value).digest('hex');
try {
  if(!['check','diagnose','capstone','workshop'].includes(command))throw new Error('Use check, diagnose, capstone or workshop <scenario.json> <browser-source.js> <help-used>.');
  const through=command==='check'?Number(setting):6;
  if(!Number.isInteger(through)||through<1||through>6)throw new Error('Choose a module 1–6.');
  const source=await readFile(resolve(root,file),'utf8'),bundle=await readFile(join(root,'workbench/learner-worker.js'));
  const scenario=command==='workshop'?validateWorkshop(JSON.parse(await readFile(resolve(root,setting),'utf8'))):undefined;
  const request={source,command,through,options:command==='workshop'?{scenario}:command==='diagnose'?{mode:setting}:{}};
  const question=command==='workshop'?{contract:workshopContract,scenario}:command==='check'?requirements.filter(x=>x.module<=through):requirements;
  const id=randomUUID(),folder=join(root,'browser-attempts',id);
  const submission={id,createdAt:new Date().toISOString(),kind:'offline-worker-rehearsal',...request,assistance,
    sourceHash:sha(source),runtimeHash:sha(bundle),questionHash:sha(JSON.stringify(question)),question,
    ...(scenario?{scenarioHash:sha(JSON.stringify(scenario))}:{}),
    node:process.version,browserAcceptance:'NOT_RUN'};
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'submission.json'),JSON.stringify(submission,null,2)+'\n',{flag:'wx'});
  let result;try{result=await executeOffline(request);}catch(error){result={executionFailure:true,detail:error.message};}
  await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({folder,sourceHash:submission.sourceHash,runtimeHash:submission.runtimeHash,result},null,2));
  if(result.executionFailure||(result.checks&&result.checks.passed!==result.checks.total))process.exitCode=1;
}catch(error){console.error(`Not run: ${error.message}`);process.exitCode=2;}
