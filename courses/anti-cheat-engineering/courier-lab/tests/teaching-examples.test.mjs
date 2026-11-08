import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { withServer } from './harness.mjs';

// Execute the exact published example, not a second hand-maintained copy.
const guide = await readFile(new URL('../lab/order/LEARNER.md', import.meta.url), 'utf8');
const example = guide.match(/```js\n(import assert from 'node:assert\/strict';[\s\S]*?)\n```/);
assert.ok(example, 'the guide must include its complete worked example');
const source = example[1].replace('./clients/http-client.mjs', new URL('../clients/http-client.mjs', import.meta.url).href);
const { scenario } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const seed of [17, 31, 99]) {
  test(`published M1-to-M3 worked assertion executes against owned HTTP, seed ${seed}`, async () => {
    await withServer(scenario, { seed });
  });
}
test('published example detects wrong cargo, even though HTTP succeeds', async () => {
  await withServer(async (server) => {
    await assert.rejects(scenario(server), { name: 'AssertionError', message: /remote pickup must not grant cargo/ });
  }, { mutant: 'omit-proximity' });
});
