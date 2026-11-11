import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyReference, writeBundle } from './trust.mjs';
import { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate } from './core/predictions.mjs';
import { snapshotReference } from './reference-snapshot.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SCAFFOLD = [
  'server.mjs', 'engine.mjs', 'admission.mjs', 'protocol.mjs', 'clock.mjs', 'telemetry/runtime.mjs', 'learning/service.mjs', 'learning/runtime.mjs', 'learning/grade.mjs',
  'clients/http-client.mjs', 'public/index.html', 'public/app.js', 'public/style.css',
  'lab/check.mjs', 'lab/LEARNER.md', 'lab/prompt.json',
];

function learnerPage(bytes) {
  return bytes.toString()
    .replace('<a class="edition" href="/order">NEXT: INPUT ORDER →</a>', '<a class="edition" href="#build-title">SOURCE TASK ↓</a>')
    .replace(/<section class="build-section"[\s\S]*?<\/section>/, '<section class="build-section" aria-labelledby="build-title"><div><p class="eyebrow">03 / BUILD THE DEFENSE</p><h2 id="build-title">Restore a guard.<br>Check the result.</h2><p>Read lab/LEARNER.md and record your predictions in predictions.json before the first check. Edit defense.mjs, then run the command below. The owner-side checker saves each attempt before revealing feedback.</p><code>npm run lab:check -- --assistance none</code></div></section>')
    .replace(/<p><a class="next-lesson" href="\/(?:order|course)">[^<]*<\/a><\/p>/g, '');
}

function learnerBootstrap(bytes) {
  const source = bytes.toString();
  const begin = source.indexOf('// OWNER_CHECK_BEGIN');
  const end = source.indexOf('// OWNER_CHECK_END');
  if (begin < 0 || end < begin) throw new Error('The sealed spatial checker has no separate owner section.');
  return source.slice(0, begin) + source.slice(end + '// OWNER_CHECK_END'.length);
}

export async function prepareSpatialWorkspace({ root }) {
  const destination = join(root, 'artifacts', 'workspace');
  try { await stat(destination); throw new Error(`A workspace already exists at ${destination}. Continue there; existing work was preserved.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const trusted = await verifyReference(root);
  const { bundle, manifestHash } = trusted;
  const original = bundle['defense.mjs'].toString();
  const reference = JSON.parse(bundle['lab/reference.json']);
  if (hash(original) !== reference.sha256 || !original.includes(reference.guard)) throw new Error('Reference changed: prepare refuses to remove an unverified guard. Use a fresh reference checkout.');
  const prompt = JSON.parse(bundle['lab/prompt.json']);
  if (prompt.id !== 'courier-proximity-01' || !Number.isSafeInteger(prompt.version) || prompt.version < 1) throw new Error('Invalid spatial prompt identity.');
  const referenceRoot = await snapshotReference(root, trusted);
  const scaffold = Object.fromEntries(SCAFFOLD.map((path) => {
    if (!bundle[path]) throw new Error(`Sealed scaffold is missing ${path}.`);
    return [path, bundle[path]];
  }));
  scaffold['public/index.html'] = learnerPage(bundle['public/index.html']);
  scaffold['lab/check.mjs'] = learnerBootstrap(bundle['lab/check.mjs']);
  scaffold['defense.mjs'] = original.replace(reference.guard, '// LAB_PROXIMITY_GUARD\n  // TODO: deny interactions outside the inclusive 250 mm radius.');
  const feedback = (await loadPredictionFeedback(referenceRoot, 'spatial')).postCheckFeedback();
  scaffold['predictions.json'] = JSON.stringify(predictionTemplate(feedback, 'spatial'), null, 2) + '\n';
  Object.assign(scaffold, Object.fromEntries(Object.entries(bundle).filter(([path]) => path.startsWith('learning-support/') && path.endsWith('.md'))));
  scaffold['lab/response.md'] = bundle['lab/response-template.md'];
  scaffold['package.json'] = JSON.stringify({
    name: 'courier-spatial-learner-workspace', private: true, type: 'module', engines: { node: '>=22' },
    scripts: { start: 'node server.mjs', 'lab:check': 'node lab/check.mjs', 'lab:practice': 'node lab/check.mjs --fresh' },
  }, null, 2) + '\n';
  scaffold['lab/session.json'] = JSON.stringify({
    created: new Date().toISOString(), reference: reference.sha256, referenceRoot,
    referenceManifest: manifestHash, exercise: prompt.id, prepared: true,
    historyFormat: 'spatial-v2', predictionContract: PREDICTION_CONTRACT,
    prompt: { id: prompt.id, version: prompt.version, sha256: hash(bundle['lab/prompt.json']) },
  }, null, 2) + '\n';
  await mkdir(destination, { recursive: true });
  await writeBundle(destination, scaffold);
  return { destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const { destination } = await prepareSpatialWorkspace({ root });
    console.log(`Created ${destination}\n\ncd "${destination}"\nRead lab/LEARNER.md and complete predictions.json with an answer OR skipReason for each exact question, and keep explanations in lab/response.md BEFORE running a check.\nEdit defense.mjs, then run npm run lab:check -- --assistance none.\n\nThe starter intentionally lacks the proximity guard. Trusted tests, reference answers and manifests stay outside this workspace.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
