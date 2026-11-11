import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  InvariantViolation, assertRemotePickupInvariant, assertStaleOrderingInvariant,
  honestWin, probeRemotePickup, probeStaleOrdering,
} from '../clients/scenarios.mjs';
import { withServer } from './harness.mjs';

const cases = [
  { name: 'omit-proximity', code: 'REMOTE_PICKUP', probe: probeRemotePickup, check: assertRemotePickupInvariant },
  { name: 'omit-sequence', code: 'STALE_DIRECTION', probe: probeStaleOrdering, check: assertStaleOrderingInvariant },
];

export async function runNegativeControls({ entry } = {}) {
  // A broken baseline cannot validate a negative control.
  await withServer(async (server) => {
    await honestWin(server);
    for (const item of cases) item.check(await item.probe(server));
  }, { entry });
  const results = [];
  for (const item of cases) {
    const result = await withServer(async (server) => {
      // A functioning legal game is required even when a guard is removed.
      await honestWin(server);
      const observed = await item.probe(server);
      let violation;
      try { item.check(observed); } catch (error) { violation = error; }
      assert.ok(violation instanceof InvariantViolation, `${item.name} must fail its authoritative state invariant; crashes or unrelated assertions are not kills`);
      assert.equal(violation.code, item.code);
      return {
        mutant: item.name, outcome: 'killed', invariant: violation.code,
        legalDelivery: 'passed', observed: observed.after,
      };
    }, { mutant: item.name, entry });
    results.push(result);
  }
  return { baseline: 'passed', controls: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runNegativeControls(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Negative controls failed: ${error.stack}\n`);
    process.exitCode = 1;
  }
}
