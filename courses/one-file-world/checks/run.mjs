// Runs one lesson's checks on a project folder: the lesson's world file (world.html for lesson 1, world-0N.html
// after that; only its pure regions) and, where a lesson asks for one, a small script beside it. No browser.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { loadWorld, firstLine, where } from './pure.mjs';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(readFileSync(join(course, 'course.json'), 'utf8'));
export const LESSONS = config.lessons.map((l) => l.id);
export const lesson = (id) => config.lessons.find((l) => l.id === String(id));
// The learner's file for a lesson: lesson 1's is world.html, each later lesson's is world-0N.html.
export const worldName = (id) => lesson(id)?.file ?? 'world.html';

export async function loadChecks(id) {
  const file = join(course, 'checks', `${id}.mjs`);
  if (!existsSync(file)) return null;
  return import(pathToFileURL(file).href);
}

// The course's own copy of a stage, for the camera matrices the checks use and for the note.
export const stageWorld = (n) => loadWorld(join(course, 'stages', `world-0${n}.html`), { label: `world-0${n}.html` });

function failure(e, labels) {
  const text = firstLine(e);
  if (/not written yet/.test(text)) return { kind: 'not-written', message: text };
  return { kind: 'error', message: `threw ${e?.name ?? 'Error'}: ${text}${where(e, labels)}` };
}

export async function runLesson(projectDir, id, starting = () => {}, file = null) {
  const l = lesson(id);
  const checks = await loadChecks(id);
  if (!checks) return { title: l.title, missing: true, results: [], note: [] };
  const name = file ?? worldName(id);
  const worldFile = join(projectDir, name);
  const course1 = stageWorld(id);
  let mine = null, mineError = null;
  try { mine = loadWorld(worldFile, { label: name }); } catch (e) { mineError = e.kind === 'load' ? e.message : failure(e, [name]).message; }
  let map, mapError;
  const script = l.script; // e.g. map.js: { file, functions }
  const loadMap = () => {
    if (map !== undefined || mapError !== undefined) return;
    const file = join(projectDir, script.file);
    if (!existsSync(file)) { mapError = { kind: 'not-written', message: `${script.file} is missing: write it beside ${name} (the lesson's "Use it on a new case" says what it holds)` }; return; }
    try { map = loadWorld(worldFile, { label: name, extra: { source: readFileSync(file, 'utf8'), label: script.file } }); } catch (e) { mapError = { kind: 'load', message: e.message }; }
  };
  const results = [];
  for (const c of checks.cases) {
    const base = { id: c.id, part: c.part, title: c.title };
    starting(c.id);
    if (!existsSync(worldFile)) { results.push({ ...base, pass: false, kind: 'load', message: `${name} is missing from the project folder${id === '1' ? '' : `: make it with node lab.mjs next PROJECT ${id} write (or supplied, or ai)`}` }); continue; }
    if (mineError) { results.push({ ...base, pass: false, kind: 'load', message: `${name} did not load: ${mineError}` }); continue; }
    const needsMap = script && c.uses.some((u) => script.functions.includes(u));
    if (needsMap) loadMap();
    const scriptSource = needsMap && existsSync(join(projectDir, script.file)) ? readFileSync(join(projectDir, script.file), 'utf8') : '';
    if (needsMap && mapError) { results.push({ ...base, pass: false, ...mapError }); continue; }
    const missing = c.uses.find((u) => !(script?.functions.includes(u) ? map : mine).has(u));
    if (missing) { results.push({ ...base, pass: false, kind: 'missing', message: `${missing} is not defined in ${script?.functions.includes(missing) ? script.file : `a (pure) region of ${name}`}` }); continue; }
    try {
      const out = c.run({ mine, map, course: course1, file: worldFile, label: name, scriptSource });
      if (out?.skipped) results.push({ ...base, pass: true, skipped: out.skipped });
      else results.push({ ...base, pass: !out, ...(out ? { kind: 'failure', message: out.message } : {}) });
    } catch (e) {
      results.push({ ...base, pass: false, ...failure(e, [name, script?.file]) });
    }
  }
  let note = [];
  if (mine && checks.note) { try { note = checks.note({ mine, course: course1 }); } catch (e) { note = [`could not compare with stage ${id}: ${firstLine(e)}`]; } }
  return { title: l.title, results, note, pass: results.every((r) => r.pass) };
}

// runLesson in a worker with a time limit. A check still running at the limit fails as a timeout; the ones after
// it are reported as not run.
export function runLessonGuarded(projectDir, id, limitMs = 60000, file = null) {
  return new Promise((done, fail) => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { projectDir, id, file } });
    const started = [];
    const timer = setTimeout(async () => {
      await worker.terminate();
      const checks = await loadChecks(id);
      const results = checks.cases.map((c) => {
        const base = { id: c.id, part: c.part, title: c.title, pass: false };
        if (c.id === started.at(-1)) return { ...base, kind: 'timeout', message: `did not finish within ${limitMs / 1000} s: look for an endless loop in ${c.uses.join(' or ')}` };
        return { ...base, kind: 'not-run', message: started.includes(c.id) ? 'finished, but its result was lost when the run was stopped' : 'not run: an earlier check did not finish' };
      });
      done({ title: lesson(id).title, results, note: [], pass: false });
    }, limitMs);
    worker.on('message', (m) => { if (m.starting) started.push(m.starting); if (m.report) { clearTimeout(timer); done(m.report); } });
    worker.on('error', (e) => { clearTimeout(timer); fail(e); });
  });
}
