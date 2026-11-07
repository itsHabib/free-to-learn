#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stages } from './public/checks.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root,'course.json')));
const sha = x => createHash('sha256').update(x).digest('hex');
const contractFiles = ['course.json','grade.mjs','public/checks.mjs','lab.mjs','practice.json','support.json','contracts.md','examples.json',...config.runtime.map(n=>'public/'+n)];
const contract = () => sha(contractFiles.map(n=>n+'\n'+readFileSync(join(root,n))).join('\n'));
function start(target,quiet=false) {
  mkdirSync(target); // exclusive: EEXIST refuses to overwrite a learner project
  copyFileSync(join(root,'starter/solution.mjs'),join(target,'solution.mjs'));
  for(const name of config.runtime) copyFileSync(join(root,'public',name),join(target,name));
  writeFileSync(join(target,'PROJECT.json'),JSON.stringify({course:config.id,contract:contract()},null,2));
  writeFileSync(join(target,'report.md'),'# Project report\n\n## Prediction\n\n## Evidence\n\n## Explanation\n\n## Counterexperiment\n\n## Limits and help used\n');
  if(!quiet)console.log(`Created ${target}. Implement solution.mjs. The unfinished starter is expected to fail stage 01.`);
}

function startFor(target,stage,flag) {
  if(flag!=='--use-prior')throw Error('Explicit assistance choice required: start-for NEW_DIRECTORY STAGE --use-prior');
  const support=JSON.parse(readFileSync(join(root,'support.json')))[stage];
  if(!support)throw Error('Choose an existing stage.');
  start(target,true);
  writeFileSync(join(target,'solution.mjs'),support.source);
  writeFileSync(join(target,'PROJECT.json'),JSON.stringify({course:config.id,contract:contract(),assistance:{kind:'supplied-earlier-layers',selected_stage:stage,provided_layers:support.provided_layers,target:support.target,notice:support.notice}},null,2));
  console.log(`Assisted stage ${stage}: provided earlier layers ${support.provided_layers.join(',')||'none'}. ${support.notice} Current target: ${support.target}.`);
}
function check(target,stage,help) {
  if (!stages.includes(stage)) throw Error('Choose stage '+stages.join(', ')+'.');
  if (!existsSync(join(target,'PROJECT.json'))) throw Error('Missing project: run lab.mjs start NEW_DIRECTORY first.');
  const assistance=JSON.parse(readFileSync(join(target,'PROJECT.json'))).assistance??null;
  const source = readFileSync(join(target,'solution.mjs'));
  // Snapshot and evidence directory must exist before any learner code is imported.
  const attempt = join(target,'attempts',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
  mkdirSync(attempt,{recursive:true});
  writeFileSync(join(attempt,'solution.mjs'),source,{flag:'wx'});
  if(existsSync(join(target,'report.md'))) copyFileSync(join(target,'report.md'),join(attempt,'report.md'));
  for(const name of config.runtime) copyFileSync(join(root,'public',name),join(attempt,name));
  const question = { course:config.id, stage, requirement:config.outcomes[Number(stage)-1], contract_sha256:contract() };
  const receipt = { ...question, question, supplied_assistance:assistance, source_sha256:sha(source), help_used:help, started_at:new Date().toISOString(), verdict:'pending' };
  writeFileSync(join(attempt,'question.json'),JSON.stringify(question,null,2),{flag:'wx'});
  writeFileSync(join(attempt,'receipt.json'),JSON.stringify(receipt,null,2));
  const run = spawnSync(process.execPath,[join(root,'grade.mjs'),join(attempt,'solution.mjs'),stage],{encoding:'utf8',timeout:10000,maxBuffer:512000});
  writeFileSync(join(attempt,'stdout.txt'),run.stdout??'');writeFileSync(join(attempt,'stderr.txt'),run.stderr??'');
  const lines=(run.stdout??'').split('\n').filter(x=>x.startsWith('IVY_RESULT:'));
  let payload;
  try { payload=JSON.parse(lines.at(-1)?.slice(11)??'null'); } catch { payload=null; }
  const complete=payload?.stage===stage && Array.isArray(payload.results) && payload.results.length===config.caseCounts[Number(stage)-1] && payload.results.every(x=>typeof x.pass==='boolean');
  receipt.verdict = run.error || run.status!==0 || !complete ? 'execution_error' : payload.results.every(x=>x.pass) ? 'pass' : 'fail';
  receipt.finished_at=new Date().toISOString();receipt.results=complete?payload.results:[];
  receipt.execution={status:run.status,signal:run.signal,error:run.error?.message??null};
  writeFileSync(join(attempt,'receipt.json'),JSON.stringify(receipt,null,2));
  for(const result of receipt.results) {
    console.log(`${result.pass?'PASS':'FAIL'} ${result.id}: ${JSON.stringify(result.input)}`);
    if(!result.pass&&result.counterexample)console.log('  First counterexample: '+JSON.stringify(result.counterexample));
    if(!result.pass) console.log(`  Expected ${JSON.stringify(result.expected)}; observed ${JSON.stringify(result.actual)}. Read ${result.lesson}, section Worked procedure; repair solution.mjs and rerun.`);
  }
  if(receipt.verdict==='execution_error') console.error(`Code did not finish the public checks. ${run.error?.message??run.stderr??''} Inspect ${attempt}/stderr.txt; repair syntax, imports or nontermination and rerun.`);
  if(assistance)console.log('Provided earlier layers: '+JSON.stringify(assistance)+'. This check does not establish ownership of those layers.');
  console.log(`${receipt.verdict}; saved attempt ${attempt}. A pass covers these cases; the report is reviewed separately.`);
  process.exitCode=receipt.verdict==='pass'?0:receipt.verdict==='fail'?1:2;
}
function status(target) {
  const folder=join(target,'attempts');
  if(!existsSync(folder)) return console.log('No attempts yet.');
  const source=sha(readFileSync(join(target,'solution.mjs')));
  for(const name of readdirSync(folder).sort()) {
    const r=JSON.parse(readFileSync(join(folder,name,'receipt.json')));
    console.log(`${name} stage ${r.stage} ${r.verdict}; ${r.source_sha256===source&&r.contract_sha256===contract()?'current':'historical'}`);
  }
}

const practice=JSON.parse(readFileSync(join(root,'practice.json')));
function item(id) {const q=practice[id];if(!q)throw Error('Unknown prediction: choose '+Object.keys(practice).join(', '));return q;}
function predict(target,id,answer,help) {
  const q=item(id);
  if(typeof answer!=='string'||!answer.trim())throw Error('Provide a prediction answer before feedback. Use question ITEM to read its format.');
  if(!existsSync(join(target,'PROJECT.json')))throw Error('Missing project: run start NEW_DIRECTORY first.');
  const source=readFileSync(join(target,'solution.mjs'));
  const folder=join(target,'attempts',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
  mkdirSync(folder,{recursive:true});
  const question={id,version:q.version,question:q.question,format:q.format,contract_sha256:contract()};
  const record={supplied_assistance:JSON.parse(readFileSync(join(target,'PROJECT.json'))).assistance??null,kind:'prediction',course:config.id,stage:id,question,answer,help_used:help,source_sha256:sha(source),contract_sha256:contract(),started_at:new Date().toISOString(),verdict:'pending'};
  writeFileSync(join(folder,'solution.mjs'),source,{flag:'wx'});
  if(existsSync(join(target,'report.md')))copyFileSync(join(target,'report.md'),join(folder,'report.md'));
  writeFileSync(join(folder,'question.json'),JSON.stringify(question,null,2),{flag:'wx'});
  writeFileSync(join(folder,'submission.json'),JSON.stringify(record,null,2),{flag:'wx'});
  const correct=answer.trim().toLowerCase()===String(q.expected).toLowerCase();
  record.verdict=correct?'pass':'revise';record.expected=q.expected;record.feedback=q.reason;record.finished_at=new Date().toISOString();
  writeFileSync(join(folder,'receipt.json'),JSON.stringify(record,null,2));
  console.log(`Your committed answer: ${answer}\n${correct?'Matches the model':'Revise this prediction'}. Expected ${q.expected}. ${q.reason}\nRead lessons/${id.slice(0,2)}.md. ${id.endsWith('a')?'Try changed case '+id.slice(0,2)+'b.':'Keep this case and your explanation in the report.'}\nSaved ${folder}. This prediction does not grade your code or certify mastery.`);
}
const [verb,targetArg,stage,...rest]=process.argv.slice(2);
try {
  if(!verb||!targetArg) throw Error('Usage: node lab.mjs start|start-for|check|status|export|predict TARGET [STAGE | NEW_EXPORT_DIRECTORY] [--help-used TEXT]');
  const target=resolve(targetArg);
  if(verb==='start-for') startFor(target,stage,rest[0]);
  else if(verb==='question') {const q=item(targetArg);console.log(q.question+'\nAnswer format: '+q.format);}
  else if(verb==='predict') predict(target,stage,rest[0],rest[1]==='--help-used'?rest.slice(2).join(' '):'not declared');
  else if(verb==='start') start(target);
  else if(verb==='check') check(target,stage,rest[0]==='--help-used'?rest.slice(1).join(' '):'not declared');
  else if(verb==='status') status(target);
  else if(verb==='export') {if(!stage)throw Error('Provide a new export directory.');mkdirSync(resolve(stage));cpSync(target,join(resolve(stage),'project'),{recursive:true});console.log('Exported code, report and all local attempts. Review contents before optional sharing.');}
  else throw Error('Unknown command. Use start, start-for, check, status, export, question or predict.');
} catch(e) {console.error(e.code==='EEXIST'?'Destination exists: choose a new directory; existing work was preserved.':e.message);process.exitCode=2;}
