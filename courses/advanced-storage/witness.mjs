import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { executionIdentity, sha256 } from './runtime/identity.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const MAX_FILE=1024*1024, MAX_SOURCE=65536, MAX_ACTIONS=96, MAX_INITIAL=128;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const stable=value=>JSON.stringify(canonical(value));
const jsonBytes=value=>JSON.stringify(value,null,2)+'\n';
function problem(code,message){const error=new Error(message);error.code=code;throw error;}
function readBounded(path,limit=MAX_FILE){if(statSync(path).size>limit)problem('INPUT_LIMIT',`File exceeds ${limit} bytes: ${path}`);return readFileSync(path);}
function parse(path){try{return JSON.parse(readBounded(path));}catch(error){if(error.code)throw error;problem('INVALID_INPUT',`Invalid JSON: ${path}`);}}
function within(parent,child){const r=relative(parent,child);return r===''||(!r.startsWith('..')&&!isAbsolute(r));}
export function witnessToolIdentity(){return sha256(stable({runtime:executionIdentity(),files:['witness.mjs','witness-worker.mjs','investigation.mjs'].map(p=>[p,sha256(readFileSync(join(root,p)))])}));}

function limits(options={}){
  const result={seed:options.seed??1,maxReplays:options.maxReplays??80,maxMillis:options.maxMillis??10000,replayMillis:options.replayMillis??750};
  for(const [key,min,max] of [['seed',0,4294967295],['maxReplays',2,200],['maxMillis',100,30000],['replayMillis',20,2000]])if(!Number.isInteger(result[key])||result[key]<min||result[key]>max)problem('INVALID_INPUT',`${key} must be an integer from ${min} to ${max}.`);
  return result;
}
function validateScenario(scenario){
  if(!scenario||!Array.isArray(scenario.actions)||scenario.actions.length<1||scenario.actions.length>MAX_ACTIONS)problem('INPUT_LIMIT',`Minimization accepts 1–${MAX_ACTIONS} actions.`);
  if(scenario.initial!==undefined&&(!Array.isArray(scenario.initial)||scenario.initial.length>MAX_INITIAL))problem('INPUT_LIMIT',`Minimization accepts at most ${MAX_INITIAL} initial versions.`);
  if(Buffer.byteLength(JSON.stringify(scenario))>131072)problem('INPUT_LIMIT','Scenario exceeds 128 KiB.');
}
function observe(sourcePath,scenario,settings,remainingMillis=settings.replayMillis){
  const result=spawnSync(process.execPath,[join(root,'witness-worker.mjs'),sourcePath,String(settings.seed)],{input:JSON.stringify(scenario),encoding:'utf8',timeout:Math.max(1,Math.min(settings.replayMillis,remainingMillis)),maxBuffer:MAX_FILE});
  if(result.error?.code==='ENOBUFS')return{status:'resource-limit',message:'Replay output exceeded 1 MiB.'};
  if(result.error?.code==='ETIMEDOUT')return{status:'timeout',message:'Replay did not finish inside its time limit.'};
  if(result.status!==0)return{status:'execution-error',message:(result.stderr||result.error?.message||'Worker failed.').slice(0,500)};
  try{const value=JSON.parse(result.stdout);if(!['pass','semantic-failure','resource-limit','invalid-execution','execution-error'].includes(value.status))throw Error();return value;}
  catch{return{status:'execution-error',message:'Worker output did not match the observation protocol.'};}
}
function signature(observation,actionIds){
  if(observation.status!=='semantic-failure')return null;
  const failure=observation.mismatches[0];
  return{rule:'snapshot-observation-v1',originAction:actionIds[failure.index],kind:failure.kind,expected:failure.expected,actual:failure.actual};
}
function requireSemantic(value){if(value.status!=='semantic-failure')problem(value.status==='pass'?'NO_SEMANTIC_FAILURE':value.status.toUpperCase().replaceAll('-','_'),`No minimizable observation: ${value.status}. ${value.message??''}`);}
function readRun(directory){
  const manifest=parse(join(directory,'manifest.json'));
  if(manifest.format!=='advanced-storage-run-v1')problem('INVALID_INPUT','Use a recorded course run with manifest.json.');
  const source=readBounded(join(directory,'engine.mjs'),MAX_SOURCE),scenarioBytes=readBounded(join(directory,'scenario.json')),resultsBytes=readBounded(join(directory,'results.json'));
  for(const [key,bytes] of [['sourceSha256',source],['scenarioSha256',scenarioBytes],['resultSha256',resultsBytes]])if(manifest[key]!==sha256(bytes))problem('STALE_IDENTITY',`Recorded ${key} does not match its bytes.`);
  if(manifest.executionIdentity!==executionIdentity())problem('STALE_IDENTITY','Run belongs to different runtime/checker bytes. Explicitly rerun with the current course; preserve the historical run.');
  let scenario,recorded;try{scenario=JSON.parse(scenarioBytes);recorded=JSON.parse(resultsBytes);}catch{problem('INVALID_INPUT','Run scenario or results are invalid JSON.');}
  validateScenario(scenario);return{manifest,source,scenarioBytes,resultsBytes,scenario,recorded};
}
function ordered(items,seed){
  // Seed controls deletion order, never changes action order inside a replay.
  let state=seed>>>0;const result=[...items];
  for(let i=result.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function transactionGroups(scenario,actionIds){
  const owners=new Map(),groups=new Map();
  for(const id of actionIds){const a=scenario.actions[id];if(a.op==='open-scan')owners.set(a.as,a.tx);}
  for(const id of actionIds){const a=scenario.actions[id],tx=a.tx??owners.get(a.query);if(typeof tx==='string'){if(!groups.has(tx))groups.set(tx,[]);groups.get(tx).push(id);}}
  return[...groups.values()];
}
function explanation(report,original,reduced){
  const f=report.failure;
  const lines=['# Reduced schedule witness','',`Status: **${report.status}**. This is not a proof of global minimality.`,
    `Removed ${report.removed.actions.length} actions and ${report.removed.initial.length} initial versions. Preserved action order and exact row values.`,
    `Policy SHA-256: \`${report.sourceSha256}\`. Seed: ${report.settings.seed}.`,
    `Same failure: ${f.kind} at original action ${f.originAction}; signature \`${report.failureSha256}\`.`,
    '', 'Expected:','```json',jsonBytes(f.expected).trimEnd(),'```','Observed:','```json',jsonBytes(f.actual).trimEnd(),'```',
    '', '## Retained schedule','', '| Reduced index | Original index | Action |','| --- | --- | --- |'];
  reduced.actions.forEach((action,i)=>lines.push(`| ${i} | ${report.kept.actions[i]} | ${JSON.stringify(action).replaceAll('|','\\|')} |`));
  lines.push('','## Removed material','',`Original action indices: ${report.removed.actions.join(', ')||'none'}.`,`Original initial-version indices: ${report.removed.initial.join(', ')||'none'}.`,
    '',`Search used ${report.replays} of ${report.settings.maxReplays} permitted replays; stop reason: ${report.stopReason}.`,
    'A removal is accepted only after two fresh seeded replays preserve the first mismatch, its original action identity, and its exact expected/observed values. Invalid execution, changed failure, timeout and resource exhaustion are rejected candidates.',
    'Local irreducibility means no tested single-action, single-initial-version or transaction-group deletion preserved this signature at the final fixed point. It does not mean the shortest possible program or a causal proof.',
    'The reduced witness diagnoses one failure. It does not replace the full unit-08 investigation, its same-scenario repair, or the structurally new transfer variation.','');
  return lines.join('\n');
}

export function minimizeRun(runDirectory,outDirectory,options={}){
  const input=resolve(runDirectory),out=resolve(outDirectory),settings=limits(options);
  if(existsSync(out)||within(input,out))problem('INVALID_INPUT','Choose a new witness directory outside the original run.');
  if(typeof options.helpUsed!=='string'||!options.helpUsed.trim())problem('INVALID_INPUT','Declare assistance with --help-used.');
  const run=readRun(input),sourcePath=join(input,'engine.mjs'),started=Date.now();
  let replays=0,stopReason='fixed-point',budgetStopped=false;
  const replay=scenario=>{replays++;return observe(sourcePath,scenario,settings,settings.maxMillis-(Date.now()-started));};
  const first=replay(run.scenario);requireSemantic(first);
  const second=replay(run.scenario);requireSemantic(second);
  if(stable(first)!==stable(second))problem('NONDETERMINISTIC','The original observation did not reproduce in two fresh seeded processes.');
  if(stable(first.execution)!==stable(run.recorded))problem('STALE_OBSERVATION','Fresh replay differs from recorded results. Rerun explicitly; no witness was written.');
  const allActions=run.scenario.actions.map((_,i)=>i),allInitial=(run.scenario.initial??[]).map((_,i)=>i);
  const target=signature(first,allActions),targetText=stable(target);
  let kept={actions:allActions,initial:allInitial},best=first;
  const attempts=[];
  const scenarioFor=selection=>({...run.scenario,actions:selection.actions.map(i=>run.scenario.actions[i]),initial:selection.initial.map(i=>run.scenario.initial[i])});
  function canTry(){
    if(replays+2>settings.maxReplays){stopReason='replay-budget';budgetStopped=true;return false;}
    if(Date.now()-started>=settings.maxMillis){stopReason='time-budget';budgetStopped=true;return false;}
    return true;
  }
  function attempt(selection,phase,removed){
    if(!selection.actions.includes(target.originAction))return false;
    if(!canTry())return false;
    const candidate=scenarioFor(selection),observed=replay(candidate);let reason=observed.status,accepted=false;
    if(stable(signature(observed,selection.actions))===targetText){
      if(Date.now()-started>=settings.maxMillis){reason='time-budget';stopReason='time-budget';budgetStopped=true;}
      else{const repeat=replay(candidate);if(stable(observed)===stable(repeat)){accepted=true;reason='same-failure';kept=selection;best=observed;}else reason='nonreproducible';}
    }else if(observed.status==='semantic-failure')reason='different-failure';
    attempts.push({phase,removed,actions:selection.actions.length,initial:selection.initial.length,accepted,reason});
    return accepted;
  }
  function reduce(kind){
    let granularity=2,changed=false;
    while(!budgetStopped){
      const eligible=ordered(kept[kind].filter(i=>kind!=='actions'||i!==target.originAction),settings.seed);
      if(!eligible.length)return changed;
      const width=Math.ceil(eligible.length/granularity);let accepted=false;
      for(let start=0;start<eligible.length&&!budgetStopped;start+=width){
        const removed=eligible.slice(start,start+width),drop=new Set(removed);
        if(attempt({...kept,[kind]:kept[kind].filter(i=>!drop.has(i))},kind,removed)){accepted=true;changed=true;granularity=Math.max(2,granularity-1);break;}
      }
      if(accepted)continue;
      if(granularity>=eligible.length)return changed;
      granularity=Math.min(eligible.length,granularity*2);
    }
    return changed;
  }
  let changed=true;
  while(changed&&!budgetStopped){
    changed=false;
    for(const group of ordered(transactionGroups(run.scenario,kept.actions),settings.seed)){
      const drop=new Set(group);if(attempt({...kept,actions:kept.actions.filter(i=>!drop.has(i))},'transaction',group))changed=true;
      if(budgetStopped)break;
    }
    if(!budgetStopped)changed=reduce('actions')||changed;
    if(!budgetStopped)changed=reduce('initial')||changed;
  }
  const reduced=scenarioFor(kept),removed={actions:allActions.filter(i=>!kept.actions.includes(i)),initial:allInitial.filter(i=>!kept.initial.includes(i))};
  const report={format:'advanced-storage-witness-search-v1',status:budgetStopped?'best-so-far':'locally-irreducible',stopReason,globallyMinimal:false,settings,replays,
    originalCounts:{actions:allActions.length,initial:allInitial.length},reducedCounts:{actions:kept.actions.length,initial:kept.initial.length},kept,removed,
    sourceSha256:sha256(run.source),failure:target,failureSha256:sha256(targetText),attempts,elapsedMillis:Date.now()-started};
  const files={'engine.mjs':run.source,'original/manifest.json':readBounded(join(input,'manifest.json')),'original/scenario.json':run.scenarioBytes,'original/results.json':run.resultsBytes,
    'reduced/scenario.json':jsonBytes(reduced),'reduced/results.json':jsonBytes(best.execution),'search.json':jsonBytes(report),'witness.md':explanation(report,run.scenario,reduced)};
  const bytes=Object.values(files).reduce((n,b)=>n+Buffer.byteLength(b),0);if(bytes>3*MAX_FILE)problem('OUTPUT_LIMIT','Witness exceeds the 3 MiB output limit; choose a smaller original run.');
  const manifest={format:'advanced-storage-witness-v1',executionIdentity:executionIdentity(),toolIdentity:witnessToolIdentity(),sourceSha256:sha256(run.source),seed:settings.seed,failureSha256:report.failureSha256,
    originalRunManifestSha256:sha256(files['original/manifest.json']),helpUsed:options.helpUsed,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha256(bytes)]))};
  mkdirSync(out,{recursive:true});mkdirSync(join(out,'original'));mkdirSync(join(out,'reduced'));
  for(const [name,bytes]of Object.entries(files))writeFileSync(join(out,name),bytes,{flag:'wx'});
  writeFileSync(join(out,'manifest.json'),jsonBytes(manifest),{flag:'wx'});
  return{directory:out,...report};
}

export function readWitness(directory){
  const dir=resolve(directory),manifest=parse(join(dir,'manifest.json'));
  if(manifest.format!=='advanced-storage-witness-v1')problem('INVALID_INPUT','Unknown witness format.');
  if(manifest.executionIdentity!==executionIdentity()||manifest.toolIdentity!==witnessToolIdentity())problem('STALE_IDENTITY','Witness runtime or minimizer identity differs. Keep the original bundle and use its matching course version.');
  const names=['engine.mjs','original/manifest.json','original/scenario.json','original/results.json','reduced/scenario.json','reduced/results.json','search.json','witness.md'];
  for(const name of names)if(manifest.files?.[name]!==sha256(readBounded(join(dir,name))))problem('STALE_IDENTITY',`Witness bytes differ: ${name}`);
  const report=parse(join(dir,'search.json'));
  if(sha256(stable(report.failure))!==manifest.failureSha256||report.failureSha256!==manifest.failureSha256||manifest.sourceSha256!==manifest.files['engine.mjs']||manifest.seed!==report.settings.seed||manifest.originalRunManifestSha256!==manifest.files['original/manifest.json'])problem('STALE_IDENTITY','Witness provenance fields disagree.');
  const original=parse(join(dir,'original/scenario.json')),reduced=parse(join(dir,'reduced/scenario.json')),originalManifest=parse(join(dir,'original/manifest.json'));
  for(const [kind,values] of [['actions',original.actions],['initial',original.initial??[]]]){
    const ids=report.kept?.[kind];if(!Array.isArray(ids)||ids.some((id,i)=>!Number.isInteger(id)||id<0||id>=values.length||(i>0&&id<=ids[i-1])))problem('STALE_IDENTITY','Reduction mapping is not an ordered subset.');
  }
  const projected={...original,actions:report.kept.actions.map(i=>original.actions[i]),initial:report.kept.initial.map(i=>original.initial[i])};
  if(stable(projected)!==stable(reduced)||!report.kept.actions.includes(report.failure.originAction))problem('STALE_IDENTITY','Reduced witness is not the declared deletion-only projection.');
  if(originalManifest.sourceSha256!==manifest.sourceSha256||originalManifest.scenarioSha256!==manifest.files['original/scenario.json']||originalManifest.resultSha256!==manifest.files['original/results.json']||originalManifest.executionIdentity!==manifest.executionIdentity)problem('STALE_IDENTITY','Original run identity disagrees with the witness.');
  return{dir,manifest,report};
}
export function replayWitness(directory,options={}){
  const {dir,manifest,report}=readWitness(directory),settings=limits({...report.settings,...options});
  if(settings.seed!==manifest.seed)problem('STALE_IDENTITY','Replay must keep the recorded seed.');
  const original=parse(join(dir,'original/scenario.json')),reduced=parse(join(dir,'reduced/scenario.json'));
  for(const [name,scenario,ids]of [['original',original,original.actions.map((_,i)=>i)],['reduced',reduced,report.kept.actions]]){
    validateScenario(scenario);const a=observe(join(dir,'engine.mjs'),scenario,settings),b=observe(join(dir,'engine.mjs'),scenario,settings);requireSemantic(a);
    if(stable(a)!==stable(b))problem('NONDETERMINISTIC',`${name} witness replay was not reproducible.`);
    if(stable(a.execution)!==stable(parse(join(dir,name,'results.json')))||sha256(stable(signature(a,ids)))!==manifest.failureSha256)problem('STALE_OBSERVATION',`${name} no longer reproduces the recorded failure.`);
  }
  return{format:'advanced-storage-witness-replay-v1',verified:true,sourceSha256:manifest.sourceSha256,seed:manifest.seed,failureSha256:manifest.failureSha256,status:report.status,originalCounts:report.originalCounts,reducedCounts:report.reducedCounts};
}
export function showWitness(directory){const{dir}=readWitness(directory);return readBounded(join(dir,'witness.md')).toString();}
