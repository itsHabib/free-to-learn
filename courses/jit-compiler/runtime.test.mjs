import test from 'node:test';
import assert from 'node:assert/strict';
import * as reference from './reference/runtime.mjs';
import * as starter from './starter/runtime.mjs';
import { checks } from './lib/checks.mjs';
import { replayBug } from './examples/replay-bug.mjs';

for (const [unit, check] of Object.entries(checks)) {
  test('reference passes unit ' + unit, () => check(reference));
  test('starter names its unfinished region for unit ' + unit, () => {
    assert.throws(() => check(starter), /implement/);
  });
}

test('the worked replay bug duplicates the first matching row', () => {
  assert.deepEqual(replayBug(), { failedAt: 1, resumeAt: 0, matches: [0, 0, 2] });
});

test('unit 02 catches a JavaScript stand-in for the generated predicate', () => {
  const fake = program => value => Number(reference.interpret(program, value));
  assert.throws(() => checks['02']({ compile: fake }), TypeError);
});

test('unit 01 catches unconditional rejection of null rows', () => {
  const interpret = (program, value) => value !== null && reference.interpret(program, value);
  assert.throws(() => checks['01']({ interpret }), /actually consume/);
});

test('unit 01 catches JavaScript gt coercing a missing quantity to zero', () => {
  const interpret = (program, value) => {
    const comparesWithGt = program.some(([op]) => op === 'gt');
    return reference.interpret(program, comparesWithGt && value === null ? 0 : value);
  };
  assert.throws(() => checks['01']({ interpret }), /2 > null/);
});

test('unit 01 catches missing values treated as zero inside a band', () => {
  const interpret = (program, value) => {
    const isBand = program.some(([op]) => op === 'and');
    return reference.interpret(program, isBand && value === null ? 0 : value);
  };
  assert.throws(() => checks['01']({ interpret }), /comparisons in the band/);
});

test('unit 01 catches a gt guard that checks only the right operand', async () => {
  const { interpret } = await withChangedRuntime(
    'else if (left === null || right === null)',
    "else if (right === null || (op !== 'gt' && left === null))",
  );
  assert.throws(() => checks['01']({ interpret }), /null > -5/);
});

test('unit 03 catches a replayed index even when the remaining trace looks correct', () => {
  const run = (...args) => {
    const result = reference.run(...args);
    result.matches.unshift(result.matches[0]);
    return result;
  };
  assert.throws(() => checks['03']({ run }), /exactly once/);
});

async function withChangedRuntime(original, replacement) {
  const { readFile } = await import('node:fs/promises');
  const file = new URL('./reference/runtime.mjs', import.meta.url);
  const source = await readFile(file, 'utf8');
  assert.ok(source.includes(original), 'Find the source to replace');
  const mutant = source
    .replace(original, replacement)
    .replace(/from '(\.\.\/lib\/[^']+)'/g, (_, path) => "from '" + new URL(path, file).href + "'");
  return import('data:text/javascript,' + encodeURIComponent(mutant));
}

test('unit 03 catches interpreting rows while reporting them as compiled', async () => {
  const { run } = await withChangedRuntime(
    'if (predicate(values[row])) matches.push(row);',
    'if (evaluate(program, values[row])) matches.push(row);',
  );
  const args = [[['load'], ['const', 30], ['gt']], [45, null, 46], { choose: () => 'compile' }];
  assert.deepEqual(run(...args), reference.run(...args), 'The claimed trace and output still look correct');
  assert.throws(() => checks['03']({ run }), /Call the supplied Wasm predicate/);
});

test('unit 03 catches converting a missing quantity to zero only during fallback', async () => {
  const { run } = await withChangedRuntime(
    'if (evaluate(program, values[row])) matches.push(row);',
    'if (evaluate(program, values[row] ?? 0)) matches.push(row);',
  );
  assert.throws(() => checks['03']({ run }), /Guarded fallback must preserve the missing operand/);
});

test('each worked JavaScript listing matches its executable source region', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  for (const unit of ['01', '02', '03']) {
    const lesson = await read('./lessons/' + unit + '.md');
    const listings = [...lesson.matchAll(/<!-- code-example (.+?) -->\n```js [^\n]*\n([\s\S]*?)\n```\n<!-- \/code-example -->/g)];
    assert.equal(listings.length, 1, 'Expected the worked listing for lesson ' + unit);
    const [, metadata, shown] = listings[0];
    const { file, region } = JSON.parse(metadata);
    const lines = (await read('./' + file)).split('\n');
    const start = lines.findIndex(line => line.trim() === '// region: ' + region);
    const end = lines.findIndex(line => line.trim() === '// endregion: ' + region);
    assert.ok(start >= 0 && end > start);
    assert.equal(shown, lines.slice(start + 1, end).join('\n'));
  }
});

test('independent shard checker detects an offset based on previous matches', async () => {
  const { checkShards } = await import('./examples/check-shards.mjs');
  const scan = (program, shards, options, countMatches) => {
    const global = [];
    let base = 0;
    for (const shard of shards) {
      const { matches } = reference.run(program, shard, options);
      global.push(...matches.map(local => base + local));
      base += countMatches ? matches.length : shard.length;
    }
    return global;
  };
  checkShards((...args) => scan(...args, false));
  assert.throws(() => checkShards((...args) => scan(...args, true)), /nonmatching rows/);
});

test('the long generated filter crosses one-byte function length encodings', () => {
  const limits = Array.from({ length: 40 }, (_, index) => index === 20 ? 80 : index - 50);
  const program = [];
  for (const [index, limit] of limits.entries()) {
    program.push(['load'], ['const', limit], ['gt']);
    if (index) program.push(['and']);
  }
  const predicate = reference.compile(program);
  for (const row of [-90, 79, 80, 81]) {
    const expected = limits.every(limit => row > limit);
    assert.equal(predicate(row), Number(expected));
    assert.equal(reference.interpret(program, row), expected);
  }
});

test('the transfer checker rejects a single flattened scan', async () => {
  const {checkShards} = await import('./examples/check-shards.mjs');
  assert.throws(() => checkShards((program,shards,options) =>
    reference.run(program,shards.flat(),options).matches), /own query/);
});

test('the transfer checker sees each per-shard batch, including a short tail',async()=>{
  const {checkShards}=await import('./examples/check-shards.mjs');
  function dropSize(program,shards,{choose}) {
    let offset=0;
    return shards.flatMap(shard=>{
      const ids=reference.run(program,shard,{choose}).matches.map(i=>i+offset);
      offset+=shard.length;
      return ids;
    });
  }
  assert.throws(()=>checkShards(dropSize),/batch size/);
});

test('the lesson figures match what tools/figures.mjs draws from the course code', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  execFileSync(process.execPath, ['tools/figures.mjs', '--check'], { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'pipe' });
});
