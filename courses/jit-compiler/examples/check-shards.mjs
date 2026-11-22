import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkShards(scanShards) {
  const threshold = [['load'], ['const', 3], ['gt']];
  const always = [['const', 0], ['const', 0], ['eq']];
  const bounds = [];
  const observe = ({start,end,remainingRows}) => {
    bounds.push([start,end,remainingRows]);
    return 'interpret';
  };
  scanShards(threshold, [[3,8],[],[4],[7,2,1]], {choose:observe,batchSize:2});
  assert.deepEqual(bounds,[[0,2,2],[0,1,1],[0,2,3],[2,3,1]],
    'Each nonempty shard must start its own query and honor the caller’s batch size');
  for (const choose of [() => 'interpret', () => 'compile']) {
    const options = { choose, batchSize: 2 };
    assert.deepEqual(scanShards(threshold, [[], [0, 1], [4, null], [], [4, 0, 5]], options),
      [2, 4, 6], 'Earlier nonmatching rows occupy positions in the original tape');
    assert.deepEqual(scanShards(always, [[null], [], [4, 4, null], []], options),
      [0, 1, 2, 3], 'Translate every local index once, including the null that breaks a guard');
    assert.deepEqual(scanShards(threshold, [], options), [], 'An empty shard list has zero matches');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const module = await import(pathToFileURL(resolve(process.argv[2] ?? 'work/shards.mjs')).href);
    checkShards(module.scanShards);
    console.log('PASS shard transfer');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
