import { openStore } from './foundation.mjs';
import { MemoryDisk } from './disk.mjs';

export const DEFAULT_SCHEMA = { items: { label: 'text', group: 'text', active: 'boolean', value: 'integer' } };
export const copy = value => structuredClone(value);
export const identity = (table, key) => JSON.stringify([table, key]);
export const valueKey = value => JSON.stringify([typeof value, value]);
const persistedKey = v => `v:${v.table}:${v.key}:${v.csn}`;
const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
const frozenHistory = history => Object.freeze(history.map(v => Object.freeze({ ...v, row: v.row === null ? null : Object.freeze(v.row) })));
export const compare = (a, b) => typeof a === 'string' ? Buffer.compare(Buffer.from(a), Buffer.from(b)) : a < b ? -1 : a > b ? 1 : 0;

export function matches(row, predicate = { op: 'true' }) {
  if (row === null) return false;
  if (predicate.op === 'true') return true;
  if (predicate.op === 'and') return predicate.args.every(p => matches(row, p));
  const value = row[predicate.field];
  if (predicate.op === 'isNull') return value === null;
  if (value === null || predicate.value === null) return false;
  if (predicate.op === 'eq') return value === predicate.value;
  if (predicate.op === 'lt') return compare(value, predicate.value) < 0;
  if (predicate.op === 'ge') return compare(value, predicate.value) >= 0;
  fail('INPUT', `Unknown predicate ${predicate.op}`);
}

export function validatePredicate(schema, table, p) {
  if (!p || typeof p !== 'object') fail('INPUT', 'Use a predicate object.');
  if (p.op === 'true') return;
  if (p.op === 'and') {
    if (!Array.isArray(p.args) || p.args.length > 8) fail('INPUT', 'and needs at most eight predicates.');
    for (const item of p.args) validatePredicate(schema, table, item);
    return;
  }
  if (!['eq', 'lt', 'ge', 'isNull'].includes(p.op) || !Object.hasOwn(schema[table], p.field)) fail('INPUT', 'Unknown predicate operation or field.');
  if (p.op === 'isNull') return;
  validateValue(schema[table][p.field], p.value);
}

function validateValue(type, value) {
  if (value === null) return;
  if (type === 'integer' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) return;
  if (type === 'boolean' && typeof value === 'boolean') return;
  if (type === 'text' && typeof value === 'string' && value.isWellFormed() && Buffer.byteLength(value) <= 128) return;
  fail('INPUT', `Expected ${type}, null, or a value within the documented limit.`);
}

// Supplied transport, persistence and observation shell. Learner policy methods
// are deliberately absent: visibility, commit ordering, validation, indexes, GC.
export class BaseEngine {
  static matches = matches;
  static valueKey = valueKey;
  constructor({ disk = new MemoryDisk(), schema = DEFAULT_SCHEMA, mode = 'snapshot', maxVersions = 12000, fault = null, stage = 6 } = {}) {
    if (!['snapshot', 'serializable'].includes(mode)) fail('INPUT', 'Choose snapshot or serializable.');
    if (!schema || Array.isArray(schema) || Object.keys(schema).length < 1 || Object.keys(schema).length > 3) fail('INPUT', 'Use one to three fixed schemas.');
    for (const [table, fields] of Object.entries(schema)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(table) || !fields || Array.isArray(fields) || Object.keys(fields).length < 1 || Object.keys(fields).length > 8) fail('INPUT', 'Invalid table name or field count.');
      if (Object.entries(fields).some(([name,type]) => !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name) || !['text','integer','boolean'].includes(type))) fail('INPUT', 'Invalid field name or type.');
    }
    if (!Number.isInteger(maxVersions) || maxVersions < 1 || maxVersions > 12000) fail('INPUT', 'Version limit must be 1–12000.');
    this.schema = copy(schema); this.mode = mode; this.maxVersions = maxVersions; this.fault = fault; this.lessonStage = stage;
    this.store = openStore(disk); this.disk = disk; this.histories = new Map(); this.transactions = new Map(); this.indexes = new Map();
    this.changes = []; this.events = []; this.nextId = 1; this.csn = 0; this.physicalRevision = 0; this.poisoned = false; this.closed = false;
    this.metrics = { candidateVisits: 0, versionExaminations: 0, predicateEvaluations: 0 };
    const meta = this.store.get('meta');
    if (meta) {
      const image = JSON.parse(meta);
      if (image.format !== 1 || JSON.stringify(image.schema) !== JSON.stringify(this.schema)) fail('INPUT', 'Stored schema/format differs.');
      this.csn = image.csn;
      this.physicalRevision = image.physicalRevision ?? image.csn;
      if (!Number.isSafeInteger(this.csn) || this.csn < 0 || this.csn > 2147483646 || !Number.isSafeInteger(this.physicalRevision) || this.physicalRevision < 0) fail('INPUT', 'Invalid stored sequence metadata.');
    }
    for (const [key, text] of this.store.entries()) {
      if (!key.startsWith('v:')) continue;
      const version = JSON.parse(text), id = identity(version.table, version.key);
      this.key(version.table,version.key);
      if (!Number.isInteger(version.csn) || version.csn < 1 || version.csn > this.csn || key !== persistedKey(version)) fail('INPUT', 'Invalid stored version identity or sequence.');
      if (version.row !== null) this.row(version.table,version.row);
      if (!this.histories.has(id)) this.histories.set(id, []);
      this.histories.get(id).push(version);
    }
    for (const [id,h] of this.histories) this.histories.set(id,frozenHistory(h.sort((a,b)=>a.csn-b.csn)));
    if (this.versionCount() > this.maxVersions) fail('RESOURCE', 'Stored history exceeds the configured retained-version limit.');
  }
  emit(type, details = {}) { this.events.push({ seq: this.events.length, type, ...copy(details) }); }
  ensure() {
    if (this.closed || this.poisoned) fail('STATE', 'Engine closed or indeterminate: reopen before use.');
  }
  active(tx) {
    this.ensure();
    if (this.transactions.get(tx?.id) !== tx || tx.state !== 'active') fail('STATE', 'An active handle owned by this engine is required.');
  }
  key(table, key) {
    if (!Object.hasOwn(this.schema, table) || !Number.isInteger(key) || key < 0 || key > 2147483647) fail('INPUT', 'Known table and unsigned 31-bit key required.');
    return identity(table, key);
  }
  row(table, row) {
    if (!row || Array.isArray(row) || typeof row !== 'object') fail('INPUT', 'Use a typed row object.');
    if (Object.keys(row).length !== Object.keys(this.schema[table]).length) fail('INPUT', 'Row fields must match the schema.');
    for (const [field, type] of Object.entries(this.schema[table])) {
      if (!Object.hasOwn(row, field)) fail('INPUT', `Missing field ${field}`);
      validateValue(type, row[field]);
    }
    if (Buffer.byteLength(JSON.stringify(row)) > 2048) fail('RESOURCE', 'Row exceeds 2048 bytes.');
  }
  begin({ readOnly = false } = {}) {
    this.ensure();
    if (typeof readOnly !== 'boolean') fail('INPUT', 'readOnly must be Boolean.');
    if ([...this.transactions.values()].filter(t => t.state === 'active').length >= 8) fail('RESOURCE', 'At most eight active transactions.');
    const tx = { id: this.nextId++, snapshot: this.csn, state: 'active', readOnly: Boolean(readOnly), writes: new Map(), reads: [], handles: new Set() };
    this.transactions.set(tx.id, tx); this.emit('begin', { tx: tx.id, snapshot: tx.snapshot }); return tx;
  }
  view(tx, table, key) {
    const id = this.key(table, key);
    if (tx.writes.has(id)) return copy(tx.writes.get(id).row);
    const version = this.visibleVersion(this.histories.get(id) ?? [], tx.snapshot, v => {
      this.metrics.versionExaminations++; this.emit('examine-version', { tx: tx.id, table, key, csn: v.csn });
    });
    return version ? copy(version.row) : null;
  }
  get(tx, table, key) {
    this.active(tx); this.key(table, key);
    tx.reads.push({ kind: 'point', table, key });
    const row = this.view(tx, table, key); this.emit('get', { tx: tx.id, table, key, row }); return row;
  }
  put(tx, table, key, row) { this.rowAfterKey(table, key, row); this.stage(tx, table, key, copy(row)); }
  rowAfterKey(table, key, row) { this.key(table, key); this.row(table, row); }
  delete(tx, table, key) { this.key(table, key); this.stage(tx, table, key, null); }
  stage(tx, table, key, row) {
    this.active(tx);
    if (tx.readOnly) fail('STATE', 'A declared read-only snapshot cannot stage writes.');
    if (tx.handles.size) fail('STATE', 'Close queries before changing private writes.');
    const id = identity(table, key);
    if (!tx.writes.has(id) && tx.writes.size >= 128) fail('RESOURCE', 'At most 128 distinct writes.');
    tx.writes.set(id, { table, key, row }); this.emit('stage', { tx: tx.id, table, key, row });
  }
  scan(tx, table, predicate = { op: 'true' }, { access = 'scan' } = {}) {
    this.active(tx); this.key(table, 0);
    // One owned predicate defines the admitted query and its read dependency.
    // Later changes to the caller's object cannot change a paused iterator.
    const ownedPredicate = copy(predicate);
    validatePredicate(this.schema, table, ownedPredicate);
    if (!['scan', 'index'].includes(access)) fail('INPUT', 'Access is scan or index.');
    if (access === 'index' && !['eq', 'isNull'].includes(ownedPredicate.op)) fail('INPUT', 'This slice indexes equality or isNull only.');
    tx.reads.push({ kind: 'predicate', table, predicate: ownedPredicate });
    const keys = access === 'index' ? new Set(this.createIndex(table, ownedPredicate.field).get(valueKey(ownedPredicate.op === 'isNull' ? null : ownedPredicate.value))?.keys ?? []) : new Set();
    if (access === 'scan') for (const history of this.histories.values()) if (history[0].table === table) keys.add(history[0].key);
    for (const w of tx.writes.values()) if (w.table === table) keys.add(w.key);
    const iterator = [...keys].sort((a, b) => a - b)[Symbol.iterator]();
    let closed = false; const engine = this;
    const handle = {
      next() {
        if (closed) return { done: true };
        try {
          engine.active(tx);
          for (let item = iterator.next(); !item.done; item = iterator.next()) {
            engine.metrics.candidateVisits++;
            const row = engine.view(tx, table, item.value);
            engine.metrics.predicateEvaluations++;
            if (matches(row, ownedPredicate)) return { done: false, value: { key: item.value, row } };
          }
          handle.close(); return { done: true };
        } catch (error) { handle.close(); throw error; }
      },
      close() { if (closed) return; closed = true; tx.handles.delete(handle); engine.emit('query-close', { tx: tx.id }); },
      return() { handle.close(); return { done: true }; },
      [Symbol.iterator]() { return this; }
    };
    tx.handles.add(handle); this.emit('query-open', { tx: tx.id, table, access, snapshot: tx.snapshot }); return handle;
  }
  buildIndex(histories, table, field) {
    const entries = new Map(); let memberships = 0;
    for (const history of histories.values()) {
      if (history[0].table !== table) continue;
      for (const value of this.indexMemberships(history, field)) {
        const key = valueKey(value);
        if (!entries.has(key)) entries.set(key, { value, keys: new Set() });
        entries.get(key).keys.add(history[0].key); memberships++;
      }
    }
    this.emit('index-build', { table, field, memberships }); return entries;
  }
  createIndex(table, field) {
    this.ensure(); this.key(table, 0);
    if (!Object.hasOwn(this.schema[table], field)) fail('INPUT', 'Unknown index field.');
    const id = JSON.stringify([table, field]);
    if (!this.indexes.has(id) && [...this.indexes.keys()].filter(k=>JSON.parse(k)[0]===table).length>=2) fail('RESOURCE', 'At most two indexes per table.');
    if (!this.indexes.has(id)) this.indexes.set(id, this.buildIndex(this.histories, table, field));
    return this.indexes.get(id);
  }
  rebuiltIndexes(histories) {
    return new Map([...this.indexes.keys()].map(id => { const [table, field] = JSON.parse(id); return [id, this.buildIndex(histories, table, field)]; }));
  }
  finish(tx, state, details = {}) {
    for (const h of [...tx.handles]) h.close();
    tx.state = state; tx.writes.clear(); this.emit(state, { tx: tx.id, ...details }); return { status: state, ...details };
  }
  abort(tx) { if (this.transactions.get(tx?.id) === tx && tx.state === 'aborted') return { status: 'aborted' }; this.active(tx); return this.finish(tx, 'aborted'); }
  commit(tx) { this.active(tx); if (tx.handles.size) fail('STATE', 'Close queries before commit.'); return this.commitTransaction(tx); }
  conflicts(tx) {
    // A declared read-only transaction can serialize at its pinned snapshot.
    // Write prohibition is enforced by stage(); ordinary transactions validate.
    if (tx.readOnly) return [];
    const result = this.lessonStage >= 3 ? this.writeConflicts(tx) : [];
    if (this.lessonStage >= 4 && this.mode === 'serializable') result.push(...this.readConflicts(tx));
    return result;
  }
  prepare(tx) {
    if (this.csn >= 2147483646) fail('RESOURCE', 'Sequence capacity exhausted.');
    const csn = this.csn + 1;
    const versions = [...tx.writes.values()].map(w => ({ ...copy(w), csn }));
    if (this.versionCount() + versions.length > this.maxVersions) fail('RESOURCE', 'Retained-version limit: close old readers and vacuum.');
    const changes = versions.map(v => ({ ...copy(v), before: copy(this.histories.get(identity(v.table, v.key))?.at(-1)?.row ?? null) }));
    const operations = versions.map(v => ({ type: 'put', key: persistedKey(v), value: JSON.stringify(v) }));
    const physicalRevision = this.physicalRevision + 1;
    operations.push({ type: 'put', key: 'meta', value: JSON.stringify({ format: 1, csn, physicalRevision, schema: this.schema }) });
    const histories = new Map(this.histories);
    for (const v of versions) { const id = identity(v.table, v.key); histories.set(id, frozenHistory([...(histories.get(id) ?? []), copy(v)])); }
    const indexes = this.rebuiltIndexes(histories);
    return { csn, physicalRevision, versions, changes, operations, histories, indexes };
  }
  persist(prepared) { this.emit('persist-start', { csn: prepared.csn }); this.fault?.('before-persist'); this.store.batch(prepared.operations); this.emit('durable', { csn: prepared.csn }); this.fault?.('after-durable'); }
  publish(prepared) {
    this.histories = prepared.histories; this.indexes = prepared.indexes;
    this.changes.push(...copy(prepared.changes)); this.csn = prepared.csn; this.physicalRevision = prepared.physicalRevision; this.emit('published', { csn: this.csn }); this.fault?.('after-publish');
  }
  indeterminate(tx, error) { this.poisoned = true; return this.finish(tx, 'indeterminate', { reason: error.message }); }
  versionCount() { return [...this.histories.values()].reduce((n, h) => n + h.length, 0); }
  pins() { return [...this.transactions.values()].filter(t => t.state === 'active').map(t => ({ tx: t.id, snapshot: t.snapshot, openQueries: t.handles.size })); }
  vacuum() {
    this.ensure(); const watermark = Math.min(this.csn, ...this.pins().map(p => p.snapshot));
    const next = new Map(), removals = [];
    for (const [id, history] of this.histories) {
      const retained = this.retainedVersions(history, watermark);
      if (!Array.isArray(retained) || !retained.length) fail('STATE', 'This slice retains the latest version, including tombstones.');
      const originals = new Map(history.map(v=>[v.csn,JSON.stringify(v)]));
      if (retained.some((v,i)=>originals.get(v.csn)!==JSON.stringify(v) || (i>0&&retained[i-1].csn>=v.csn))) fail('STATE', 'Retention must return an ordered subsequence of existing versions.');
      const keep = new Set(retained.map(v => v.csn)); next.set(id, frozenHistory(retained));
      for (const v of history) if (!keep.has(v.csn)) removals.push({ type: 'del', key: persistedKey(v) });
    }
    const indexes = this.rebuiltIndexes(next);
    const physicalRevision = this.physicalRevision + (removals.length ? 1 : 0);
    try { if (removals.length) this.store.batch([...removals,{type:'put',key:'meta',value:JSON.stringify({format:1,csn:this.csn,physicalRevision,schema:this.schema})}]); }
    catch (error) { this.poisoned = true; fail('INDETERMINATE', error.message); }
    this.histories = next; this.indexes = indexes; this.physicalRevision = physicalRevision; this.changes = this.changes.filter(c => c.csn > watermark);
    this.emit('vacuum', { watermark, removed: removals.length }); return { watermark, removed: removals.length, retained: this.versionCount() };
  }
  close() { this.ensure(); if (this.pins().length) fail('STATE', 'Close active transactions first.'); this.store.close(); this.closed = true; }
}
