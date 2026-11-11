import {readFile} from 'node:fs/promises';
import {relative,dirname,join} from 'node:path';
import {captureSourceBundle,scenarioGroupKey} from './league-config.mjs';
import {generateScenario} from './game.mjs';
import {sha256} from './identity.mjs';

export async function makeDevelopmentRoster(filename,destination,root) {
  const bytes=await readFile(filename,'utf8'),artifact=JSON.parse(bytes);
  if(!['league-value-model','league-training'].includes(artifact.type)) throw new Error('Expected a fitted value model or completed population-training artifact.');
  const current=await captureSourceBundle(root);
  for(const file of ['learner/value-model.mjs','learner/search.mjs','lib/training.mjs','lib/game.mjs']) {
    if(current.codeManifest[file]!==artifact.codeManifest[file]) throw new Error(`Model-producing dependency ${file} changed. Refit with current code or restore the original dependency before constructing a roster.`);
  }
  const module=file=>relative(dirname(destination),join(root,file)).split('\\').join('/');
  const learned=artifact.type==='league-training'?artifact.generations.at(-1):{model:artifact.model,snapshot:{id:sha256(artifact.model)}};
  const base=[
    {name:'supplied-random',role:'random-baseline',module:module('lib/supplied-policies.mjs'),export:'randomPolicy'},
    {name:'supplied-greedy',role:'greedy-baseline',module:module('lib/supplied-policies.mjs'),export:'greedyPolicy'},
    {name:'learner-search',role:'search',module:module('learner/league-policy.mjs'),export:'decide',parameters:{maxDepth:3}},
    {name:'learner-learned-search',role:'learned-search',module:module('learner/learned-policy.mjs'),export:'decide',parameters:{maxDepth:3,weights:learned.model.weights},metadata:{sourceArtifactHash:sha256(bytes),sourceSnapshotId:learned.snapshot.id}},
  ];
  if(artifact.type==='league-training') {
    if(artifact.generations.length<2) throw new Error('A population roster needs at least two learned generations so the historical role is real.');
    const historical=artifact.generations[0];
    base.push({name:'historical-learned-search',role:'historical-learned',module:module('learner/learned-policy.mjs'),export:'decide',parameters:{maxDepth:3,weights:historical.model.weights},metadata:{sourceArtifactHash:sha256(bytes),sourceSnapshotId:historical.snapshot.id}},
      {name:'learner-counter-greedy',role:'counterpolicy',module:module('learner/counter-policy.mjs'),export:'decide',parameters:{maxDepth:3,opponentModel:'greedy'}});
  }
  const used=new Set((artifact.scenarios??[]).map(scenarioGroupKey)),scenarioSeeds=[];
  for(let seed=701;scenarioSeeds.length<3&&seed<10000;seed++) {
    const key=scenarioGroupKey(generateScenario(seed,6));
    if(!used.has(key)){scenarioSeeds.push(seed);used.add(key);}
  }
  return {schemaVersion:1,partition:'development',budget:256,prefixPlies:6,scenarioSeeds,policySeeds:[13],policies:base,
    _note:'Supplied assembly only. This is a small development roster with new scenario groups. A six-role final roster, frozen selection protocol and independent review remain separate requirements.'};
}
