import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomBytes, randomInt } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, evidenceExport, hint, issueFresh, issueMastery, loadUnits, newSession, problem, referenceExposure, revealWorked, SCHEMA, sessionView, submit, visitSection } from './runtime.mjs';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const MAX_RECORD = 16 * 1024 * 1024;
const MAX_BODY = 96 * 1024;
export const LEARNING_ROUTES = new Map([
  ['/learning/catalog', 'GET'],
  ...['session', 'state', 'item', 'mastery', 'submit', 'hint', 'worked', 'reference', 'visit', 'export'].map((name) => [`/learning/${name}`, 'POST']),
]);

export function createLearningService({ modules = loadUnits, directory = process.env.LEARNING_DATA_DIR || resolve(PROJECT, '.tmp/learning'), now = () => new Date().toISOString(), nextSeed = () => randomInt(1, 0x1_0000_0000), persist = saveAtomic, referenceRoot = PROJECT } = {}) {
  let loaded;
  const locks = new Map();
  const getModules = () => loaded ??= Promise.resolve(typeof modules === 'function' ? modules() : modules).catch((error) => { loaded = undefined; throw problem(503, 'learning-unavailable', `Learning units are unavailable: ${error.message}`); });
  const fileFor = (id) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw problem(400, 'session-required', 'Start or restore a learning session.');
    return resolve(directory, `${id}.json`);
  };
  async function readState(id) {
    try {
      const state = JSON.parse(await readFile(fileFor(id), 'utf8'));
      if (state.schema !== SCHEMA || state.sessionId !== id) throw new Error('Invalid record schema.');
      return state;
    } catch (error) {
      if (error.status) throw error;
      if (error.code === 'ENOENT') throw problem(404, 'session-not-found', 'This saved session is unavailable. Keep your session ID and export; start a new session only if intended.');
      throw problem(503, 'record-unreadable', 'The saved record cannot be read. Existing files have not been changed.');
    }
  }
  async function save(state) {
    try { await persist(fileFor(state.sessionId), state); } catch { throw problem(507, 'record-not-saved', 'The record could not be saved. No new feedback or answer has been revealed. Keep your answer and retry after storage is available.'); }
  }
  async function mutate(id, operation) {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const state = await readState(id);
      const result = await operation(state, await getModules());
      await save(state);
      return { ...result, progress: sessionView(state, await getModules()).units };
    });
    locks.set(id, next);
    try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
  }
  async function reference(state, all, input) {
    const unit = state.unitSnapshots.find((unit) => unit.id === input.unitId);
    if (!unit) throw problem(400, 'unknown-unit', 'Choose a listed unit.');
    const section = input.key === undefined ? undefined : unit.sections.find((entry) => entry.id === input.key);
    if (input.key !== undefined && !section) throw problem(400, 'unknown-key', 'Choose a listed section.');
    const path = section?.source?.path ?? unit.support?.reference;
    if (typeof path !== 'string') throw problem(404, 'reference-unavailable', 'This unit has no reference file.');
    const target = resolve(referenceRoot, path);
    if (!target.startsWith(resolve(referenceRoot) + sep)) throw problem(400, 'invalid-reference', 'The reference must be inside this course.');
    let content;
    try { content = await readFile(target, 'utf8'); } catch { throw problem(404, 'reference-unavailable', 'The reference file is unavailable. Your learning record is unchanged.'); }
    referenceExposure(state, unit.id, path, now());
    return { path, anchor: section?.source?.anchor, content };
  }
  return {
    async request(route, input = {}) {
      if (route === '/learning/catalog') return { units: catalog(await getModules()), boundary: 'Local toy course. The machine owner can inspect keys and edit records. Mastery means all three generated items were correct on unassisted first scored responses; it is not evidence of human learning or a credential.' };
      if (route === '/learning/session') {
        const state = newSession(randomBytes(32).toString('base64url'), await getModules(), now());
        await save(state);
        return sessionView(state, await getModules());
      }
      if (route === '/learning/state') return sessionView(await readState(input.sessionId), await getModules());
      if (route === '/learning/export') return evidenceExport(await readState(input.sessionId), await getModules());
      return mutate(input.sessionId, async (state, all) => {
        if (route === '/learning/item') {
          if (!['completion', 'practice'].includes(input.mode)) throw problem(400, 'invalid-mode', 'Use a completion or practice item, or request a complete mastery set.');
          return { item: issueFresh(state, all, input, nextSeed, now()) };
        }
        if (route === '/learning/mastery') return { set: issueMastery(state, all, input.unitId, nextSeed, now()) };
        if (route === '/learning/submit') return submit(state, input.itemId, input.answer, input.assistance, now());
        if (route === '/learning/hint') return { hint: hint(state, input.itemId, now()) };
        if (route === '/learning/worked') return { exposure: revealWorked(state, all, input, now()) };
        if (route === '/learning/visit') return { visit: visitSection(state, input.unitId, input.key, now()) };
        if (route === '/learning/reference') return reference(state, all, input);
        throw problem(404, 'not-found', 'Unknown learning operation.');
      });
    },
  };
}

export async function saveAtomic(path, state) {
  const bytes = JSON.stringify(state, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > MAX_RECORD) throw new Error('Record capacity reached. Export and start a fresh session.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}

export function createLearningHandler(service) {
  return async (request, response) => {
    try {
      const input = request.method === 'POST' ? await readJson(request) : {};
      const body = await service.request(request.url, input);
      send(response, 200, body);
    } catch (error) {
      send(response, error.status ?? 500, { error: error.code ?? 'learning-error', message: error.status ? error.message : 'Learning operation failed. No new result has been revealed.' });
      request.resume();
    }
  };
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) throw problem(415, 'content-type', 'Use JSON for learning requests.');
  if (Number(request.headers['content-length'] ?? 0) > MAX_BODY) throw problem(413, 'body-too-large', 'The submitted answer is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw problem(413, 'body-too-large', 'The submitted answer is too large.');
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Object required.');
    return input;
  } catch { throw problem(400, 'invalid-json', 'Use a JSON object.'); }
}

function send(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(bytes);
}
