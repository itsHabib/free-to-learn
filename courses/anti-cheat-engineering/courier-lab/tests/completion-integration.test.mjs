import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareWorkspace } from '../lab/core/prepare.mjs';
import { sealReference } from '../lab/core/seal.mjs';
import { checkSubmission } from '../lab/core/grade.mjs';
import { withServer } from './harness.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
test('all final source modules prepare and grade captured code; capstone includes independent scenario',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ivy-completion-'));
 await cp(project,root,{recursive:true,filter:path=>!path.includes('/node_modules')&&!path.includes('/artifacts')});
 await sealReference(root);
 for(const id of ['timing','recovery','capstone']){
  const {workspace}=await prepareWorkspace({root,id});
  const session=JSON.parse(await readFile(join(workspace,'lab/core/session.json'),'utf8'));
  const predictions=JSON.parse(await readFile(join(workspace,'predictions.json'),'utf8'));
  predictions.predictions.forEach(item=>{item.skipReason='Author source-grader calibration does not assess written reasoning.';});
  await writeFile(join(workspace,'predictions.json'),JSON.stringify(predictions));
  await writeFile(join(workspace,id,'policy.mjs'),await readFile(join(root,id,'policy.mjs')));
  if(id==='capstone')await writeFile(join(workspace,id,'scenario.mjs'),'console.log("capstone-diagnostic-note");\n'+await readFile(join(root,id,'author-scenario.mjs')));
  const result=await checkSubmission({workspace,session,assistance:'author calibration control'});
  assert.equal(result.kind,'pass',JSON.stringify(result));
  if(id==='recovery'){assert.equal(result.evidence.trial.recovered.status,'applied');assert.equal(result.evidence.trial.dataLoss.lostScore,1);}
  if(id==='capstone'){
   assert.equal(result.evidence.scenarios.length,16);
   for(const row of result.evidence.scenarios)assert.match(row.output,/capstone-diagnostic-note/);
   const savedResult=JSON.parse(await readFile(join(result.destination,'result.json'),'utf8'));
   assert.match(savedResult.evidence.scenarios[0].output,/capstone-diagnostic-note/);
   const submission=JSON.parse(await readFile(join(result.destination,'submission.json'),'utf8'));
   assert.ok(submission.hashes['capstone/scenario.mjs']);
   await writeFile(join(workspace,id,'client.mjs'),'throw new Error("changed helper")');
   await assert.rejects(checkSubmission({workspace,session,assistance:'test'}),/HTTP client changed/);
  }
 }
});
test('all completion routes expose recorded results with explicit scope',async()=>{
 await withServer(async server=>{
  assert.match(await (await fetch(server.base+'/completion')).text(),/SAVED REAL HTTP/);
  assert.match(await (await fetch(server.base+'/sources')).text(),/bibliographic pointers/);
  const data=await (await fetch(server.base+'/samples/completion-cases.json')).json();
  assert.equal(data.recovery.codeOnly.reason,'state-schema');
  assert.equal(data.recovery.recovered.status,'applied');
  assert.equal(data.capstone.steps[1].data.reason,'duplicate');
  assert.equal(data.capstone.steps[2].data.reason,'range');
  assert.equal(data.timing.length,10);
 });
});

test('capstone trace refuses a missing policy export without reference fallback',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ivy-empty-policy-'));
 const source=join(root,'empty.mjs'),output=join(root,'report.json');
 await writeFile(source,'export const other = true;');
 await assert.rejects(promisify(execFile)(process.execPath,[join(project,'tools/final-cli.mjs'),'capstone',source,output]),error=>error.code===2&&/must export repair/.test(error.stderr));
 await assert.rejects(readFile(output));
});
