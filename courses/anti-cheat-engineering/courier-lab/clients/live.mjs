import { performance } from 'node:perf_hooks';
import { input, join, localEndpoint, request, state } from './http-client.mjs';

export function parseOptions(argv, { scenarios = [] } = {}) {
  let base = 'http://127.0.0.1:8787';
  let scenario = scenarios[0];
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${name}.`);
    if (name === '--url') { base = value; continue; }
    if (name === '--port' && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) {
      base = `http://127.0.0.1:${value}`;
      continue;
    }
    if (name === '--scenario' && scenarios.includes(value)) { scenario = value; continue; }
    throw new Error(`Unsupported option ${name} ${value}.`);
  }
  localEndpoint(base);
  return { base, scenario };
}

export async function waitUntilTick(base, target, timeout = 3000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const response = await request(base, '/health');
    if (response.status !== 200 || !Number.isSafeInteger(response.data?.tick)) throw new Error('Health endpoint did not return a tick.');
    if (response.data.tick >= target) return response.data.tick;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Server clock did not advance. Start the normal server without --test.');
}

export async function submit(base, token, seq, move, interact) {
  const result = await input(base, token, seq, move, interact);
  if (result.status !== 200 || result.data?.status !== 'admitted') throw new Error(`Valid client input failed: ${result.text}`);
  return result.data;
}

export async function runLiveHonest(base) {
  const actor = await join(base);
  const deadline = performance.now() + 30000;
  for (let seq = 1; seq <= 120 && performance.now() < deadline; seq += 1) {
    const current = await state(base, actor.token);
    if (current.actor.score >= 1) return { scenario: 'honest-delivery', outcome: 'delivered', state: current };
    const target = current.actor.cargo ? current.depot : current.core;
    const dx = target.x - current.actor.x;
    const dy = target.y - current.actor.y;
    const inRange = dx * dx + dy * dy <= 62500;
    const interact = inRange && current.tick >= current.actor.nextInteractTick;
    const move = inRange ? 'idle' : toward(dx, dy);
    const admission = await submit(base, actor.token, seq, move, interact);
    await waitUntilTick(base, admission.tick + 1);
  }
  throw new Error('Honest delivery did not complete within 120 inputs and 30 seconds.');
}

function toward(dx, dy) {
  if (dx > 0) return 'E';
  if (dx < 0) return 'W';
  if (dy > 0) return 'S';
  return 'N';
}
