import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_VERSION } from '../evaluation/corpus.mjs';
import * as policy from '../evaluation/policy.mjs';
import { prepareEvaluation, runEvaluation } from '../evaluation/report.mjs';
import { measureRetention } from '../retention/measure.mjs';
const source = await readFile(new URL('../evaluation/policy.mjs', import.meta.url), 'utf8');
const evaluations=[];
for (const [threshold,windowTicks] of [[1,20],[3,8],[3,20],[6,20]]) {
  const settings={threshold,windowTicks,minDistanceMm:500};
  const plan=await prepareEvaluation({source,settings});
  const report=await runEvaluation(policy,{source,plan});
  for (const split of ['exploration','evaluation']) evaluations.push({name:`Threshold ${threshold} / ${windowTicks} ticks · ${split}`,split,settings,settingsHash:plan.settingsSha256,result:report[split].result});
  if (threshold===3 && windowTicks===20) evaluations.push({name:'No positives / no predictions',split:'diagnostic',settings,settingsHash:plan.settingsSha256,result:report.noPositiveNoPrediction});
}
const measurement=measureRetention();
const retention=measurement.runs.map(run=>({name:`${run.settings.maxAgeTicks} ticks / ${run.settings.maxEvents} events`,settings:run.settings,inputBytes:measurement.workload.inputJsonBytes,outputBytes:run.jsonBytes,inputCount:run.inputCount,outputCount:run.retainedCount,timingSummary:run.timingSummary,elapsedMs:run.elapsedMs,policyAndEncodeMs:run.policyAndEncodeMs,samples:measurement.samples,warmup:measurement.warmup,workload:measurement.workload}));
const data={schema:2,corpusVersion:CORPUS_VERSION,runtime:measurement.environment,evaluations,retention,measurement};
await writeFile(new URL('../public/samples/analysis-cases.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log('Saved actual synthetic evaluation and local retention measurements.');
