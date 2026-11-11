import {readFile, writeFile, mkdir, rename, open, unlink} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const JOURNAL_VERSION = 1;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MAX_BYTES = 16 * 1024 * 1024;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const recordObject = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateJournal(document, depth = 0, globalIds = new Map()) {
  if (depth > 4) throw new Error('Imported journals are nested too deeply. Export a flat working history instead.');
  if (!recordObject(document) || document.schemaVersion !== JOURNAL_VERSION || !Array.isArray(document.records)) {
    throw new Error('Unsupported or malformed journal. The original file has not been changed.');
  }
  if (document.records.length > 20000) throw new Error('Journal exceeds the supported record limit.');
  const ids = new Set();
  let previousHash = null;
  for (const record of document.records) {
    if (!recordObject(record) || typeof record.id !== 'string' || ids.has(record.id) || typeof record.type !== 'string' || !recordObject(record.data)) {
      throw new Error('Journal contains an invalid or duplicate record. The original file is preserved.');
    }
    const {hash, ...body} = record;
    if (record.previousHash !== previousHash || hash !== digest(body)) throw new Error(`Journal integrity mismatch at ${record.id}. No records were overwritten.`);
    if(globalIds.has(record.id) && globalIds.get(record.id)!==hash) throw new Error(`Journal contains conflicting imported versions of record ${record.id}. Both originals must be preserved for review.`);
    globalIds.set(record.id,hash);
    if (record.type === 'import') validateJournal(record.data.document, depth + 1, globalIds);
    ids.add(record.id);
    previousHash = hash;
  }
  return document;
}

export async function readJournal(path) {
  try {
    const bytes = await readFile(path);
    if (bytes.length > MAX_BYTES) throw new Error('Journal exceeds 16 MiB. Export/read the original before beginning a new journal.');
    return validateJournal(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return {schemaVersion: JOURNAL_VERSION, records: []};
    if (error instanceof SyntaxError) throw new Error('Journal is not valid JSON. The original file is preserved for recovery.');
    throw error;
  }
}

export function flattenedRecords(document) {
  validateJournal(document);
  const result = [];
  const seen = new Set();
  function add(records) {
    for (const record of records) {
      if (record.type === 'import') { add(record.data.document.records); continue; }
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      result.push(record);
    }
  }
  add(document.records);
  return result;
}

export async function appendRecord(path, type, data) {
  if (!recordObject(data)) throw new Error('Journal data must be an object.');
  path = resolve(path);
  await mkdir(dirname(path), {recursive: true});
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another journal operation is active, or a previous operation stopped. Preserve ${path}; inspect ${lockPath} before manually clearing the lock.`);
    throw new Error(`Cannot save an attempt: ${error.message}. No feedback/check was released.`);
  }
  let temporary;
  try {
    const document = await readJournal(path);
    const body = {id: randomUUID(), type, createdAt: new Date().toISOString(), previousHash: document.records.at(-1)?.hash ?? null, data};
    const record = {...body, hash: digest(body)};
    const next = {...document, records: [...document.records, record]};
    validateJournal(next);
    const encoded = JSON.stringify(next, null, 2) + '\n';
    if (Buffer.byteLength(encoded) > MAX_BYTES) throw new Error('Journal would exceed 16 MiB; export existing work and use a new journal.');
    temporary = `${path}.${randomUUID()}.part`;
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(encoded); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
    return record;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

export async function exportJournal(source, destination) {
  if (resolve(source) === resolve(destination)) throw new Error('Export destination must differ from the active journal.');
  const document = await readJournal(source);
  await writeFile(destination, JSON.stringify(document, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return document.records.length;
}

export async function importJournal(destination, source) {
  if (resolve(source) === resolve(destination)) throw new Error('Cannot import a journal into itself.');
  const bytes = await readFile(source);
  if (bytes.length > MAX_BYTES) throw new Error('Import exceeds 16 MiB; original journals are unchanged.');
  let document;
  try { document = validateJournal(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { throw new Error(`Import rejected: ${error.message}`); }
  const sourceHash = digest(document);
  const current = await readJournal(destination);
  if (current.records.some(record => record.type === 'import' && record.data.sourceHash === sourceHash)) return {duplicate: true};
  const importedIds = new Map(flattenedRecords(current).map(record => [record.id, record.hash]));
  for (const record of flattenedRecords(document)) {
    if (importedIds.has(record.id) && importedIds.get(record.id) !== record.hash) throw new Error(`Import conflicts with existing record ${record.id}. Both originals are preserved.`);
  }
  await appendRecord(destination, 'import', {sourceHash, document});
  return {duplicate: false, records: document.records.length};
}

export function latestAttempt(document, itemId) {
  return flattenedRecords(document).filter(record => record.type === 'attempt' && record.data.itemId === itemId).at(-1) ?? null;
}

export function assistanceFor(document, itemId) {
  return flattenedRecords(document).filter(record => ['feedback', 'hint'].includes(record.type) && record.data.itemId === itemId)
    .map(record => ({type: record.type, level: record.data.level ?? null, recordId: record.id}));
}

export function questionHash(item) {
  if (!recordObject(item) || !own(item, 'question')) throw new Error('Item has no question.');
  return digest({id: item.id, question: item.question});
}
