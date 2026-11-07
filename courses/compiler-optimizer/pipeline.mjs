// Supplied pass orchestration. Learners implement passes and the acceptance policy.
import {clone,digest} from './runtime.mjs';
import {reportFor} from './evidence.mjs';
export const passNames=['scalar','constants','memory','loops'];
export function supported(report) {
  return report.identitiesCurrent===true&&report.proof?.ok===true&&report.validation?.status==='EXHAUSTIVE_WITHIN_DOMAIN'&&report.validation.complete===true&&report.cost?.complete===true&&report.cost.sameWorkload===true&&report.cost.after<report.cost.before;
}
export async function runPipeline(learner,program,inputs,order,{contract={},policy=null,domainEvidence=null}={}) {
  if(!Array.isArray(order)||!order.length||order.length>8||order.some(name=>!passNames.includes(name)))throw new Error('pipeline.order: choose 1..8 supported passes');
  let current=clone(program),events=[];const stages=[];
  for(const [index,name]of order.entries()){
    const before=digest(current);
    try{
      if(typeof learner[name]!=='function')throw new Error(`Missing learner pass: ${name}`);
      const artifact=await learner[name](clone(current),clone(contract));
      const report=reportFor(current,artifact,inputs,{contract});report.domainEvidence=clone(domainEvidence);
      const decision=policy?await policy(clone(report)):{accept:supported(report),reason:'Supplied finite-evidence and unit-cost policy'};
      const adopted=decision?.accept===true&&supported(report);
      if(adopted){current=clone(artifact.program);events.push(...clone(artifact.events));}
      stages.push({index,name,before,selectedAfter:digest(current),adopted,decision,report});
    }catch(error){stages.push({index,name,before,selectedAfter:digest(current),adopted:false,error:error.message});}
  }
  const artifact={program:current,events},report=reportFor(program,artifact,inputs,{contract});report.domainEvidence=clone(domainEvidence);
  const adopted=stages.some(stage=>stage.adopted)&&supported(report);
  return {passed:adopted,adopted,order,stages,report,outputProgram:adopted?current:clone(program)};
}
