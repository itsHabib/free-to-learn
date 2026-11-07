// Supplied independent assessment oracle; learner metrics are checked against raw transitions.
import {auditEpisode} from './audit.mjs';
const keys=['survival','completion','distance','playedDistance','challenge','proposalViolations','executedViolations','fallbacks','calls','latencyMs','duplicateEffects','staleEffects'];
export function expectedMetrics(ep){
 auditEpisode(ep);let loss=12-ep.events.length,challenge=0,proposalViolations=0,executedViolations=0,fallbacks=0,calls=0,latencyMs=0,duplicateEffects=0,staleEffects=0;
 for(let i=0;i<ep.events.length;i++){
  const e=ep.events[i],d=ep.decisions[i];loss+=Math.max(e.target[0]-e.pressure,0,e.pressure-e.target[1]);challenge+=Number(e.kind!=='rest');proposalViolations+=Number(d.proposalViolations.length>0);executedViolations+=Number(d.executedViolations.length>0);fallbacks+=Number(!['rules','challenge','recovery','supported'].includes(d.reason));calls+=d.calls;latencyMs+=d.latencyMs;duplicateEffects+=d.duplicateEffects||0;staleEffects+=d.staleEffects||0;
 }
 const alive=Number(ep.final.health>0),n=ep.events.length;
 return {survival:alive,completion:Number(alive&&n===12&&ep.final.charge>=12),distance:loss/12,playedDistance:(loss-(12-n))/n,challenge:challenge/12,proposalViolations,executedViolations,fallbacks,calls,latencyMs,duplicateEffects,staleEffects};
}
export function expectedComparison(pairs){
 if(!pairs.length||new Set(pairs.map(p=>p.base.id)).size!==pairs.length)throw Error('nonempty unique pairs required');
 const rows=pairs.map(({base,candidate})=>{
  for(const key of ['id','seed','bot','profile','targetSchedule','requestLimit'])if(JSON.stringify(base[key])!==JSON.stringify(candidate[key]))throw Error('unpaired '+key);
  const a=expectedMetrics(base),b=expectedMetrics(candidate);
  return {id:base.id,slice:base.bot+'/'+base.profile,base:a,candidate:b,difference:Object.fromEntries(keys.filter(k=>k!=='playedDistance').map(k=>[k,b[k]-a[k]]))};
 });
 const average=xs=>Object.fromEntries(Object.keys(xs[0].difference).map(k=>[k,xs.reduce((s,x)=>s+x.difference[k],0)/xs.length]));
 return {n:rows.length,rows,mean:average(rows),slices:Object.fromEntries([...new Set(rows.map(r=>r.slice))].sort().map(slice=>{const xs=rows.filter(r=>r.slice===slice);return [slice,{n:xs.length,mean:average(xs)}];}))};
}
function matches(actual,expected,path){
 if(typeof expected==='number'){if(!Number.isFinite(actual)||Math.abs(actual-expected)>1e-9)throw Error('incorrect metric: '+path);return;}
 if(expected===null){if(actual!==null)throw Error('incorrect null metric: '+path);return;}
 if(typeof expected!=='object'){if(actual!==expected)throw Error('incorrect report identity: '+path);return;}
 if(!actual||Array.isArray(actual)!==Array.isArray(expected))throw Error('missing report field: '+path);
 if(Array.isArray(expected)&&actual.length!==expected.length)throw Error('missing report rows: '+path);
 for(const [key,value]of Object.entries(expected))matches(actual[key],value,path+'.'+key);
}
export function verifyMetrics(actual,ep){matches(actual,expectedMetrics(ep),'metrics');return true;}
export function verifyComparison(report,pairs){matches(report,expectedComparison(pairs),'report');return true;}
export function expectedRecommendation(report,gates){
 if(report.rows.some(r=>r.candidate.executedViolations||r.candidate.duplicateEffects||r.candidate.staleEffects||r.candidate.calls>gates.maxCalls))return 'rules';
 if(Object.values(report.slices).some(s=>s.mean.completion< -gates.completionLoss||s.mean.survival< -gates.survivalLoss))return 'rules';
 return report.mean.distance<=-gates.minDistanceGain?'selective':'collect-more-evidence';
}
