import { pathToFileURL } from 'node:url';
import { input, join, request, state } from './http-client.mjs';
import { parseOptions, submit, waitUntilTick } from './live.mjs';

export const scenarios = ['remote-pickup', 'stale-ordering', 'forged-fields', 'detector', 'equivalent-valid-traffic'];

export async function runAdversarial(base, scenario) {
  if (!scenarios.includes(scenario)) throw new Error(`Unknown scenario ${scenario}.`);
  const actor = await join(base);
  if (scenario === 'forged-fields') {
    const response = await request(base, '/input', { method: 'POST', token: actor.token, json: { v: 1, seq: 1, move: 'idle', interact: false, score: 999 } });
    return { scenario, response: { status: response.status, data: response.data }, state: await state(base, actor.token) };
  }
  if (scenario === 'stale-ordering') {
    const fresh = await submit(base, actor.token, 2, 'N', false);
    const stale = await input(base, actor.token, 1, 'E', true);
    await waitUntilTick(base, fresh.tick + 1);
    return { scenario, staleDecision: stale.data, state: await state(base, actor.token), note: 'Live timing is observational; owner-clock tests check the exact one-tick invariant.' };
  }
  if (scenario === 'equivalent-valid-traffic') {
    const twin = await join(base);
    const localRendering = { displayedScore: 999 };
    const responses = await Promise.all([actor, twin].map((session) => submit(base, session.token, 1, 'E', false)));
    await waitUntilTick(base, Math.max(...responses.map((response) => response.tick)) + 4);
    return { scenario, localRendering, ordinary: await state(base, actor.token), alteredRendering: await state(base, twin.token), note: 'Both clients send valid intent only. This server cannot infer a local rendering change from those messages.' };
  }
  const attempts = scenario === 'detector' ? 3 : 1;
  for (let seq = 1; seq <= attempts; seq += 1) {
    const admission = await submit(base, actor.token, seq, 'idle', true);
    await waitUntilTick(base, admission.tick + 1);
  }
  return { scenario, state: await state(base, actor.token) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { base, scenario } = parseOptions(process.argv.slice(2), { scenarios });
    process.stdout.write(`${JSON.stringify(await runAdversarial(base, scenario), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Adversarial client failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
