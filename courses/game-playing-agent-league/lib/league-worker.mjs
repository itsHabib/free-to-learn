import {parentPort, workerData} from 'node:worker_threads';
import {loadLeagueConfiguration,captureSourceBundle} from './league-config.mjs';
import {createPlan, runLeague} from './league.mjs';
import {sha256} from './identity.mjs';
try {
  const loaded=await loadLeagueConfiguration(workerData.configuration,workerData.root);
  const {config,policies,scenarios}=loaded;
  const plan=createPlan({policies,scenarios,seeds:config.policySeeds,budget:config.budget,partition:config.partition});
  const season=await runLeague({policies,scenarios,plan});
  const after=await captureSourceBundle(workerData.root);
  if(sha256(after.codeManifest)!==sha256(loaded.codeManifest)) throw new Error('Policy/runtime source changed during the league. Run again with a stable source version.');
  season.configuration=config;
  season.configurationHash=loaded.configHash;
  season.codeManifest=loaded.codeManifest;
  season.codeBundle=loaded.codeBundle;
  parentPort.postMessage({ok:true,season});
}catch(error){parentPort.postMessage({ok:false,error:error.message});}
