import {readFile, readdir} from 'node:fs/promises';
import {resolve, dirname, join, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {generateScenario} from './game.mjs';
import {snapshotPolicy} from './runner.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function scenarioGroupKey(scenario) {
  const state=scenario.state;
  const normal=JSON.stringify([state.currentPlayer,state.board]);
  const mirrored=Array.from({length:25},(_,index)=>state.board[Math.floor(index/5)*5+4-index%5]);
  const reflection=JSON.stringify([state.currentPlayer,mirrored]);
  return normal<reflection?normal:reflection;
}
export async function captureSourceBundle(courseRoot) {
  const codeManifest={},codeBundle={};
  for(const folder of ['lib','learner','checks']) {
    for(const file of (await readdir(join(courseRoot,folder))).sort()) {
      if(!/\.(mjs|json)$/.test(file)) continue;
      const bytes=await readFile(join(courseRoot,folder,file));
      codeManifest[`${folder}/${file}`]=hash(bytes);
      codeBundle[`${folder}/${file}`]=bytes.toString('utf8');
    }
  }
  for(const file of ['cli.mjs','package.json']) {
    const bytes=await readFile(join(courseRoot,file));
    codeManifest[file]=hash(bytes);
    codeBundle[file]=bytes.toString('utf8');
  }
  return {codeManifest,codeBundle};
}
export async function loadLeagueConfiguration(filename, courseRoot) {
  const source = await readFile(filename, 'utf8');
  const config = JSON.parse(source);
  if(config.schemaVersion!==1 || !Array.isArray(config.policies) || config.policies.length<2 || config.policies.length>8) throw new Error('League configuration needs schemaVersion 1 and two to eight policies.');
  if(!Array.isArray(config.scenarioSeeds)||config.scenarioSeeds.length<1||config.scenarioSeeds.length>16) throw new Error('Provide one to sixteen scenario seeds.');
  if(!Array.isArray(config.policySeeds)||config.policySeeds.length<1||config.policySeeds.length>2) throw new Error('Provide one or two policy-randomness seeds.');
  for(const seed of [...config.scenarioSeeds,...config.policySeeds]) if(!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw new Error('All seeds must be unsigned32 integers.');
  if(new Set(config.scenarioSeeds).size!==config.scenarioSeeds.length || new Set(config.policySeeds).size!==config.policySeeds.length) throw new Error('Seed rosters cannot contain duplicates.');
  if(!Number.isInteger(config.budget)||config.budget<0||config.budget>1024) throw new Error('Budget must be an integer from zero through1024.');
  if(!['development','selection','final'].includes(config.partition)) throw new Error('Declare development, selection or final partition.');
  if(config.partition==='final') {
    const required=['random-baseline','greedy-baseline','search','learned-search','historical-learned','counterpolicy'];
    const roles=config.policies.map(entry=>entry.role);
    if(required.some(role=>!roles.includes(role)) || config.scenarioSeeds.length!==16 || config.policySeeds.length!==2 || config.budget!==256) throw new Error('The final course roster requires all six declared policy roles, sixteen independent scenario groups, two policy seeds and a common 256-credit budget. Use development for smaller practice runs. Role declarations still require source review.');
  }
  const root=resolve(courseRoot);
  const {codeManifest,codeBundle}=await captureSourceBundle(root);
  const policies=[];
  for(const entry of config.policies) {
    if(typeof entry.module!=='string'||typeof entry.export!=='string'||typeof entry.name!=='string') throw new Error('Each policy needs name, module and export strings.');
    const path=resolve(dirname(filename),entry.module);
    const within=relative(root,path);
    if(within.startsWith('..'+sep)||within==='..'||!['lib','learner'].some(folder=>within.startsWith(folder+sep))||within.split(sep).length!==2||!within.endsWith('.mjs')) throw new Error('Policy entry modules must be direct .mjs files in this package’s lib/ or learner/ folders so the local code manifest captures them. Nested, external and dynamically loaded policy dependencies are outside this course contract.');
    const loaded=await import(pathToFileURL(path));
    if(typeof loaded[entry.export]!=='function') throw new Error(`No policy export ${entry.export} in ${entry.module}.`);
    const sourceIdentity=JSON.stringify({module:within,export:entry.export,codeManifest});
    policies.push(snapshotPolicy({name:entry.name,decide:loaded[entry.export],source:sourceIdentity,parameters:entry.parameters??{},configuration:entry.configuration??{},metadata:{...entry.metadata,...(entry.role?{role:entry.role}:{})}}));
  }
  const scenarios=config.scenarioSeeds.map(seed=>generateScenario(seed,config.prefixPlies??6));
  const boardKeys=scenarios.map(scenarioGroupKey);
  if(new Set(boardKeys).size!==boardKeys.length) throw new Error('Scenario seeds generated duplicate or reflected starting boards. Choose distinct groups before freezing evaluation.');
  return {config,configHash:hash(source),codeManifest,codeBundle,policies,scenarios};
}
