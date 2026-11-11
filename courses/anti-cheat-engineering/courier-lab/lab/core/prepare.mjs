import { randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREDICTION_CONTRACT, loadPredictionFeedback, predictionTemplate } from './predictions.mjs';
import { moduleFor } from './registry.mjs';
import { snapshotReference } from './snapshot.mjs';
import { jsonBytes, saveJson, sha256, verifyReference, writeBundle } from './trust.mjs';

export async function prepareWorkspace({ root, id, name }) {
  root = await realpath(root);
  const module = moduleFor(id);
  if (name !== undefined && !/^[a-z][a-z0-9-]{0,39}$/.test(name)) throw new Error('Workspace name must use 1–40 lowercase letters, digits or hyphens, starting with a letter.');
  const reference = await verifyReference(root);
  const { bundle, manifestHash } = reference;
  for (const path of Object.entries(module).filter(([key]) => !['id', 'scenario'].includes(key)).map(([, value]) => value)) {
    if (!Object.hasOwn(bundle, path)) throw new Error(`Sealed module is missing ${path}.`);
  }
  const prompt = JSON.parse(bundle[module.prompt]);
  if (!prompt.id || !prompt.version) throw new Error('The prompt must declare an id and version.');
  const referenceRoot = await snapshotReference({ root, ...reference });
  const workspace = join(root, 'artifacts/core', `${id}${name ? `-${name}` : ''}-workspace`);
  await mkdir(dirname(workspace), { recursive: true, mode: 0o700 });
  try { await mkdir(workspace, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`A workspace already exists at ${workspace}. Existing work was preserved.`);
    throw error;
  }
  const hasPredictions = Boolean(bundle[`${id}/feedback.mjs`]);
  const feedback = hasPredictions ? (await loadPredictionFeedback(referenceRoot, id)).postCheckFeedback() : null;
  const sessionId = randomUUID();
  const session = {
    schema: 'courier-core-session-v1', sessionId, module: id,
    ...(hasPredictions ? { predictionContract: PREDICTION_CONTRACT } : {}),
    referenceRoot, referenceManifest: manifestHash,
  };
  const sessionBytes = jsonBytes(session);
  const scaffold = {
    [module.policy]: bundle[module.template],
    [module.guide]: bundle[module.guide],
    [module.prompt]: bundle[module.prompt],
    'response.md': bundle[module.response],
    ...(hasPredictions ? { 'predictions.json': jsonBytes(predictionTemplate(feedback, id)) } : {}),
    ...Object.fromEntries(Object.entries(bundle).filter(([path]) => path.startsWith('learning-support/') && path.endsWith('.md'))),
    'lab/core/check.mjs': bundle['lab/core/check.mjs'],
    'lab/core/session.json': sessionBytes,
    'lab/core/help.json': jsonBytes({ consulted: [], note: 'Record hints, AI help, worked examples or reference consultation here.' }),
    'package.json': jsonBytes({
      name: `courier-${id}-learner-workspace`, private: true, type: 'module',
      engines: { node: '>=22' }, scripts: { 'core:check': 'node lab/core/check.mjs', ...(hasPredictions ? { 'core:practice': 'node lab/core/check.mjs --fresh' } : {}) },
    }),
  };
  if (module.scenario) {
    scaffold[module.scenario] = bundle[module.scenarioTemplate];
    scaffold[module.client] = bundle[module.client];
  }
  const ownerSession = join(referenceRoot, 'artifacts/core/sessions', sessionId);
  await mkdir(ownerSession, { recursive: true, mode: 0o700 });
  await saveJson(join(ownerSession, 'session.json'), {
    ...session, workspace, preparedAt: new Date().toISOString(), sessionHash: sha256(sessionBytes),
    prompt: { id: prompt.id, version: prompt.version, sha256: sha256(bundle[module.prompt]) },
    guideHash: sha256(bundle[module.guide]),
  });
  await writeBundle(workspace, scaffold);
  return { workspace, sessionId, referenceRoot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 && !(process.argv.length === 5 && process.argv[3] === '--name')) throw new Error('Usage: node lab/core/prepare.mjs <module-id> [--name label]');
    const result = await prepareWorkspace({ root: resolve(dirname(fileURLToPath(import.meta.url)), '../..'), id: process.argv[2], name: process.argv[4] });
    console.log(`Created ${result.workspace}\n\ncd "${result.workspace}"\nRead ${process.argv[2]}/LEARNER.md and complete predictions.json (answer OR skipReason for every exact question), its required source files and response.md.\nRun npm run core:check -- --assistance "none" (or describe help used).\n\nReference answers, fixtures and authoritative attempt history remain outside this workspace.`);
  } catch (error) {
    console.error(`Preparation refused: ${error.message}`);
    process.exitCode = 2;
  }
}
