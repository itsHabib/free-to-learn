import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { observePackage } from './package.mjs';

// Deliberately independent of any manifest's contents. The launcher maintains
// its own complete transitive runtime inventory; these are the fixture's inputs.
export const FIXTURE_RUNTIME_PATHS = Object.freeze(['engine.mjs', 'admission.mjs', 'defense.mjs', 'protocol.mjs']);
const SUPPORTED = ['courier-runtime-1', 'courier-runtime-2'];

/** Author fixture: increase bounded history capacity without changing gameplay. */
export async function writeCompatibleUpdate(project, destination) {
  for (const path of FIXTURE_RUNTIME_PATHS) await writeFile(join(destination, path), await readFile(join(project, path)));
  const engine = await readFile(join(destination, 'engine.mjs'), 'utf8');
  assert.ok(engine.includes('const MAX_EVENTS = 4096;'), 'The compatible-update fixture must name the current history capacity.');
  await writeFile(join(destination, 'engine.mjs'), engine.replace('const MAX_EVENTS = 4096;', 'const MAX_EVENTS = 8192;'));
}

function manifest(files, release = SUPPORTED[0]) {
  return { schema: 1, packageId: 'courier-runtime', release, files: structuredClone(files) };
}

function example(name, input, expected, rule) {
  return { name, input, expected, rule };
}

function evidenceValue(value) {
  if (value === undefined) return { type: 'undefined' };
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { type: typeof value, display: inspect(value) };
  }
}

function assertionDetails(error) {
  return {
    message: error.message,
    code: error.code,
    operator: error.operator,
    expected: evidenceValue(error.expected),
    actual: evidenceValue(error.actual),
  };
}

/** Actual file bytes underlie both the initial and compatible-update cases. */
export async function integrityCases() {
  const project = await realpath(fileURLToPath(new URL('../', import.meta.url)));
  const files = await observePackage(project, { paths: FIXTURE_RUNTIME_PATHS });
  const original = { manifest: manifest(files), observed: files, supported: SUPPORTED };
  const cases = [];
  const add = (name, change, reason, rule) => {
    const input = structuredClone(original);
    change(input);
    cases.push(example(name, input, { ok: reason === 'verified', reason }, rule));
  };
  add('approved runtime bytes', () => {}, 'verified', 'The complete approved inventory must remain usable.');
  add('inventory order is irrelevant', (input) => input.observed.reverse(), 'verified', 'Match by path, not array position.');
  add('hex letter case is irrelevant', (input) => input.observed.forEach((file) => { file.sha256 = file.sha256.toUpperCase(); }),
    'verified', 'Hex letter case does not change a SHA-256 value.');
  add('missing runtime file', (input) => input.observed.pop(), 'inventory', 'Every approved path must be observed.');
  add('extra runtime file', (input) => input.observed.push({ path: 'extra.mjs', sha256: files[0].sha256 }),
    'inventory', 'An observed path outside the approved inventory must refuse startup.');
  add('same count different path', (input) => { input.observed[0].path = 'replacement.mjs'; },
    'inventory', 'Equal file counts do not establish equal inventories.');
  add('duplicate observation', (input) => { input.observed[1] = structuredClone(input.observed[0]); },
    'inventory', 'Each observed path must occur exactly once.');
  add('case-alias observation', input => { input.observed.push({ ...input.observed[0], path: input.observed[0].path.toUpperCase() }); }, 'inventory', 'Portable inventories reject paths differing only in letter case.');
  add('case-alias approved path', input => { input.manifest.files.push({ ...input.manifest.files[0], path: input.manifest.files[0].path.toUpperCase() }); }, 'schema', 'Portable approved inventories reject case aliases.');
  add('malformed observation', (input) => { input.observed[0].sha256 = 'not-a-digest'; },
    'inventory', 'Malformed observation entries are not a usable inventory.');
  add('unsupported release', (input) => { input.manifest.release = 'courier-runtime-99'; },
    'unsupported-release', 'An unchanged digest does not make an unknown release compatible.');
  add('schema version', (input) => { input.manifest.schema = 2; }, 'schema', 'Only manifest schema 1 is understood.');
  add('wrong package identity', (input) => { input.manifest.packageId = 'another-runtime'; }, 'schema', 'The reference must name courier-runtime.');
  add('blank release', (input) => { input.manifest.release = ' '; }, 'schema', 'A release is a nonempty identifier.');
  add('unrecognized manifest field', (input) => { input.manifest.approved = true; }, 'schema', 'The manifest shape has exactly four fields.');
  add('invalid approved digest', (input) => { input.manifest.files[0].sha256 = '00'; }, 'schema', 'An approved SHA-256 has 64 hexadecimal characters.');
  add('duplicate approved path', (input) => input.manifest.files.push(structuredClone(input.manifest.files[0])),
    'schema', 'Duplicate paths make the approved reference ambiguous.');
  add('empty approved inventory', (input) => { input.manifest.files = []; }, 'schema', 'An empty reference cannot verify this runtime.');
  add('malformed supported list', (input) => { input.supported = [1]; }, 'schema', 'Supported releases must be strings.');
  for (const path of ['../escape.mjs', '/absolute.mjs', 'dir/../escape.mjs', 'dir\\file.mjs', 'dir//file.mjs', './engine.mjs', 'C:engine.mjs', 'nul\u0000.mjs', 'space name.mjs', 'bang!.mjs']) {
    add(`unsafe approved path ${JSON.stringify(path)}`, (input) => { input.manifest.files[0].path = path; },
      'schema', 'Use safe, unique relative paths; see LEARNER.md#decide-in-order.');
  }

  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'ivy-integrity-cases-')));
  try {
    await writeCompatibleUpdate(project, temporary);
    const updated = await observePackage(temporary, { paths: FIXTURE_RUNTIME_PATHS });
    cases.push(example('actual runtime byte change', { ...structuredClone(original), observed: updated },
      { ok: false, reason: 'digest' }, 'The old approved reference must refuse changed engine.mjs bytes.'));
    cases.push(example('supported release label alone', { manifest: manifest(files, SUPPORTED[1]), observed: updated, supported: SUPPORTED },
      { ok: false, reason: 'digest' }, 'A supported release label does not approve new file bytes.'));
    cases.push(example('approved compatible update', { manifest: manifest(updated, SUPPORTED[1]), observed: updated, supported: SUPPORTED },
      { ok: true, reason: 'verified' }, 'A separately approved reference and supported release must permit the updated runtime.'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return cases;
}

/** A candidate exception is a runner failure; a returned wrong verdict is feedback. */
export async function assess(candidate, { onCriterion = () => {} } = {}) {
  if (typeof candidate?.checkPackage !== 'function') throw new Error('The policy must export checkPackage.');
  const criteria = [];
  for (const item of await integrityCases()) {
    const input = structuredClone(item.input);
    onCriterion(item.name);
    const before = structuredClone(input);
    const actual = await candidate.checkPackage(input);
    try {
      assert.deepEqual(actual, item.expected, `${item.rule} See LEARNER.md#decide-in-order.`);
      assert.deepEqual(input, before, 'The policy must not mutate its inputs. See LEARNER.md#your-editable-policy.');
      criteria.push({ name: item.name, passed: true });
    } catch (error) {
      criteria.push({ name: item.name, passed: false, error: assertionDetails(error) });
    }
  }
  return { passed: criteria.every((criterion) => criterion.passed), criteria };
}
