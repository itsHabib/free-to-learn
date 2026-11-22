import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { check, init, loadModule, reader, report } from './shared/project-lab/terminal-lab.mjs';
import { checks as engineChecks } from './lib/checks.mjs';
import { createStore, quantityOver } from './lib/store.mjs';
import { jitMatcher } from './lib/jit-scan.mjs';
import { compare } from './lib/comparison.mjs';
import { append, sync } from './lib/journal.mjs';

const root = fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/, '');
const seedRows = [{id:'A',quantity:20},{id:'B',quantity:42},{id:'C',quantity:null}];

async function main() {
  const args = process.argv.slice(2);
  // A signed quantity is a positional operand in the documented put form.
  const writeOperands = args[0] === 'put' && args.length >= 3 && /^-\d+$/.test(args[2]) ? args.splice(0,3) : [];
  const {values,positionals} = parseArgs({args,allowPositionals:true,options:{
    help:{type:'boolean'},worked:{type:'boolean'},jit:{type:'boolean'},model:{type:'boolean'},all:{type:'boolean'},dir:{type:'string'},
    predict:{type:'string'},'help-used':{type:'string'}
  }});
  const [command,arg,quantity] = values.help ? [] : [...writeOperands,...positionals];
  const folder = values.worked ? 'reference':'work';
  if (command === 'init') return init(root);
  if (command === 'reader') return reader(root,'Build a live query engine',['01','02','03']);
  if (command === 'check') {
    const checks = Object.fromEntries(Object.entries(engineChecks).map(([n,fn])=>[
      n,async where=>fn(await loadModule(root,where,'runtime.mjs'))]));
    return check({root,checks,unit:arg,worked:values.worked,predict:values.predict,helpUsed:values['help-used']});
  }
  const dir = resolve(values.dir ?? join(root,'.orders'));
  const store = createStore(seedRows);
  if (['put','cancel','ship'].includes(command)) {
    if (!arg || (command==='put' && !(quantity === 'null' || /^-?\d+$/.test(quantity ?? '')))) {
      throw Error('Use put ID QUANTITY (signed integer or null), ship ID, or cancel ID.');
    }
    const operation = command === 'put' ? {id:arg,quantity:quantity==='null'?null:Number(quantity)} : {id:arg,delete:true};
    console.log('Committed revision '+append(dir,store,[operation])+' to '+dir);
    return;
  }
  if (!['demo','watch','compare'].includes(command)) {
    console.log('node lab.mjs init | reader | check 01..03 | demo | compare | watch [--all | --jit [--model]] | put ID QUANTITY (integer or null) | ship ID | cancel ID');
    console.log('Watch and writes use the same --dir PATH. Use --worked to run an author example.');
    if (command) process.exitCode=1;
    return;
  }
  const runtime = await loadModule(root,folder,'runtime.mjs');
  if (values.model && !values.jit && command !== 'compare') throw Error('Use --jit --model together.');
  if (values.all && (values.model || values.jit)) throw Error('Choose --all for all open orders, or --jit for the quantity filter.');
  let matcher = values.all ? items=>items.map((_,i)=>i) : quantityOver(30);
  if (values.jit || command==='compare') {
    const jitRoot = resolve(root,'../jit-compiler');
    const {run} = await loadModule(jitRoot,folder,'runtime.mjs');
    const {fixedRule} = await import('../jit-compiler/lib/bakeoff.mjs');
    let choose = fixedRule;
    if (values.model || command==='compare') {
      const {trainChooser} = await import('../jit-compiler/lib/bakeoff.mjs');
      const {feature,chooseLearned} = await loadModule(jitRoot,folder,'policy.mjs');
      const start = performance.now();
      choose = trainChooser({run,feature,chooseLearned});
      console.log('Trained local policy in '+(performance.now()-start).toFixed(1)+' ms');
    }
    if (command==='compare') {
      for (const result of compare(runtime,run,fixedRule,choose)) console.log(JSON.stringify(result));
      console.log('Matched the full rescan at every revision. Timings are local observations.');
      return;
    }
    matcher = jitMatcher(run,{choose,batchSize:256,onTrace:trace=>{
      for (const e of trace) if (e.kind==='decision') console.log('policy '+e.action+' at row '+e.start);
    }});
  }
  if (command==='watch') sync(dir,store);
  const view = runtime.openView(store,matcher);
  console.log('Snapshot '+view.revision+' '+JSON.stringify([...view.rows.values()]));
  function changes() {
    for (const batch of runtime.poll(store,view)) console.log('Revision '+batch.revision+' '+JSON.stringify(batch.events));
  }
  if (command==='demo') {
    store.commit([{id:'A',quantity:45},{id:'B',delete:true}]);
    changes();
    return;
  }
  console.log('Watching '+dir+' · use a second terminal to write. Ctrl-C to stop.');
  const timer = setInterval(()=>{
    try { sync(dir,store); changes(); }
    catch(error) { clearInterval(timer); report(error); }
  },120);
}
main().catch(report);
