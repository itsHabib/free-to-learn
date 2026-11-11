import { open, unlink } from 'node:fs/promises';
import { dirname, basename, resolve, join } from 'node:path';
import { regularFile, saveJson, verifyReference } from '../lab/core/trust.mjs';
import { readJsonFile } from './read-json.mjs';
import { pathToFileURL } from 'node:url';
import { measureRetention, createSyntheticWorkload } from '../retention/measure.mjs';
import { writeExport, deleteExport } from '../retention/store.mjs';

async function sourceAt(path) {
  const absolute = resolve(path);
  return (await regularFile(dirname(absolute), basename(absolute))).toString('utf8');
}
async function capturedModule(source) {
  // Exact captured bytes are imported, not a second read of the learner's path.
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
async function saveOperation(path, operation) {
  const file = await open(resolve(path), 'wx', 0o600);
  try {
    const result = await operation();
    await file.writeFile(JSON.stringify(result, null, 2) + '\n');
    return result;
  } catch (error) {
    await file.close();
    await unlink(resolve(path));
    throw error;
  } finally { await file.close(); }
}
async function custodyFor(workspace) {
  const session = JSON.parse(await regularFile(resolve(workspace), 'lab/core/session.json'));
  if (session.schema !== 'courier-core-session-v1' || session.module !== 'evaluation' || typeof session.referenceRoot !== 'string') throw new Error('Use a prepared evaluation workspace.');
  const { bundle } = await verifyReference(session.referenceRoot, session.referenceManifest);
  if (!bundle['evaluation/custody.mjs']) throw new Error('This earlier workspace has no evaluation custody. Preserve it and prepare a fresh named evaluation workspace.');
  return import(pathToFileURL(join(session.referenceRoot, 'evaluation/custody.mjs')));
}

function measurementOptions(args) {
  const settings = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === '--warmup' || item === '--samples') {
      const key = item.slice(2);
      if (Object.hasOwn(options, key) || args[index + 1] === undefined) throw new Error(`Supply ${item} once with an integer.`);
      options[key] = Number(args[++index]);
      continue;
    }
    if (!/^\d+:\d+:\d+$/.test(item)) throw new Error('Each retention setting must be nowTick:maxAgeTicks:maxEvents.');
    const [nowTick, maxAgeTicks, maxEvents] = item.split(':').map(Number);
    settings.push({ nowTick, maxAgeTicks, maxEvents });
  }
  return { ...options, ...(settings.length ? { settings } : {}) };
}

export async function runAnalysisCli(args) {
  const [action, ...rest] = args;
  if (action === 'explore' && rest.length === 4) {
    const [workspace, threshold, windowTicks, minDistanceMm] = rest;
    const api = await custodyFor(workspace);
    return api.explore({ workspace, settings: { threshold: Number(threshold), windowTicks: Number(windowTicks), minDistanceMm: Number(minDistanceMm) } });
  }
  if (action === 'plan' && (rest.length === 4 || (rest.length === 6 && rest[4] === '--revision'))) {
    const [workspace, threshold, windowTicks, minDistanceMm, , revisionReason] = rest;
    const api = await custodyFor(workspace);
    return api.plan({ workspace, settings: { threshold: Number(threshold), windowTicks: Number(windowTicks), minDistanceMm: Number(minDistanceMm) }, revisionReason });
  }
  if (action === 'run' && rest.length === 2) {
    const [workspace, planId] = rest;
    const api = await custodyFor(workspace);
    return api.run({ workspace, planId });
  }
  if (action === 'measure' && rest.length >= 2) {
    const source = await sourceAt(rest[0]);
    const candidate = await capturedModule(source);
    if (typeof candidate.retain !== 'function') throw new Error('Policy must export retain.');
    const report = measureRetention({ policy: candidate.retain, ...measurementOptions(rest.slice(2)) });
    await saveJson(resolve(rest[1]), report);
    return { path: resolve(rest[1]), report };
  }
  if (action === 'export' && rest.length === 5) {
    const [policyPath, output, receiptPath, maxAgeTicks, maxEvents] = rest;
    const candidate = await capturedModule(await sourceAt(policyPath));
    if (typeof candidate.retain !== 'function') throw new Error('Policy must export retain.');
    const workload = createSyntheticWorkload();
    const receipt = await saveOperation(receiptPath, () => writeExport(output, workload.events, { nowTick: 4095, maxAgeTicks: Number(maxAgeTicks), maxEvents: Number(maxEvents) }, { policy: candidate.retain }));
    return { receiptPath: resolve(receiptPath), receipt };
  }
  if (action === 'delete' && rest.length === 2) {
    const receipt = await readJsonFile(resolve(rest[0]));
    const result = await saveOperation(rest[1], () => deleteExport(receipt));
    return result;
  }
  throw new Error('Usage: analysis-cli.mjs explore <evaluation-workspace> <threshold> <windowTicks> <minDistanceMm> | plan <evaluation-workspace> <threshold> <windowTicks> <minDistanceMm> [--revision "reason"] | run <evaluation-workspace> <plan-id> | measure <policy.mjs> <new-report.json> [nowTick:maxAgeTicks:maxEvents ...] [--warmup N] [--samples N] | export <policy.mjs> <new-export.json> <new-receipt.json> <maxAgeTicks> <maxEvents> | delete <receipt.json> <new-deletion.json>. Only run code you intend to execute locally.');
}
if (process.argv[1]?.endsWith('analysis-cli.mjs')) {
  try { console.log(JSON.stringify(await runAnalysisCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(`Analysis refused: ${error.message}`); process.exitCode = 2; }
}
