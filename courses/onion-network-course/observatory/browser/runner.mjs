import {seal,open,context,requireThat,LabError} from './crypto.mjs';
import {directory,establish,exchange,deliverForward,deliverBackward,archive,tamper,recover,views} from './network.mjs';
import {evaluate,cases} from './cases.mjs';
import {runWorkshop} from './workshop.mjs';

const functionNames=['selectPath','wrapRequest','peelForward','addReturnLayer','unwrapReply','acceptSequence','recoveryPlan','correlate'];
export function compileLearner(source) {
  requireThat(typeof source==='string'&&source.length>0&&source.length<=100000,'BAD_SOURCE','Use a nonempty project under 100,000 characters.');
  // Executed only inside the disposable worker, never in the document's global scope.
  const compile=new Function('seal','open','context','requireThat','LabError',
    '"use strict";\n'+source+'\nreturn {'+functionNames.map(n=>`${n}:typeof ${n}==="function"?${n}:undefined`).join(',')+'};');
  const implementation=compile(seal,open,context,requireThat,LabError);
  for(const name of functionNames)requireThat(typeof implementation[name]==='function','MISSING_FUNCTION',`Define ${name} using the browser starter.`);
  return implementation;
}
async function observed(action) {
  try{return {outcome:'returned',value:await action()};}
  catch(error){return {outcome:'threw',code:error.code??error.name,detail:error.message};}
}
export async function diagnose(impl,options={}) {
  const mode=options.mode??'round-trip',item=options.item??'luna',length=Number(options.length??3);
  requireThat(['round-trip','tamper','replay','wrong-request','failed-hop','lost-reply'].includes(mode),'BAD_SCENARIO');
  requireThat(['luna','tide'].includes(item)&&[2,3,4].includes(length),'BAD_SCENARIO');
  const path=await impl.selectPath(directory(),[],length),circuit=establish(path);
  const request={operation:'lookup',item},events=[];let replacement=null;
  if(mode==='round-trip'||mode==='lost-reply') {
    events.push({action:mode,...await observed(()=>exchange(impl,circuit,request,{dropReply:mode==='lost-reply'}))});
  }else if(mode==='failed-hop') {
    events.push({action:'send through failed middle relay',...await observed(()=>exchange(impl,circuit,request,{failAt:path[1]}))});
    const next=await recover(impl,circuit,directory(),[path[1]]);replacement=next.circuit;
    events.push({action:'recovery plan',plan:next.plan,oldClosed:circuit.closed});
    if(replacement)events.push({action:'replacement lookup',...await observed(()=>exchange(impl,replacement,request))});
  }else {
    const seq=mode==='wrong-request'?7:0;
    const packet=await impl.wrapRequest(circuit.hops,request,seq),state=circuit.states[0];
    if(mode==='tamper')events.push({action:'altered packet',...await observed(()=>impl.peelForward(state,tamper(packet))),seenAfter:[...state.seenForward]});
    const forward=await observed(()=>deliverForward(impl,circuit,packet));
    events.push({action:'original forward',...forward});
    if(forward.outcome==='returned') {
      const reply=archive(forward.value);
      circuit.trace.push({direction:'endpoint',observer:'archive',previous:path.at(-1),payload:forward.value});
      const response=await deliverBackward(impl,circuit,reply,seq);
      if(mode==='wrong-request')events.push({action:'reply 7 offered to request 8',...await observed(()=>impl.unwrapReply(circuit.hops,response,8))});
      events.push({action:'matching reply',...await observed(()=>impl.unwrapReply(circuit.hops,response,seq))});
    }
    if(mode==='replay')events.push({action:'repeated forward packet',...await observed(()=>impl.peelForward(state,packet)),seenAfter:[...state.seenForward]});
  }
  return {mode:'learner-code simulation',scenario:mode,path,events,trace:circuit.trace,views:views(circuit),
    replacement:replacement?{path:replacement.path,trace:replacement.trace,views:views(replacement)}:null,
    visibility:'These are local observer projections. The single worker operator can inspect all state; this is not anonymity.'};
}
export async function runProject(request) {
  const {source,command='check',through=6,options={}}=request;
  requireThat(['check','diagnose','capstone','workshop'].includes(command),'BAD_COMMAND');
  requireThat(Number.isInteger(through)&&through>=1&&through<=6,'BAD_MODULE');
  const impl=compileLearner(source);
  if(command==='workshop')return runWorkshop(impl,options.scenario);
  if(command==='diagnose')return diagnose(impl,options);
  const checks=await evaluate(impl,command==='capstone'?6:through);
  if(command==='check'||checks.passed!==checks.total)return {kind:command,checks,scenarios:'NOT_RUN unless capstone checks all pass'};
  const scenarios=[];
  for(const mode of ['round-trip','tamper','replay','wrong-request','failed-hop','lost-reply'])scenarios.push(await diagnose(impl,{mode,item:'tide'}));
  const transfer=[
    {id:'A',entry:[0,4,13,18],tolerance:1,candidates:[{id:'A',times:[50,54,63,68]},{id:'B',times:[80,85,93,98]},{id:'C',times:[100,104,114,121]}]},
    {id:'B',entry:[0,1,2,3],tolerance:0,candidates:[{id:'P',times:[20,21,22,23]},{id:'Q',times:[60,61,62,63]},{id:'R',times:[90,91,92,93]}]},
  ];
  for(const task of transfer)task.retained=await impl.correlate(task.entry,task.candidates,task.tolerance);
  return {kind:'capstone',checks,scenarios,transfer,reasoning:'UNASSESSED: apply the written capstone rubric.'};
}
export const requirements=cases.map(({id,module,requirement,input})=>({id,module,requirement,input}));
