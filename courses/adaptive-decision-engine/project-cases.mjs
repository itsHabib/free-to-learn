import {initial,resolve,legal,botMove,hazard} from './game.mjs';
import {copy,distance,canonical,hash} from './shared.mjs';
export function terminalCase(target){
 let s=initial('terminal-control','pulse','terminal-control');for(let i=0;i<11;i++)s=resolve(s,{kind:'rest'},'rest').state;
 s.health=8;s.charge=12;s.budget=3;s.history.slice(-3).forEach((e,i)=>e.damage=[2,1,0][i]);
 s.targetSchedule=Array.from({length:12},()=>[...target]);s.requestLimit=2;return s;
}
export function terminalChoices(state){
 const score={};
 for(const kind of legal(state)){
  const losses=[];
  for(const bit of [0,1]){
   let seed='terminal-'+bit;while(hazard(seed,state.round)!==bit)seed+='x';
   const next=resolve({...copy(state),seed},{kind},botMove('fixed',state,kind));
   if(next.state.health<=0||next.state.charge<12)throw Error('terminal control is not viability-neutral');
   losses.push(distance(next.event.pressure,state.targetSchedule[state.round]));
  }
  score[kind]=Math.max(...losses);
 }
 const best=Math.min(...Object.values(score));return {scores:score,allowed:Object.keys(score).filter(k=>Math.abs(score[k]-best)<1e-9)};
}
export function projectFingerprint(sources){return hash(Object.fromEntries(Object.entries(sources).filter(([name])=>name.endsWith('.mjs'))));}
export function readProjectPlan(sources){
 let plan;try{plan=JSON.parse(sources['project-plan.json']);}catch{throw Error('Create project-plan.json using API.md; include your source fingerprint and original scenarios.');}
 if(plan.version!==1||plan.sourceHash!==projectFingerprint(sources))throw Error('project plan source fingerprint is missing or stale; current: '+projectFingerprint(sources));
 if(!['rules','selective','collect-more-evidence'].includes(plan.adoption)||typeof plan.rationale!=='string'||!plan.rationale.trim()||typeof plan.limits!=='string'||!plan.limits.trim())throw Error('Record adoption, rationale and limits; argument quality remains a separate rubric judgment.');
 const report=sources['REPORT.md']||'';if(!report.trim()||report.includes('Record your prediction, threshold choices, counterexamples, frozen adoption gates, evidence and remaining alternatives.'))throw Error('Replace the REPORT.md starter with your own evidence account.');
 if(!Array.isArray(plan.scenarios)||plan.scenarios.length<2)throw Error('Create two original scenario contracts.');
 const ids=new Set(),seeds=new Set(),contracts=new Set();
 for(const item of plan.scenarios){
  if(typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.seed!=='string'||!item.seed||seeds.has(item.seed))throw Error('Scenario identities and seeds must be unique.');ids.add(item.id);seeds.add(item.seed);
  if(item.profile!=='pulse'||!Array.isArray(item.targetSchedule)||item.targetSchedule.length!==12||item.targetSchedule.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]>1||p[0]>p[1]))throw Error('Provide twelve valid target intervals.');
  if(!Array.isArray(item.missingRounds)||!item.missingRounds.length||new Set(item.missingRounds).size!==item.missingRounds.length||item.missingRounds.some(n=>!Number.isInteger(n)||n<0||n>11)||!Number.isInteger(item.requestLimit)||item.requestLimit<0||item.requestLimit>2)throw Error('Invalid outage schedule or request allowance.');
  const key=canonical({targetSchedule:item.targetSchedule,missingRounds:item.missingRounds,requestLimit:item.requestLimit});if(contracts.has(key))throw Error('Scenario contracts must differ beyond names/seeds.');contracts.add(key);
 }
 return plan;
}
