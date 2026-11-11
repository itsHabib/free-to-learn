import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {validateSeason} from './league.mjs';
import {captureSourceBundle} from './league-config.mjs';
import {sha256} from './identity.mjs';
try {
  const season=JSON.parse(await readFile(workerData.season,'utf8'));
  validateSeason(season);
  const {codeManifest,codeBundle}=await captureSourceBundle(workerData.root);
  const {summarize}=await import(pathToFileURL(join(workerData.root,'learner/report.mjs')));
  const report=await summarize(season.matches,season.plan);
  if(!report || typeof report!=='object') throw new Error('summarize must return a report object.');
  const after=await captureSourceBundle(workerData.root);
  if(sha256(after.codeManifest)!==sha256(codeManifest)) throw new Error('Source changed during report computation. Run again with a stable version.');
  parentPort.postMessage({ok:true,report,codeManifest,codeBundle});
} catch(error) {parentPort.postMessage({ok:false,error:error.message});}
