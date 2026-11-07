import {verifyComparison,expectedRecommendation} from './assessment.mjs';
import {episode} from './game.mjs';
import {createController} from './control.mjs';
import {fixtureTransport} from './fixtures.mjs';
import {pairedInterval} from './resample.mjs';
export async function runEvaluation(modules,manifest,mode='rules',gates={maxCalls:2,completionLoss:0,survivalLoss:0,minDistanceGain:.02}) {
 if(!['rules','fixture','project'].includes(mode))throw Error('evaluation mode must be rules, fixture or project');
 if(!manifest?.episodes?.length||new Set(manifest.episodes.map(e=>e.id)).size!==manifest.episodes.length)throw Error('frozen unique episode manifest required');
 if(!Number.isInteger(gates.maxCalls)||gates.maxCalls<0||gates.maxCalls>20||['completionLoss','survivalLoss','minDistanceGain'].some(k=>!Number.isFinite(gates[k])||gates[k]<0))throw Error('invalid frozen evaluation gates');
 const baseline=(s,m)=>modules['rules.mjs'].chooseRules(modules['observe.mjs'].observe(s),m);
 const data=await (typeof process==='undefined'?fetch(new URL('./evaluation/calibration-data.json',import.meta.url)).then(r=>r.json()):import('node:fs/promises').then(fs=>fs.readFile(new URL('./evaluation/calibration-data.json',import.meta.url),'utf8')).then(JSON.parse));
 const table=modules['confidence.mjs'].fitCalibration(data),pairs=[];
 for(const spec of manifest.episodes){const environment={...spec,requestLimit:Math.min(spec.requestLimit??gates.maxCalls,gates.maxCalls)},base=await episode(baseline,environment),controller=createController(modules,{transport:fixtureTransport,table,domain:spec.bot+'/'+spec.profile,maxRequests:environment.requestLimit,now:()=>0});const candidate=mode==='project'?modules['project.mjs'].policy:mode==='fixture'?controller.decide:baseline;const result=await episode(candidate,environment);pairs.push({base,candidate:result});}
 const report=modules['evaluate.mjs'].compare(pairs);verifyComparison(report,pairs);const recommendation=modules['evaluate.mjs'].recommend(report,gates);if(recommendation!==expectedRecommendation(report,gates))throw Error('recommendation contradicts validated report and frozen gates');return {recommendation,gates,origin:mode==='fixture'?'synthetic-fixture':mode==='project'?'learner-project':'rules',warning:'No real model was called. Synthetic comparisons do not qualify a provider.',manifest,report:{...report,distanceInterval:pairedInterval(report.rows)},pairs};
}
