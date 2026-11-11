import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runAnalysisCli } from '../tools/analysis-cli.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareWorkspace } from '../lab/core/prepare.mjs';
import { checkSubmission } from '../lab/core/grade.mjs';
import { sealReference } from '../lab/core/seal.mjs';
import { withServer } from './harness.mjs';

const execute=promisify(execFile);
const project=fileURLToPath(new URL('../',import.meta.url));
async function evaluationWorkspace(t){
 const root=await mkdtemp(join(tmpdir(),'ivy-analysis-session-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await cp(project,root,{recursive:true,filter:path=>!path.includes('/node_modules')&&!path.includes('/artifacts')});
 await sealReference(root);
 const prepared=await prepareWorkspace({root,id:'evaluation'});
 await writeFile(join(prepared.workspace,'evaluation/policy.mjs'),await readFile(join(root,'evaluation/policy.mjs')));
 return {...prepared,root,session:JSON.parse(await readFile(join(prepared.workspace,'lab/core/session.json')))};
}
test('documented CLI binds frozen evaluation to a session and next submission without changing prior work',async t=>{
 const {workspace,root,session}=await evaluationWorkspace(t);
 const predictions=JSON.parse(await readFile(join(workspace,'predictions.json')));
 predictions.predictions.forEach(item=>{item.answer='Captured author calibration prediction; prose correctness is not graded.';});
 await writeFile(join(workspace,'predictions.json'),JSON.stringify(predictions));
 await assert.rejects(readFile(join(workspace,'evaluation/feedback.mjs')),/ENOENT/);
 await writeFile(join(workspace,'response.md'),'My first unassisted prediction.');
 const first=await checkSubmission({workspace,session,assistance:'none'});
 const before=await readFile(join(first.destination,'submission.json'));
 const feedback=JSON.parse(await readFile(join(first.destination,'prediction-feedback.json')));
 assert.ok(feedback.predictions.length>0);
 assert.equal(feedback.transfer,undefined);
 const exploration=await runAnalysisCli(['explore',workspace,'3','8','500']);
 assert.equal(exploration.report.split,'exploration');
 assert.equal(Object.hasOwn(exploration.report,'evaluation'),false);
 const planned=JSON.parse((await execute(process.execPath,[join(root,'tools/analysis-cli.mjs'),'plan',workspace,'3','20','500'])).stdout);
 const result=await runAnalysisCli(['run',workspace,planned.planId]);
 assert.equal(result.report.plan.sourceSha256,planned.plan.sourceSha256);
 assert.deepEqual(result.report.evaluation.result.metrics,{total:7,tp:1,fp:0,tn:6,fn:0,precision:1,recall:1,falsePositiveRate:0});
 await assert.rejects(runAnalysisCli(['run',workspace,planned.planId]));
 await assert.rejects(runAnalysisCli(['plan',workspace,'3','8','500']),/revision/i);
 await writeFile(join(workspace,'response.md'),'Revision after reviewing feedback and evaluation.');
 const second=await checkSubmission({workspace,session,assistance:'checker and evaluation feedback'});
 const submission=JSON.parse(await readFile(join(second.destination,'submission.json')));
 assert.equal(submission.evaluationEvidence.evaluationExposed,true);
 assert.equal(submission.evaluationEvidence.latestPlanId,planned.planId);
 assert.ok(submission.evaluationEvidence.events.length>=3);
 assert.deepEqual(await readFile(join(first.destination,'submission.json')),before);
 assert.equal(await readFile(join(first.destination,'submitted/response.md'),'utf8'),'My first unassisted prediction.');
});
test('CLI measures, exports and deletes one synthetic export while preserving the receipt',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ivy-retention-cli-'));
 const policy=resolve('retention/policy.mjs');
 const measured=await runAnalysisCli(['measure',policy,join(root,'measure.json')]);
 assert.equal(measured.report.runs.length,2);
 const receipt=join(root,'receipt.json'),output=join(root,'denials.json');
 await runAnalysisCli(['export',policy,output,receipt,'256','128']);
 const payload=JSON.parse(await readFile(output,'utf8'));
 assert.equal(payload.events.length,128);
 assert.deepEqual(Object.keys(payload.events[0]).sort(),['actorId','distanceSquared','reason','tick']);
 await runAnalysisCli(['delete',receipt,join(root,'deleted.json')]);
 await assert.rejects(access(output));
 await access(receipt);
});
test('analysis public assets and saved labels are served by the owned server',async()=>{
 await withServer(async server=>{
   const html=await (await fetch(server.base+'/analysis')).text();
   assert.match(html,/SAVED EVALUATION/);
   const data=await (await fetch(server.base+'/samples/analysis-cases.json')).json();
   assert.equal(data.evaluations.length,9);
   assert.equal(data.retention.length,2);
   assert.equal(data.evaluations.at(-1).result.metrics.total,7);
   assert.equal(data.evaluations.find(row=>row.split==='diagnostic').result.metrics.precision,null);
 });
});

test('existing custody outputs prevent export or deletion before any side effect',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ivy-custody-'));
 const policy=resolve('retention/policy.mjs');
 const output=join(root,'denials.json'), receipt=join(root,'receipt.json'), deletion=join(root,'deleted.json');
 await writeFile(receipt,'existing');
 await assert.rejects(runAnalysisCli(['export',policy,output,receipt,'256','128']),/EEXIST/);
 await assert.rejects(access(output));
 const receipt2=join(root,'receipt2.json');
 await runAnalysisCli(['export',policy,output,receipt2,'256','128']);
 await writeFile(deletion,'existing');
 await assert.rejects(runAnalysisCli(['delete',receipt2,deletion]),/EEXIST/);
 await access(output);
});

test('documented measurement CLI preserves declared settings and sample counts',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ivy-measure-cli-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const output=join(root,'measurement.json');
 await execute(process.execPath,[join(project,'tools/analysis-cli.mjs'),'measure',join(project,'retention/policy.mjs'),output,'4095:512:64','4095:128:16','--warmup','3','--samples','7']);
 const report=JSON.parse(await readFile(output));
 assert.equal(report.warmup,3);assert.equal(report.samples,7);
 assert.deepEqual(report.settings,[{nowTick:4095,maxAgeTicks:512,maxEvents:64},{nowTick:4095,maxAgeTicks:128,maxEvents:16}]);
 assert.equal(report.runs[0].retainedCount,64);assert.equal(report.runs[1].retainedCount,16);
 assert.equal(report.runs[0].elapsedMs.length,7);
 assert.equal(report.runs[0].timingSummary.wholeOperation.p95Ms,null);
 assert.equal(report.runs[0].timingSummary.wholeOperation.tailStatistic,'max');
 await assert.rejects(runAnalysisCli(['measure',join(project,'retention/policy.mjs'),join(root,'bad.json'),'4095:bad:1']),/setting/);
});
