// One fresh process per observation: module state cannot leak across candidates.
// This is a timeout boundary for trusted learner code, not a security sandbox.
import { readFileSync } from 'node:fs';
import { BaseEngine } from './runtime/base.mjs';
import { executeScenario } from './runtime/scenario.mjs';
import { snapshotOracle } from './investigation.mjs';

let state=Number(process.argv[3])>>>0;
Math.random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
console.log=console.info=console.warn=console.error=()=>{};
let output;
try {
  const source=readFileSync(process.argv[2]), scenario=JSON.parse(readFileSync(0,'utf8'));
  // Reject missing aliases before entering learner code. Do not infer commit
  // success here: dynamic transaction-state errors still belong to execution.
  const transactions=new Set(),queries=new Set(),statistics=new Set();
  const transactionOps=new Set(['get','put','delete','scan','open-scan','analyze','compare-plans','commit','abort']);
  const invalid=message=>{throw Object.assign(new Error(message),{code:'INPUT'});};
  for(const a of scenario.actions){
    if(!a||typeof a!=='object')invalid('Each action must be an object.');
    if(a.op==='begin'){
      if(typeof a.tx!=='string'||!a.tx)invalid('begin requires a transaction alias.');transactions.add(a.tx);
    }else if(transactionOps.has(a.op)){
      if(!transactions.has(a.tx))invalid(`Unknown transaction alias: ${a.tx}`);
      if(a.op==='open-scan')queries.add(a.as);
      if(a.op==='analyze')statistics.add(a.as);
      if(a.op==='compare-plans'&&(!statistics.has(a.leftStats)||!statistics.has(a.rightStats)))invalid('Unknown statistics alias.');
    }else if(a.op==='pull'||a.op==='close-query'){
      if(!queries.has(a.query))invalid(`Unknown query alias: ${a.query}`);
    }else if(!['inspect','vacuum'].includes(a.op))invalid(`Unknown action: ${a.op}`);
  }
  // The course contract requires portable source. Relative imports cannot work
  // in a data module; copied witnesses therefore need no hidden adjacent files.
  const {buildEngine}=await import('data:text/javascript;base64,'+source.toString('base64'));
  const execution=executeScenario(buildEngine(BaseEngine),scenario);
  const {mismatches}=snapshotOracle(scenario,execution);
  output={status:mismatches.length?'semantic-failure':'pass',execution,mismatches};
} catch(error) {
  const status=error.code==='RESOURCE'?'resource-limit':['INPUT','STATE'].includes(error.code)?'invalid-execution':'execution-error';
  output={status,code:error.code??error.name,message:String(error.message).slice(0,500)};
}
process.stdout.write(JSON.stringify(output));
