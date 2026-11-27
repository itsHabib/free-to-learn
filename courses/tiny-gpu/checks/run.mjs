// Runs one unit's checks on a project folder (the folder that holds gpu/). No browser.
// node checks/run.mjs PROJECT N   prints one line per case; exit 1 if any fails.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');

function firstLine(e) {
  return String(e?.message ?? e).split('\n')[0];
}

// Each import gets a fresh query so two projects (or a fixed file) never share a cached module.
async function loadGpu(projectDir, stamp) {
  const dir = join(projectDir, 'gpu');
  const gpu = {};
  if (!existsSync(dir)) return { gpu, error: `${dir} is missing` };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const url = pathToFileURL(join(dir, f)).href + `?v=${stamp}`;
    try {
      gpu[f.slice(0, -4)] = await import(url);
    } catch (e) {
      return { gpu, error: `gpu/${f} did not load: ${firstLine(e)}` };
    }
  }
  return { gpu };
}

async function loadScenes(stamp) {
  const dir = join(course, 'scenes');
  const scenes = {};
  if (!existsSync(dir)) return scenes;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    Object.assign(scenes, await import(pathToFileURL(join(dir, f)).href + `?v=${stamp}`));
  }
  return scenes;
}

const fixture = (name) => JSON.parse(readFileSync(join(course, 'checks', 'fixtures', `${name}.json`), 'utf8'));

export async function runUnit(projectDir, n) {
  const file = join(course, 'checks', `${n}.mjs`);
  if (!existsSync(file)) return { missing: true, results: [], pass: false };
  const checks = await import(pathToFileURL(file).href);
  const stamp = `${Date.now()}-${Math.random()}`;
  const { gpu, error } = await loadGpu(resolve(projectDir), stamp);
  const ctx = { fixture, scenes: await loadScenes(stamp), project: resolve(projectDir), course };
  const results = [];
  for (const c of checks.cases) {
    const base = { id: c.id, section: c.section };
    if (error) {
      results.push({ ...base, pass: false, kind: 'load', message: error });
      continue;
    }
    try {
      // A case returns null on a pass, { message } on a failure, or { pass: true, note } for a
      // pass with something to say (a measured margin, or what the case cannot test).
      const out = await c.run(gpu, ctx);
      if (!out || out.pass) results.push({ ...base, pass: true, ...(out?.note ? { note: out.note } : {}) });
      // A failure may name another section than the case's own when it can tell the cause.
      else results.push({ ...base, ...(out.section ? { section: out.section } : {}), pass: false, kind: 'failure', message: out.message });
    } catch (e) {
      const text = firstLine(e);
      const kind = /not written yet/.test(text) ? 'not-written' : 'error';
      results.push({ ...base, pass: false, kind, message: kind === 'error' ? `threw: ${text}` : text });
    }
  }
  return { title: checks.title, results, pass: results.every((r) => r.pass) };
}

async function main([projectDir, n]) {
  if (!projectDir || !n) {
    console.error('usage: node checks/run.mjs PROJECT N');
    process.exit(2);
  }
  const r = await runUnit(projectDir, n);
  if (r.missing) {
    console.error(`no checks for unit ${n}`);
    process.exit(2);
  }
  for (const x of r.results) console.log(`${x.pass ? 'pass' : 'FAIL'}  ${x.id}${x.pass ? (x.note ? `  ${x.note}` : '') : `  (${x.kind}) ${x.message}`}`);
  process.exit(r.pass ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
