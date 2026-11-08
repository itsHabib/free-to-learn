import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const execute = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
async function run(cwd, file, ...args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // This child is an independent CLI, not a nested node:test worker.
  try { return { code: 0, ...await execute(process.execPath, [file, ...args], { cwd, timeout: 15000, env }) }; }
  catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
}
const prepared = existsSync(new URL('../lab/session.json', import.meta.url));
test('source lab preserves failed attempts, reasoning and the tested source snapshot', {
  skip: prepared ? 'Reference-authoring fixture; prepared workspaces run their own gameplay checks.' : false,
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ivy-courier-lab-'));
  try {
    for (const entry of await readdir(project)) {
      if (['artifacts', 'node_modules'].includes(entry)) continue;
      await cp(join(project, entry), join(temporary, entry), { recursive: true });
    }
    const sealed = await run(temporary, 'lab/order/seal.mjs');
    assert.equal(sealed.code, 0, sealed.stderr);
    const referenceRefused = await run(temporary, 'lab/check.mjs', '--assistance', 'author regression');
    assert.equal(referenceRefused.code, 2, 'a reference demo cannot become a learner submission');
    const prepare = await run(temporary, 'lab/prepare.mjs');
    assert.equal(prepare.code, 0, prepare.stderr);
    assert.equal((await run(temporary, 'lab/prepare.mjs')).code, 1, 'repeat prepare must preserve existing work');
    const workspace = join(temporary, 'artifacts/workspace');
    const starter = await readFile(join(workspace, 'defense.mjs'), 'utf8');
    const response = 'Author regression response: guard belongs on server; legal traffic cannot attest local code.';
    await writeFile(join(workspace, 'lab/response.md'), response);
    const predictions = JSON.parse(await readFile(join(workspace, 'predictions.json')));
    predictions.predictions.forEach((item) => { item.answer = 'Captured author calibration prediction.'; });
    await writeFile(join(workspace, 'predictions.json'), JSON.stringify(predictions));
    const failed = await run(workspace, 'lab/check.mjs', '--assistance', 'author regression: missing guard');
    assert.equal(failed.code, 1, failed.stdout);
    assert.match(failed.stdout, /remote pickup must leave cargo false/);
    const attempts = join(workspace, 'artifacts/attempts');
    const [first] = await readdir(attempts);
    assert.equal(await readFile(join(attempts, first, 'defense.mjs'), 'utf8'), starter);
    assert.equal(await readFile(join(attempts, first, 'response.md'), 'utf8'), response);
    const alternate = starter.replace('// TODO: deny interactions outside the inclusive 250 mm radius.', "if (!omitProximity && (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2 > 62500) return 'range';");
    assert.notEqual(alternate, starter);
    await writeFile(join(workspace, 'defense.mjs'), alternate);
    const passed = await run(workspace, 'lab/check.mjs', '--assistance', 'author regression: equivalent correct repair');
    assert.equal(passed.code, 0, passed.stdout + passed.stderr);
    const all = await readdir(attempts);
    assert.equal(all.length, 2);
    assert.equal(await readFile(join(attempts, first, 'defense.mjs'), 'utf8'), starter, 'first submission is unchanged');
    const second = all.find((id) => id !== first);
    const bundle = join(attempts, second);
    const hashes = JSON.parse(await readFile(join(bundle, 'execution-hashes.json'), 'utf8'));
    const submission = JSON.parse(await readFile(join(bundle, 'submission.json'), 'utf8'));
    const session = JSON.parse(await readFile(join(workspace, 'lab/session.json')));
    assert.equal(submission.ownerExecutionRoot.startsWith(join(session.referenceRoot, 'artifacts/spatial-executions')), true);
    const actual = createHash('sha256').update(await readFile(join(submission.ownerExecutionRoot, 'defense.mjs'))).digest('hex');
    assert.equal(actual, hashes['defense.mjs']);
    assert.equal(await readFile(join(submission.ownerExecutionRoot, 'defense.mjs'), 'utf8'), alternate);
    assert.equal(existsSync(join(bundle, 'execution')), false, 'trusted execution stays outside the learner workspace');
    assert.equal(JSON.parse(await readFile(join(bundle, 'result.json'), 'utf8')).code, 0);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
