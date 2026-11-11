import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {validateSeason} from './league.mjs';
import {examplesFromMatches,partitionEpisodes,fitAndEvaluate} from './training.mjs';
import {captureSourceBundle} from './league-config.mjs';
import {sha256} from './identity.mjs';
try {
  const bytes=await readFile(workerData.season,'utf8'),season=JSON.parse(bytes);
  validateSeason(season);
  const {codeManifest,codeBundle}=await captureSourceBundle(workerData.root);
  const {features,fit}=await import(pathToFileURL(join(workerData.root,'learner/value-model.mjs')));
  const examples=examplesFromMatches(season.matches,features);
  const split=partitionEpisodes(examples,{seed:41,fraction:0.75});
  const model=fitAndEvaluate({...split,fit,configuration:{seed:41,epochs:400,learningRate:0.05}});
  const after=await captureSourceBundle(workerData.root);
  if(sha256(after.codeManifest)!==sha256(codeManifest)) throw new Error('Source changed during fitting. Run again with a stable source version.');
  parentPort.postMessage({ok:true,model:{schemaVersion:1,type:'league-value-model',model,codeManifest,codeBundle,
    seasonHash:sha256(bytes),examples:examples.length,trainingScenarioIds:split.trainingScenarioIds,validationScenarioIds:split.validationScenarioIds,
    scenarios:season.matches.map(entry=>entry.record.scenario).filter((scenario,index,array)=>array.findIndex(item=>item.id===scenario.id)===index),
    scope:'A fitted value model on recorded behavior. A low validation loss is not a playing-strength result.'}});
} catch(error) {parentPort.postMessage({ok:false,error:error.message});}
