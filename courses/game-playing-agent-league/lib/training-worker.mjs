import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {generateScenario} from './game.mjs';
import {suppliedSnapshots} from './supplied-policies.mjs';
import {selfPlayTraining} from './training.mjs';
import {captureSourceBundle,scenarioGroupKey} from './league-config.mjs';
import {policyDescriptor} from './runner.mjs';
import {sha256} from './identity.mjs';
try {
  const source=await readFile(workerData.configuration,'utf8');
  const config=JSON.parse(source);
  if(config.schemaVersion!==1 || !Array.isArray(config.scenarioSeeds) || config.scenarioSeeds.length<2 || config.scenarioSeeds.length>16) throw new Error('Training configuration needs schemaVersion 1 and 2–16 scenario seeds.');
  const limits={generations:[1,8],gamesPerGeneration:[4,64],budget:[1,256],maxDepth:[1,8],seed:[0,0xffffffff]};
  for(const [key,[min,max]] of Object.entries(limits)) if(!Number.isInteger(config[key])||config[key]<min||config[key]>max) throw new Error(`${key} must be an integer in ${min}..${max}.`);
  const scenarios=config.scenarioSeeds.map(seed=>generateScenario(seed,config.prefixPlies??6));
  if(new Set(scenarios.map(scenarioGroupKey)).size!==scenarios.length) throw new Error('Training scenario roster contains duplicate or reflected positions.');
  const {codeManifest,codeBundle}=await captureSourceBundle(workerData.root);
  const load=file=>import(pathToFileURL(join(workerData.root,'learner',file)));
  const {features,fit}=await load('value-model.mjs');
  const {search}=await load('search.mjs');
  const {sampleOpponent}=await load('opponent-sampler.mjs');
  const opponents=suppliedSnapshots();
  const result=selfPlayTraining({initialPolicy:opponents[1],opponents,scenarios,features,fit,search,sampleOpponent,
    generations:config.generations,gamesPerGeneration:config.gamesPerGeneration,budget:config.budget,seed:config.seed,maxDepth:config.maxDepth,
    sourceIdentityText:JSON.stringify(codeManifest),fitConfiguration:config.fitConfiguration,maxTrainingCredits:5_000_000});
  const after=await captureSourceBundle(workerData.root);
  if(sha256(after.codeManifest)!==sha256(codeManifest)) throw new Error('Source changed during training. This result cannot qualify the saved configuration.');
  parentPort.postMessage({ok:true,training:{schemaVersion:1,type:'league-training',configuration:config,configurationHash:sha256(source),
    codeManifest,codeBundle,scenarios,archive:result.archive.map(policyDescriptor),generations:result.generations,matches:result.matches,
    finalPolicy:policyDescriptor(result.finalPolicy),totalCredits:result.totalCredits,
    scope:'Training evidence. Validation loss and final selection results do not certify playing strength or universal exploitability.'}});
} catch(error) {parentPort.postMessage({ok:false,error:error.message});}
