import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveJson, verifyReference, writeBundle } from '../trust.mjs';
import { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate } from '../core/predictions.mjs';
import { snapshotReference } from '../reference-snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = join(root, 'artifacts/order-workspace');
try {
  await stat(destination);
  console.error(`A workspace already exists at ${destination}. Existing work was preserved.`);
  process.exitCode = 1;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const trusted = await verifyReference(root);
  const { bundle, manifestHash } = trusted;
  const referenceRoot = await snapshotReference(root, trusted);
  const names = ['server.mjs', 'engine.mjs', 'defense.mjs', 'protocol.mjs', 'clock.mjs', 'telemetry/runtime.mjs', 'learning/service.mjs', 'learning/runtime.mjs', 'learning/grade.mjs',
    'clients/http-client.mjs', 'lab/order/check.mjs', 'lab/order/LEARNER.md', 'lab/order/prompt.json', 'lab/order/seeds.json',
    ...Object.keys(bundle).filter((name) => name.startsWith('public/'))];
  const scaffold = Object.fromEntries(names.map((name) => {
    if (!bundle[name]) throw new Error(`Sealed scaffold is missing ${name}`);
    return [name, bundle[name]];
  }));
  scaffold['admission.mjs'] = bundle['lab/order/admission-template.mjs'];
  scaffold['learner-scenario.mjs'] = bundle['lab/order/scenario-template.mjs'];
  const feedback = (await loadPredictionFeedback(referenceRoot, 'order')).postCheckFeedback();
  scaffold['predictions.json'] = JSON.stringify(predictionTemplate(feedback, 'order'), null, 2) + '\n';
  Object.assign(scaffold, Object.fromEntries(Object.entries(bundle).filter(([path]) => path.startsWith('learning-support/') && path.endsWith('.md'))));
  scaffold['response.md'] = bundle['lab/order/response-template.md'];
  scaffold['package.json'] = JSON.stringify({
    name: 'courier-order-learner-workspace', private: true, type: 'module', engines: { node: '>=22' },
    scripts: { start: 'node server.mjs', 'order:check': 'node lab/order/check.mjs', 'order:practice': 'node lab/order/check.mjs --fresh' },
  }, null, 2) + '\n';
  scaffold['lab/order/help.json'] = Buffer.from(JSON.stringify({ consulted: [], note: 'Record hints, AI help, worked examples or reference consultation here.' }, null, 2) + '\n');
  await mkdir(destination, { recursive: true });
  await writeBundle(destination, scaffold);
  await saveJson(join(destination, 'lab/order/session.json'), {
    prepared: true, exercise: 'courier-order-01', created: new Date().toISOString(),
    referenceRoot, referenceManifest: manifestHash, predictionContract: PREDICTION_CONTRACT,
  });
  console.log(`Created ${destination}\n\ncd "${destination}"\nRead lab/order/LEARNER.md. Complete predictions.json with an answer OR skipReason for every exact question. Edit admission.mjs, learner-scenario.mjs and response.md.\nThen run: node lab/order/check.mjs --assistance "none"\n\nThe reference answers and owner-side judges are outside this workspace.`);
}
