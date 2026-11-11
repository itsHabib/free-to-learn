// Local reliability boundary only. A Node worker is not a hostile-code sandbox.
import {parentPort, workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
try {
  const checks = await import('../checks/index.mjs');
  let result;
  if (workerData.module === '1') {
    const {chooseAction} = await import(pathToFileURL(join(workerData.root, 'learner/baseline.mjs')));
    result = await checks.checkBaseline(chooseAction);
  } else if (['2', 'evaluation', 'search'].includes(workerData.module)) {
    const {evaluate} = await import(pathToFileURL(join(workerData.root, 'learner/evaluation.mjs')));
    if (workerData.module === 'evaluation') result = await checks.checkEvaluation(evaluate);
    else {
      const {search} = await import(pathToFileURL(join(workerData.root, 'learner/search.mjs')));
      if (workerData.module === 'search') result = await checks.checkSearch(search, {evaluate});
      else {
        result = {evaluation: await checks.checkEvaluation(evaluate), search: await checks.checkSearch(search, {evaluate})};
        result.ok = result.evaluation.ok && result.search.ok;
      }
    }
  } else {
    const advanced = await import('../checks/advanced.mjs');
    const load = file => import(pathToFileURL(join(workerData.root, 'learner', file)));
    if (workerData.module === '3') result = await advanced.checkValueModel(await load('value-model.mjs'));
    if (workerData.module === '4') result = await advanced.checkReport((await load('report.mjs')).summarize);
    if (workerData.module === '5') result = await advanced.checkSampler((await load('opponent-sampler.mjs')).sampleOpponent);
    if (workerData.module === '6') {
      const implementation=await load('vulnerability.mjs');
      const gap=await advanced.checkGap(implementation.nashGap);
      const response=await advanced.checkResponse(implementation.responsePolicy);
      result={ok:gap.ok&&response.ok,gap,response};
    }
  }
  parentPort.postMessage(result);
} catch (error) {
  parentPort.postMessage({ok: false, error: error.message, scope: 'Learner code failed to load or run. The source attempt remains saved.'});
}
