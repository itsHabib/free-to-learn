import {parentPort, workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {verifyReplay, verifyPolicyRerun} from './runner.mjs';
import {validateSeason} from './league.mjs';
import {loadLeagueConfiguration,captureSourceBundle} from './league-config.mjs';
import {sha256} from './identity.mjs';

try {
  const bytes = await readFile(workerData.record);
  if(bytes.length > 128 * 1024 * 1024) throw new Error('Record exceeds the 128 MiB local verification limit.');
  const record = JSON.parse(bytes);
  const matches = record.type === 'league-season' ? record.matches.map(entry => entry.record) : [record];
  if(matches.length > 1792) throw new Error('Record exceeds the bounded 1,792-match course roster.');
  if(record.type === 'league-season') validateSeason(record);
  else verifyReplay(record);
  let policyRerun = false;
  if(workerData.configuration) {
    const loaded = await loadLeagueConfiguration(workerData.configuration, workerData.root);
    if(record.codeManifest && sha256(record.codeManifest) !== sha256(loaded.codeManifest)) throw new Error('Current code differs from the recorded source manifest. Restore the exact recorded version before policy rerun.');
    const snapshots = new Map(loaded.policies.map(policy => [policy.id, policy]));
    for(const match of matches) {
      const policies = match.policySnapshots.map(policy => snapshots.get(policy.id));
      if(policies.some(policy => !policy)) throw new Error('The configuration does not reconstruct every recorded policy identity.');
      verifyPolicyRerun(match, policies);
    }
    const after=await captureSourceBundle(workerData.root);
    if(sha256(after.codeManifest)!==sha256(loaded.codeManifest)) throw new Error('Source changed during policy rerun. No stable-source verification is claimed.');
    policyRerun = true;
  }
  parentPort.postMessage({ok:true,matches:matches.length,trajectoryReplay:true,policyRerun,
    scope:policyRerun ? 'Exact current policy snapshots reproduced every recorded decision and simulation-credit count.' : 'Recorded actions reproduce the game trajectory. Policy source execution has not been verified.'});
} catch(error) { parentPort.postMessage({ok:false,error:error.message}); }
