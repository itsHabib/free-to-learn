import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { correctPolicies, wrongPolicies } from '../integrity/controls.mjs';
import { assess, FIXTURE_RUNTIME_PATHS, integrityCases, writeCompatibleUpdate } from '../integrity/fixtures.mjs';
import { observePackage } from '../integrity/package.mjs';
import { checkPackage } from '../integrity/policy.mjs';
import * as template from '../integrity/template.mjs';

async function directory(run) {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'ivy-integrity-test-')));
  try {
    return await run(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}

for (const control of correctPolicies) {
  test(`independent correct control passes all criteria: ${control.name}`, async () => {
    const result = await assess(control);
    assert.equal(result.passed, true, JSON.stringify(result.criteria.filter((criterion) => !criterion.passed)));
    assert.ok(result.criteria.length >= 25);
  });
}

const wrongTargets = {
  'always-verified': 'actual runtime byte change',
  'always-refused': 'approved runtime bytes',
  'release-only': 'actual runtime byte change',
  'trust-observed-digests': 'actual runtime byte change',
  'ignore-missing-files': 'missing runtime file',
  'ignore-extra-files': 'extra runtime file',
  'ignore-release-support': 'unsupported release',
  'version-one-only': 'approved compatible update',
  'erase-manifest-duplicates': 'duplicate approved path',
  'sort-input-in-place': 'inventory order is irrelevant',
};

for (const control of wrongPolicies) {
  test(`behavioral calibration rejects ${control.name} without crashing`, async () => {
    const result = await assess(control);
    assert.equal(result.passed, false);
    assert.ok(result.criteria.some((criterion) => !criterion.passed && criterion.error.message.includes('LEARNER.md')));
    assert.equal(result.criteria.find((criterion) => criterion.name === wrongTargets[control.name]).passed, false,
      `the intended defect must fail its corresponding criterion: ${control.name}`);
  });
}

test('the incomplete learner template returns failed criteria rather than a fake pass', async () => {
  const result = await assess(template);
  assert.equal(result.passed, false);
  assert.equal(result.criteria.find((criterion) => criterion.name === 'approved runtime bytes').passed, false);
});

test('failed verdict feedback preserves expected and actual values after JSON serialization', async () => {
  const assessed = await assess(wrongPolicies.find((policy) => policy.name === 'always-verified'));
  const result = JSON.parse(JSON.stringify(assessed));
  const failure = result.criteria.find((criterion) => criterion.name === 'actual runtime byte change');
  assert.deepEqual(failure.error.expected, { ok: false, reason: 'digest' });
  assert.deepEqual(failure.error.actual, { ok: true, reason: 'verified' });
  assert.equal(failure.error.code, 'ERR_ASSERTION');
  assert.equal(failure.error.operator, 'deepStrictEqual');
  assert.match(failure.error.message, /old approved reference must refuse changed engine.mjs bytes/);
  assert.match(failure.error.message, /LEARNER.md#decide-in-order/);
});

test('mutation feedback preserves the original and changed inventory', async () => {
  const assessed = await assess(wrongPolicies.find((policy) => policy.name === 'sort-input-in-place'));
  const result = JSON.parse(JSON.stringify(assessed));
  const failure = result.criteria.find((criterion) => criterion.name === 'inventory order is irrelevant');
  assert.notDeepEqual(failure.error.actual.observed, failure.error.expected.observed);
  assert.deepEqual(failure.error.actual.observed, [...failure.error.expected.observed].reverse());
  assert.match(failure.error.message, /must not mutate its inputs/);
  assert.match(failure.error.message, /LEARNER.md#your-editable-policy/);
});

test('a missing returned verdict is retained explicitly in JSON feedback', async () => {
  const result = JSON.parse(JSON.stringify(await assess({ checkPackage() {} })));
  const failure = result.criteria.find((criterion) => criterion.name === 'approved runtime bytes');
  assert.deepEqual(failure.error.expected, { ok: true, reason: 'verified' });
  assert.deepEqual(failure.error.actual, { type: 'undefined' });
});

test('the grader distinguishes a crashing candidate from a returned wrong verdict', async () => {
  await assert.rejects(assess({ checkPackage() { throw new Error('candidate failed to run'); } }), /candidate failed to run/);
  await assert.rejects(assess({}), /must export checkPackage/);
});

test('real engine byte changes refuse the old reference and allow a separately approved update', async () => {
  const cases = await integrityCases();
  const original = cases.find((item) => item.name === 'approved runtime bytes');
  const changed = cases.find((item) => item.name === 'actual runtime byte change');
  const update = cases.find((item) => item.name === 'approved compatible update');
  assert.deepEqual(original.input.observed.map((file) => file.path).sort(), [...FIXTURE_RUNTIME_PATHS].sort());
  assert.notEqual(original.input.observed.find((file) => file.path === 'engine.mjs').sha256,
    changed.input.observed.find((file) => file.path === 'engine.mjs').sha256);
  assert.deepEqual(checkPackage(original.input), { ok: true, reason: 'verified' });
  assert.deepEqual(checkPackage(changed.input), { ok: false, reason: 'digest' });
  assert.deepEqual(checkPackage(update.input), { ok: true, reason: 'verified' });
});

test('the compatible release actually increases bounded history without changing initial gameplay', async () => {
  const project = fileURLToPath(new URL('../', import.meta.url));
  await directory(async (root) => {
    await writeCompatibleUpdate(project, root);
    const updated = await import(pathToFileURL(join(root, 'engine.mjs')));
    const world = updated.createWorld(17);
    const actor = updated.join(world);
    assert.deepEqual([actor.x, actor.y, actor.score, actor.cargo], [1000, 1000, 0, false]);
    for (let index = 0; index < 50; index += 1) updated.advance(world, 100);
    assert.equal(world.tick, 5000);
    assert.equal(world.history.length, 5001, 'the older 4096-entry limit would have discarded history');
    assert.equal(world.dropped, 0);
    for (let index = 0; index < 40; index += 1) updated.advance(world, 100);
    assert.equal(world.history.length, 8192, 'the update must still have a finite limit');
    assert.equal(world.dropped, 809);
  });
});

test('policy refuses malformed top-level shapes without throwing', () => {
  for (const value of [undefined, null, [], {}, { manifest: null, observed: [], supported: [] }]) {
    assert.deepEqual(checkPackage(value), { ok: false, reason: 'schema' });
  }
});

test('validation order reports malformed reference before unsupported release or observation', async () => {
  const input = structuredClone((await integrityCases())[0].input);
  input.manifest.release = 'not-supported';
  input.manifest.files[0].sha256 = 'invalid';
  input.observed = null;
  assert.deepEqual(checkPackage(input), { ok: false, reason: 'schema' });
  input.manifest.files[0].sha256 = 'a'.repeat(64);
  assert.deepEqual(checkPackage(input), { ok: false, reason: 'unsupported-release' });
  input.supported.push('not-supported');
  assert.deepEqual(checkPackage(input), { ok: false, reason: 'inventory' });
});

test('an empty supported set refuses every release; matching hashes cannot approve a release', async () => {
  const input = structuredClone((await integrityCases())[0].input);
  input.supported = [];
  assert.deepEqual(checkPackage(input), { ok: false, reason: 'unsupported-release' });
});

test('observer computes SHA-256 from complete regular-file bytes and sorts the independent inventory', async () => {
  await directory(async (root) => {
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested', 'one.mjs'), 'export const one = 1;\n');
    await writeFile(join(root, 'two.mjs'), Buffer.from([0, 255, 3, 10]));
    const observed = await observePackage(root, { paths: ['two.mjs', 'nested/one.mjs'] });
    const expected = [];
    for (const path of ['nested/one.mjs', 'two.mjs']) {
      expected.push({ path, sha256: createHash('sha256').update(await readFile(join(root, path))).digest('hex') });
    }
    assert.deepEqual(observed, expected);
  });
});

test('observer refuses unsafe and duplicate inventories before reading', async () => {
  await directory(async (root) => {
    for (const paths of [[], ['../outside'], ['/absolute'], ['a/../b'], ['a\\b'], ['a//b'], ['a', 'a']]) {
      await assert.rejects(observePackage(root, { paths }), /Package observation refused/);
    }
  });
});

test('observer refuses absent files and directories instead of manufacturing an observation', async () => {
  await directory(async (root) => {
    await mkdir(join(root, 'folder'));
    await assert.rejects(observePackage(root, { paths: ['missing.mjs'] }), /ENOENT/);
    await assert.rejects(observePackage(root, { paths: ['folder'] }), /not a regular file/);
  });
});

test('observer refuses file, ancestor and root symbolic links including links into the package', async () => {
  await directory(async (root) => {
    await mkdir(join(root, 'actual'));
    await writeFile(join(root, 'actual', 'runtime.mjs'), 'export const runtime = 1;');
    await symlink(join(root, 'actual', 'runtime.mjs'), join(root, 'link.mjs'));
    await symlink(join(root, 'actual'), join(root, 'alias'));
    await symlink(root, join(root, 'root-alias'));
    await assert.rejects(observePackage(root, { paths: ['link.mjs'] }), /symbolic link/);
    await assert.rejects(observePackage(root, { paths: ['alias/runtime.mjs'] }), /symbolic link/);
    await assert.rejects(observePackage(join(root, 'root-alias'), { paths: ['actual/runtime.mjs'] }), /real directory/);
  });
});

test('observer cannot follow a symlink to outside bytes', async () => {
  await directory(async (root) => {
    await directory(async (outside) => {
      await writeFile(join(outside, 'secret.mjs'), 'outside this owned package');
      await symlink(outside, join(root, 'outside'));
      await assert.rejects(observePackage(root, { paths: ['outside/secret.mjs'] }), /symbolic link/);
    });
  });
});

test('observer enforces file count, individual byte and total byte limits', async () => {
  await directory(async (root) => {
    await writeFile(join(root, 'a.mjs'), '1234');
    await writeFile(join(root, 'b.mjs'), '5678');
    const paths = ['a.mjs', 'b.mjs'];
    await assert.rejects(observePackage(root, { paths, maxFiles: 1 }), /file count limit/);
    await assert.rejects(observePackage(root, { paths, maxFileBytes: 3 }), /file size limit/);
    await assert.rejects(observePackage(root, { paths, maxTotalBytes: 7 }), /total size limit/);
    assert.equal((await observePackage(root, { paths, maxFileBytes: 4, maxTotalBytes: 8 })).length, 2);
    await assert.rejects(observePackage(root, { paths, maxFiles: Infinity }), /positive safe integer/);
  });
});

test('portable inventories reject case-only aliases before observing physical files', async()=>{
 const original={manifest:{schema:1,packageId:'courier-runtime',release:'v1',files:[{path:'engine.mjs',sha256:'a'.repeat(64)},{path:'ENGINE.mjs',sha256:'b'.repeat(64)}]},observed:[],supported:['v1']};
 assert.deepEqual(checkPackage(original),{ok:false,reason:'schema'});
 await assert.rejects(observePackage(process.cwd(),{paths:['engine.mjs','ENGINE.mjs']}),/duplicate/);
});
