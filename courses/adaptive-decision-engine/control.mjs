// Supplied orchestration; the course-owned policies are injected.
export function createController(modules,{transport,table,domain='fixed/steady',maxRequests=4,timeoutMs=25,now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,onEvent=()=>{}}) {
 let scheduler={used:0,maxRequests,timeoutMs,serial:0,pending:null,armed:false},latest=null;
 const sch=modules['schedule.mjs'],ad=modules['adapter.mjs'],cf=modules['confidence.mjs'];
 function fallback(obs,memory,reason,calls=0,latencyMs=0){return {...modules['rules.mjs'].chooseRules(obs,memory),reason,origin:'synthetic-fixture',calls,latencyMs};}
 async function decide(state,memory={}) {
  const obs=modules['observe.mjs'].observe(state);latest={episodeId:obs.episodeId,revision:obs.revision};const allowed=modules['constraints.mjs'].allowedActions(obs);
  if(!obs.flags.available)return fallback(obs,memory,'unavailable');
  const started=now(),reservation=sch.reserve(scheduler,latest,started);scheduler=reservation.state;if(!reservation.ticket)return fallback(obs,memory,reservation.error);
  const request=ad.buildRequest(obs,allowed,{model:'fixture-v1',host:'offline'}),ticket=reservation.ticket;
  let timer,finished=false;
  const wait=new Promise(resolve=>{timer=setTimer(()=>resolve({timeout:true}),timeoutMs);});
  const response=Promise.resolve().then(()=>transport(request)).then(raw=>({raw}),()=>({error:'unavailable'}));
  response.then(()=>{if(finished)onEvent({kind:'late-response-discarded',token:ticket.token});});
  const arrived=await Promise.race([response,wait]);finished=true;clearTimer(timer);
  if(arrived.timeout){scheduler=sch.expire(scheduler,ticket.deadline);onEvent({kind:'timeout',token:ticket.token});return fallback(obs,memory,'timeout',1,timeoutMs);}
  const parsed=arrived.error?{ok:false,error:arrived.error}:ad.parseResponse(arrived.raw,request,obs,'synthetic-fixture');
  const settled=sch.settle(scheduler,ticket,latest,now(),parsed);scheduler=settled.state;
  if(!settled.accepted)return fallback(obs,memory,settled.error,1,now()-started);
  const selection=cf.select(parsed,table,domain);
  if(!selection.use)return fallback(obs,memory,selection.reason,1,now()-started);
  return {action:parsed.action,memory,reason:'supported',origin:'synthetic-fixture',calls:1,latencyMs:now()-started};
 }
 return {decide,getState:()=>structuredClone(scheduler),restore:s=>{scheduler={...structuredClone(s),pending:null,armed:false};latest=null;}};
}
