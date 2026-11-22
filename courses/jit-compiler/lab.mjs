import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { check, init, loadModule, reader, report } from './shared/project-lab/terminal-lab.mjs';
import { checks as engineChecks } from './lib/checks.mjs';
import { checkPolicy } from './lib/policy-check.mjs';
import { race, formatRace } from './lib/bakeoff.mjs';

const root = fileURLToPath(new URL('.',import.meta.url)).replace(/\/$/, '');
const title = 'Build a JIT compiler';
const load = (folder, name) => loadModule(root,folder,name+'.mjs');

async function main() {
  const {values,positionals} = parseArgs({allowPositionals:true, options:{
    help:{type:'boolean'},worked:{type:'boolean'}, predict:{type:'string'}, 'help-used':{type:'string'}, seed:{type:'string'}, shift:{type:'boolean'}
  }});
  const [command,unit] = values.help ? [] : positionals;
  if (command === 'init') return init(root);
  if (command === 'reader') return reader(root,title,['01','02','03','04']);
  const folder = values.worked ? 'reference' : 'work';
  if (command === 'check') {
    const checks = Object.fromEntries(Object.entries(engineChecks).map(([n,fn]) => [n, async where => fn(await load(where,'runtime'))]));
    checks['04'] = async where => checkPolicy(await load(where,'policy'));
    return check({root,unit,checks,worked:values.worked,predict:values.predict,helpUsed:values['help-used']});
  }
  if (command === 'demo') {
    const {run} = await load(folder,'runtime');
    const quantities = [40,18,70,null,31,30];
    const result = run([['load'],['const',30],['gt']],quantities,{batchSize:6,choose:()=> 'compile'});
    console.log('Order quantities  '+JSON.stringify(quantities));
    console.log('Matching indices '+JSON.stringify(result.matches));
    for (const event of result.trace) console.log(JSON.stringify(event));
    return;
  }
  if (command === 'race') {
    const {run} = await load(folder,'runtime');
    const {feature,chooseLearned} = await load(folder,'policy');
    const testSeed = Number(values.seed ?? 901);
    if (!Number.isSafeInteger(testSeed) || testSeed < 0 || testSeed > 0xffffffff) throw Error('Choose an unsigned 32-bit seed.');
    console.log(formatRace(race({run,feature,chooseLearned,testSeed,shift:values.shift ?? false})));
    return;
  }
  console.log('node lab.mjs init | reader | demo [--worked] | check 01..04 [--predict TEXT] [--help-used TEXT] | race [--seed N] [--shift] [--worked]');
  if (command) process.exitCode = 1;
}
main().catch(report);
