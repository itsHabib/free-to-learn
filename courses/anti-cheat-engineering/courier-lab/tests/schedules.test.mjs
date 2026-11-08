import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIVERY_SCHEDULES, runDeliverySchedule } from '../clients/schedules.mjs';
import { withServer } from './harness.mjs';

for (const seed of [17, 31, 99]) {
  for (const name of DELIVERY_SCHEDULES) {
    test(`HTTP delivery schedule ${name}, seed ${seed}`, async () => {
      await withServer(async (server) => {
        const result = await runDeliverySchedule(server, name, { seed });
        assert.equal(result.name, name);
        assert.equal(result.seed, seed);
        assert.ok(result.checkpoints.length >= 3);
        assert.equal(new Set(result.checkpoints.map((checkpoint) => checkpoint.name)).size, result.checkpoints.length);
      }, { seed });
    });
  }
}

test('schedule fixtures reject unsupported names and seeds explicitly', async () => {
  await assert.rejects(runDeliverySchedule({}, 'invented'), /Unknown delivery schedule/);
  await assert.rejects(runDeliverySchedule({}, 'expiry-gap', { seed: 123 }), /No hand-authored schedule fixture/);
});
