import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { grade } from './checks.mjs';
import { reportFor } from './evidence.mjs';
import { clone } from './runtime.mjs';
import { runPipeline } from './pipeline.mjs';
const [requestPath,resultPath]=process.argv.slice(2);
try {
  const request=JSON.parse(await readFile(requestPath,'utf8'));
  const learner=await import(pathToFileURL(request.modulePath).href);
  if(request.useLearnerPolicy&&typeof learner.decide!=='function')throw new Error('Missing learner evidence policy: decide(report)');
  let result;
  if(request.action==='check'){
    const project=request.projectPath?await import(pathToFileURL(request.projectPath).href):null;
    result=await grade(request.unit,learner,project);
  } else if(request.action==='pipeline'){
    const {program,inputs,contract={},evidence=null}=request.job;
    result=await runPipeline(learner,program,inputs,request.passes,{contract,domainEvidence:evidence,policy:request.useLearnerPolicy?learner.decide:null});
  } else {
    const {program,inputs,contract={}}=request.job;
    if(!['scalar','constants','memory','loops'].includes(request.pass))throw new Error('Unknown pass');
    const artifact=await learner[request.pass](clone(program),clone(contract));
    const report=reportFor(program,artifact,inputs,{contract});
    report.domainEvidence=request.job.evidence??null;
    const decision=request.useLearnerPolicy?await learner.decide(clone(report)):{accept:report.proof.ok&&report.validation.status==='EXHAUSTIVE_WITHIN_DOMAIN'&&report.cost.complete&&report.cost.after<report.cost.before,reason:'Supplied finite-evidence and unit-cost policy'};
    // Product safety checks do not trust a learner policy to override proof/behavior.
    const adopt=decision?.accept===true&&report.proof.ok&&report.validation.status==='EXHAUSTIVE_WITHIN_DOMAIN'&&report.cost.complete&&report.cost.sameWorkload&&report.cost.after<report.cost.before;
    result={passed:adopt,decision,adopted:adopt,report,outputProgram:adopt?artifact.program:program};
  }
  await writeFile(resultPath,JSON.stringify(result,null,2),'utf8');
} catch(error){await writeFile(resultPath,JSON.stringify({passed:false,error:error.message},null,2),'utf8');process.exitCode=1;}
