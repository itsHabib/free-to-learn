import assert from 'node:assert/strict';
import { MemoryDisk } from './runtime/disk.mjs';
import { openStore } from './runtime/foundation.mjs';
import { DEFAULT_SCHEMA } from './runtime/base.mjs';
import { analyze, comparePlans, explain, executePlan, COST_WEIGHTS } from './runtime/plans.mjs';

export const row = (value, group = 'A', active = true) => ({ label: `item-${value}`, group, active, value });
export function fixture(Engine, versions = [{ table: 'items', key: 1, csn: 1, row: row(10) }], options = {}) {
  const disk = options.disk ?? new MemoryDisk(), store = openStore(disk);
  const csn = Math.max(0, ...versions.map(v => v.csn));
  store.batch([...versions.map(v => ({ type: 'put', key: `v:${v.table}:${v.key}:${v.csn}`, value: JSON.stringify(v) })),
    { type: 'put', key: 'meta', value: JSON.stringify({ format: 1, csn, schema: options.schema ?? DEFAULT_SCHEMA }) }]);
  store.close(); return new Engine({ ...options, disk });
}
const ver = (key, csn, value, group = 'A') => ({ table: 'items', key, csn, row: value === null ? null : row(value, group) });
const commitPut = (db, key, value, group = 'A') => { const t = db.begin(); db.put(t, 'items', key, row(value, group)); assert.equal(db.commit(t).status, 'committed'); };
const rows = (db, tx, p = { op: 'true' }, access = 'scan') => [...db.scan(tx, 'items', p, { access })];
const eq = (field, value) => ({ op: 'eq', field, value });
const range = (lo, hi) => ({ op: 'and', args: [{ op: 'ge', field: 'value', value: lo }, { op: 'lt', field: 'value', value: hi }] });
const tests = [];
function test(unit, id, name, run) { tests.push({ unit, id, name, run }); }

test(1, 'R03-boundary', 'A commit exactly at the snapshot is visible; future commits are not.', E => {
  const db = fixture(E), h = [ver(1, 1, 10), ver(1, 4, 40), ver(1, 9, 90)];
  assert.equal(db.visibleVersion(h, 4)?.row.value, 40); assert.equal(db.visibleVersion(h, 8)?.row.value, 40);
  assert.equal(db.visibleVersion(h, 0), null); assert.equal(db.visibleVersion([], 9), null);
});
test(1, 'R03-examine', 'Visibility reports examined versions so measured work is not silently omitted.', E => {
  const db = fixture(E), h = [ver(1, 2, 20)], seen = [];
  assert.equal(db.visibleVersion(h, 2, v => seen.push(v))?.row.value, 20);
  assert.ok(seen.length > 0, 'Call examine(version) when inspecting a version.');
  assert.ok(seen.every(v => h.includes(v)), 'Report the actual examined history version.');
});
test(1, 'R03-delete', 'A visible tombstone stays absent even when an older value exists.', E => {
  const db = fixture(E), h = [ver(1, 1, 10), ver(1, 2, null), ver(1, 5, 50)];
  assert.equal(db.visibleVersion(h, 3)?.row, null); assert.equal(db.visibleVersion(h, 5)?.row.value, 50);
});
test(1, 'R03-own-write', 'Private writes and deletion affect only their owner.', E => {
  const db = fixture(E), a = db.begin(), b = db.begin(); db.put(a, 'items', 1, row(11));
  assert.equal(db.get(a, 'items', 1).value, 11); assert.equal(db.get(b, 'items', 1).value, 10);
  db.delete(a, 'items', 1); assert.equal(db.get(a, 'items', 1), null); assert.equal(db.get(b, 'items', 1).value, 10);
});
test(1, 'R02-detached', 'Mutating a returned object cannot alter stored history.', E => {
  const db = fixture(E), t = db.begin(), result = db.get(t, 'items', 1); result.value = 999;
  assert.equal(db.get(t, 'items', 1).value, 10);
});
test(1, 'R03-overlay-scan', 'Scan merges private inserts and removes private deletions once.', E => {
  const db = fixture(E), t = db.begin(); db.put(t, 'items', 2, row(20)); db.delete(t, 'items', 1);
  assert.deepEqual(rows(db, t).map(x => x.key), [2]);
});

test(2, 'R05-two-row', 'A multi-row commit leaves an old reader on its entire old snapshot.', E => {
  const db = fixture(E, [ver(1, 1, 10), ver(2, 1, 20)], { stage: 2 }), old = db.begin(), w = db.begin();
  db.put(w, 'items', 1, row(11)); db.put(w, 'items', 2, row(21)); assert.equal(db.commit(w).status, 'committed');
  assert.deepEqual(rows(db, old).map(x => x.row.value), [10, 20]); assert.deepEqual(rows(db, db.begin()).map(x => x.row.value), [11, 21]);
  const phases = db.events.filter(e => ['persist-start', 'durable', 'published', 'committed'].includes(e.type)).map(e => e.type);
  assert.deepEqual(phases, ['persist-start', 'durable', 'published', 'committed']);
});
test(2, 'R05-reopen', 'Both rows survive a fresh engine reopening the same accepted store.', E => {
  const db = fixture(E, [], { stage: 2 }), t = db.begin(); db.put(t, 'items', 7, row(70)); db.put(t, 'items', 8, row(80));
  assert.equal(db.commit(t).status, 'committed'); const restored = new E({ disk: db.disk, stage: 2 });
  assert.deepEqual(rows(restored, restored.begin()).map(x => x.row.value), [70, 80]);
});
test(2, 'R05-uncertain', 'Failure after durable acknowledgement poisons the engine; reopen finds the whole commit.', E => {
  const db = fixture(E, [], { stage: 2, fault: phase => { if (phase === 'after-durable') throw Error('injected stop'); } }), t = db.begin();
  db.put(t, 'items', 1, row(1)); db.put(t, 'items', 2, row(2)); assert.equal(db.commit(t).status, 'indeterminate');
  assert.throws(() => db.begin(), /reopen/); const restored = new E({ disk: db.disk }); assert.equal(rows(restored, restored.begin()).length, 2);
});
test(2, 'R05-read-only-csn', 'A successful transaction without writes does not allocate or persist a write CSN.', E => {
  for (const declared of [false, true]) {
    const db = fixture(E, undefined, { stage: 2 }), before = db.csn;
    const t = db.begin({ readOnly: declared }); db.get(t, 'items', 1);
    const events = db.events.length;
    assert.equal(db.commit(t).status, 'committed');
    assert.equal(db.csn, before, 'A read-only commit must not consume a write CSN.');
    assert.equal(db.pins().length, 0);
    assert.ok(!db.events.slice(events).some(e => ['persist-start', 'durable', 'published'].includes(e.type)), 'No write persistence for a read-only commit.');
    const reopened = new E({ disk: db.disk, stage: 2 }); assert.equal(reopened.csn, before);
    const w = reopened.begin(); reopened.put(w, 'items', 2, row(20));
    assert.equal(reopened.commit(w).csn, before + 1);
  }
});
test(2, 'R04-terminal', 'A terminal handle cannot commit twice, write or read again.', E => {
  const db = fixture(E, [], { stage: 2 }), t = db.begin(); db.put(t, 'items', 1, row(1)); db.commit(t);
  assert.throws(() => db.commit(t), /active/); assert.throws(() => db.get(t, 'items', 1), /active/); assert.throws(() => db.put(t, 'items', 2, row(2)), /active/);
});
test(2, 'R04-open-query', 'Open queries block commit and private writes until closed.', E => {
  const db = fixture(E, undefined, { stage: 2 }), t = db.begin(), q = db.scan(t, 'items');
  assert.throws(() => db.commit(t), /Close queries/); assert.throws(() => db.put(t, 'items', 2, row(2)), /Close queries/);
  q.close(); assert.equal(db.commit(t).status, 'committed'); assert.equal(db.pins().length, 0);
});

test(3, 'R06-same-key', 'The second writer of a shared key aborts after the first commits.', E => {
  const db = fixture(E), a = db.begin(), b = db.begin(); db.put(a, 'items', 1, row(11)); db.put(b, 'items', 1, row(12));
  assert.equal(db.commit(a).status, 'committed'); assert.equal(db.commit(b).status, 'aborted'); assert.equal(db.get(db.begin(), 'items', 1).value, 11);
});
test(3, 'R09-independent', 'Independent active writers both commit and do not move an old reader.', E => {
  const db = fixture(E), r = db.begin(), a = db.begin(), b = db.begin(); db.put(a, 'items', 2, row(2)); db.put(b, 'items', 3, row(3));
  assert.equal(db.commit(a).status, 'committed'); assert.equal(db.commit(b).status, 'committed'); assert.equal(db.get(r, 'items', 2), null);
});
test(3, 'R06-absent-insert', 'Two writers inserting the same previously absent key still conflict.', E => {
  const db = fixture(E, []), a = db.begin(), b = db.begin(); db.put(a, 'items', 9, row(9)); db.put(b, 'items', 9, row(10));
  assert.equal(db.commit(a).status, 'committed'); assert.equal(db.commit(b).status, 'aborted');
});
test(3, 'R06-ABA', 'Changing a value and restoring it does not erase a write conflict.', E => {
  const db = fixture(E), t = db.begin(); db.put(t, 'items', 1, row(30)); commitPut(db, 1, 20); commitPut(db, 1, 10);
  assert.equal(db.commit(t).status, 'aborted');
});
test(3, 'R06-equal-value-write', 'A newer write conflicts even when the stale writer proposes that same value.', E => {
  const db = fixture(E), stale = db.begin(); db.put(stale, 'items', 1, row(20));
  commitPut(db, 1, 20);
  assert.equal(db.commit(stale).status, 'aborted', 'Compare write occurrence CSNs, not row equality.');
});
test(3, 'R06-all-conflicts', 'Write validation reports every conflicting key, not only the first one.', E => {
  const db = fixture(E, [ver(1, 1, 10), ver(2, 1, 20)]), stale = db.begin();
  db.put(stale, 'items', 1, row(11)); db.put(stale, 'items', 2, row(21)); db.put(stale, 'items', 3, row(30));
  const writer = db.begin(); db.put(writer, 'items', 1, row(12)); db.delete(writer, 'items', 2); db.commit(writer);
  assert.equal(db.writeConflicts(stale).length, 2, 'Return one description for each conflicting key; description shape is your choice.');
  const result = db.commit(stale); assert.equal(result.status, 'aborted');
  assert.equal(result.conflicts.length, 2);
});
test(3, 'R06-delete-reinsert', 'A stale reinsertion conflicts with a committed deletion.', E => {
  const db = fixture(E), a = db.begin(), b = db.begin(); db.delete(a, 'items', 1); db.commit(a); db.put(b, 'items', 1, row(20));
  assert.equal(db.commit(b).status, 'aborted');
});

test(4, 'R08-write-skew', 'Snapshot mode permits the disjoint-write anomaly; Serializable rejects a conflicting history.', E => {
  for (const mode of ['snapshot', 'serializable']) {
    const db = fixture(E, [ver(1, 1, 1), ver(2, 1, 1)], { mode }), a = db.begin(), b = db.begin();
    db.get(a, 'items', 2); db.get(b, 'items', 1); db.put(a, 'items', 1, row(0)); db.put(b, 'items', 2, row(0));
    assert.equal(db.commit(a).status, 'committed'); assert.equal(db.commit(b).status, mode === 'snapshot' ? 'committed' : 'aborted');
  }
});
test(4, 'R07-negative-read', 'An absent-key dependency notices a concurrent insertion.', E => {
  const db = fixture(E, [], { mode: 'serializable' }), t = db.begin(); assert.equal(db.get(t, 'items', 4), null); commitPut(db, 4, 40);
  assert.equal(db.commit(t).status, 'aborted');
});
test(4, 'R07-empty-range', 'An empty predicate read notices a new row inside its range.', E => {
  const db = fixture(E, [], { mode: 'serializable' }), t = db.begin(); assert.equal(rows(db, t, range(20, 30)).length, 0); commitPut(db, 4, 25);
  assert.equal(db.commit(t).status, 'aborted');
});
test(4, 'R07-before-image', 'An update leaving a read predicate still conflicts.', E => {
  const db = fixture(E, [ver(1, 1, 25)], { mode: 'serializable' }), t = db.begin(); rows(db, t, range(20, 30)); commitPut(db, 1, 99);
  assert.equal(db.commit(t).status, 'aborted');
});
test(4, 'R07-upper-endpoint', 'A write at the exclusive upper bound does not cause a false conflict.', E => {
  const db = fixture(E, [], { mode: 'serializable' }), t = db.begin(); rows(db, t, range(20, 30)); commitPut(db, 2, 30);
  assert.equal(db.commit(t).status, 'committed');
});
test(4, 'R08-read-ABA', 'A reverted change remains visible to dependency validation.', E => {
  const db = fixture(E, undefined, { mode: 'serializable' }), t = db.begin(); db.get(t, 'items', 1); commitPut(db, 1, 20); commitPut(db, 1, 10);
  assert.equal(db.commit(t).status, 'aborted');
});
test(4, 'R08-declared-read-only', 'A declared read-only view can serialize at its snapshot but can never stage a write.', E => {
  const db = fixture(E, undefined, { mode: 'serializable' }), t = db.begin({readOnly:true});
  assert.throws(()=>db.put(t,'items',2,row(2)),/read-only/); assert.equal(db.get(t,'items',1).value,10);
  commitPut(db,1,20); assert.equal(db.get(t,'items',1).value,10); assert.equal(db.commit(t).status,'committed');
});

test(5, 'R10-old-index', 'Old and new index values both find their own visible version.', E => {
  const db = fixture(E), old = db.begin(); commitPut(db, 1, 20, 'B'); const fresh = db.begin();
  assert.deepEqual(rows(db, old, eq('group', 'A'), 'index'), rows(db, old, eq('group', 'A')));
  assert.equal(rows(db, old, eq('group', 'A'), 'index').length, 1); assert.equal(rows(db, fresh, eq('group', 'A'), 'index').length, 0);
  assert.equal(rows(db, fresh, eq('group', 'B'), 'index').length, 1);
});
test(5, 'R10-no-duplicate', 'Repeated membership for one row is deduplicated; distinct keys remain.', E => {
  const db = fixture(E, [ver(1, 1, 1), ver(1, 2, 2), ver(2, 1, 2)]), t = db.begin();
  assert.deepEqual(rows(db, t, eq('group', 'A'), 'index').map(x => x.key), [1, 2]);
});
test(5, 'R10-private-abort', 'Private indexed changes vanish on abort and do not hide old readers.', E => {
  const db = fixture(E), t = db.begin(), r = db.begin(); db.put(t, 'items', 1, row(2, 'B')); assert.equal(rows(db, t, eq('group', 'B'), 'index').length, 1);
  db.abort(t); assert.equal(rows(db, r, eq('group', 'B'), 'index').length, 0); assert.equal(rows(db, r, eq('group', 'A'), 'index').length, 1);
});
test(5, 'R07-plan-footprint', 'An index read records the entire logical predicate including an empty result.', E => {
  const db = fixture(E, [], { mode: 'serializable' }), t = db.begin(); rows(db, t, eq('group', 'C'), 'index'); commitPut(db, 4, 4, 'C');
  assert.equal(db.commit(t).status, 'aborted');
});
test(5, 'R10-index-reopen', 'Reopened history supports index/full-scan equivalence.', E => {
  const db = fixture(E); commitPut(db, 1, 2, 'B'); const restored = new E({ disk: db.disk }), t = restored.begin();
  assert.deepEqual(rows(restored, t, eq('group', 'B'), 'index'), rows(restored, t, eq('group', 'B')));
});

test(6, 'R11-boundary-version', 'Retention preserves the predecessor below an in-between watermark.', E => {
  const db = fixture(E), h = [ver(1, 1, 1), ver(1, 3, 3), ver(1, 8, 8)];
  const kept = db.retainedVersions(h, 6); assert.ok(kept.some(v => v.csn === 3)); assert.ok(kept.some(v => v.csn === 8));
});
test(6, 'R11-idle-pin', 'An idle old transaction protects its view until it closes.', E => {
  const db = fixture(E), old = db.begin(); commitPut(db, 1, 20); commitPut(db, 1, 30); db.vacuum();
  assert.equal(db.get(old, 'items', 1)?.value, 10); db.abort(old); const result = db.vacuum(); assert.ok(result.removed >= 2); assert.equal(result.retained, 1);
});
test(6, 'R11-paused-query', 'A paused query retains its original view through commits and cleanup.', E => {
  const db = fixture(E, [ver(1, 1, 10), ver(2, 1, 20)]), old = db.begin(), q = db.scan(old, 'items'); assert.equal(q.next().value.row.value, 10);
  commitPut(db, 2, 99); db.vacuum(); assert.equal(q.next().value.row.value, 20); assert.equal(q.next().done, true); assert.equal(old.handles.size, 0); db.abort(old);
});
test(6, 'R11-tombstone', 'A retained tombstone keeps an old snapshot absent after reinsertion.', E => {
  const db = fixture(E), d = db.begin(); db.delete(d, 'items', 1); db.commit(d); const old = db.begin(); commitPut(db, 1, 30); db.vacuum();
  assert.equal(db.get(old, 'items', 1), null); assert.equal(db.get(db.begin(), 'items', 1).value, 30);
});
test(6, 'R11-change-journal', 'Cleanup cannot erase validation evidence needed by a live transaction.', E => {
  const db = fixture(E, undefined, { mode: 'serializable' }), old = db.begin(); db.get(old, 'items', 1); commitPut(db, 1, 20); db.vacuum();
  assert.equal(db.commit(old).status, 'aborted');
});
test(6, 'R13-safe-limit', 'Version pressure refuses a new commit without destroying a pinned reader.', E => {
  const db = fixture(E, undefined, { maxVersions: 2 }), old = db.begin(); commitPut(db, 1, 20); const writer = db.begin(); db.put(writer, 'items', 1, row(30));
  assert.throws(() => db.commit(writer), /Retained-version/); assert.equal(db.get(old, 'items', 1).value, 10); assert.equal(db.csn, 2);
});
test(6, 'R12-cleanup-reopen', 'After cleanup, reopening retains the correct latest committed state.', E => {
  const db = fixture(E); commitPut(db, 1, 20); commitPut(db, 1, 30); db.vacuum(); const restored = new E({ disk: db.disk });
  assert.equal(restored.get(restored.begin(), 'items', 1)?.value, 30);
});

const twoTables = { items: DEFAULT_SCHEMA.items, bookings: DEFAULT_SCHEMA.items };
function joinFixture(E, selective = true) {
  const versions = [];
  for (let key = 1; key <= 8; key++) versions.push({ table: 'items', key, csn: 1, row: row(key, !selective || key === 1 ? 'A' : 'B') });
  for (let key = 1; key <= 12; key++) versions.push({ table: 'bookings', key, csn: 1, row: row(key, !selective || key === 1 ? 'A' : 'C') });
  return fixture(E, versions, { schema: twoTables });
}
const query = { left: 'items', right: 'bookings', field: 'group', value: 'A' };
test(7, 'R15-summary', 'Snapshot statistics preserve snapshot identity and visible value frequencies.', E => {
  const db = joinFixture(E), t = db.begin(), stats = analyze(db, t, 'items', 'group');
  assert.equal(stats.snapshot, t.snapshot); assert.equal(stats.rowCount, 8); assert.equal(stats.physicalKeys, 8);
  assert.equal(stats.frequencies.find(x => x.value === 'A')?.count, 1); assert.equal(stats.frequencies.find(x => x.value === 'B')?.count, 7);
  assert.ok(stats.versionProbes >= 8, 'Visibility work must be recorded, not silently omitted.');
});
test(7, 'R14-plan-equivalence', 'All supplied physical plans return the same bag of joined rows.', E => {
  const db = joinFixture(E), t = db.begin(), stats = { left: analyze(db, t, 'items', 'group'), right: analyze(db, t, 'bookings', 'group') };
  const result = comparePlans(db, t, query, stats); assert.ok(result.runs.every(r => r.rows.length === 1));
  assert.equal(result.explanation.selected, 'index-loop');
});
test(7, 'R16-plan-crossover', 'Many matching rows make hash preferable to repeated index probes under this profile.', E => {
  const db = joinFixture(E, false), t = db.begin(), stats = { left: analyze(db, t, 'items', 'group'), right: analyze(db, t, 'bookings', 'group') };
  const result = comparePlans(db, t, query, stats); assert.ok(result.runs.every(r => r.rows.length === 96));
  assert.equal(result.explanation.selected, 'scan-hash');
  assert.ok(result.runs.find(r => r.id === 'scan-hash').cost < result.runs.find(r => r.id === 'index-loop').cost);
});
test(7, 'R16-cost-estimates', 'Estimated work includes version examinations and weighted component costs.', E => {
  const db = joinFixture(E), t = db.begin(), left = analyze(db, t, 'items', 'group'), right = analyze(db, t, 'bookings', 'group');
  const result = explain(db, t, query, left, right), index = result.candidates.find(c => c.id === 'index-loop');
  assert.equal(index.work.candidateVisits, 2); assert.ok(index.work.versionExaminations >= 2); assert.equal(index.estimatedRows, 1);
});
test(7, 'R15-stale', 'New physical history marks older statistics stale without changing an old query result.', E => {
  const db = joinFixture(E), t = db.begin(), left = analyze(db, t, 'items', 'group'), right = analyze(db, t, 'bookings', 'group');
  commitPut(db, 1, 100, 'B'); const result = comparePlans(db, t, query, { left, right });
  assert.equal(result.explanation.stale, true); assert.ok(result.runs.every(r => r.rows.length === 1));
});
test(7, 'R15-vacuum-generation', 'Cleanup dates physical statistics even when the logical snapshot does not change.', E => {
  const db = joinFixture(E); commitPut(db,1,100); commitPut(db,1,101);
  const t = db.begin({readOnly:true}), left=analyze(db,t,'items','group'), right=analyze(db,t,'bookings','group');
  const before=comparePlans(db,t,query,{left,right}); assert.equal(before.explanation.stale,false);
  const csn=db.csn, revision=db.physicalRevision; assert.ok(db.vacuum().removed>=2);
  assert.equal(db.csn,csn); assert.ok(db.physicalRevision>revision);
  const after=comparePlans(db,t,query,{left,right}); assert.equal(after.explanation.stale,true);
  assert.deepEqual(after.runs.map(r=>r.rows),before.runs.map(r=>r.rows));
  const restored=new E({disk:db.disk,schema:twoTables}); assert.equal(restored.physicalRevision,db.physicalRevision);
});
test(7, 'R14-null-join', 'Equality to null yields no join rows in all plans.', E => {
  const db = joinFixture(E), t = db.begin(), stats = { left: analyze(db, t, 'items', 'group'), right: analyze(db, t, 'bookings', 'group') };
  const result = comparePlans(db, t, { ...query, value: null }, stats); assert.ok(result.runs.every(r => r.rows.length === 0));
  assert.ok(result.explanation.candidates.every(c => c.estimatedRows === 0));
});
test(7, 'R07-join-footprint', 'An index join retains the declared logical right-table dependency.', E => {
  const db = joinFixture(E); db.mode = 'serializable'; const t = db.begin(); executePlan(db, t, query, 'index-loop');
  const w = db.begin(); db.put(w, 'bookings', 12, row(99, 'C')); assert.equal(db.commit(w).status, 'committed');
  assert.equal(db.commit(t).status, 'aborted');
});
test(7, 'R16-no-execution', 'Explaining a plan does not execute it or change measured work.', E => {
  const db = joinFixture(E), t = db.begin(), left = analyze(db, t, 'items', 'group'), right = analyze(db, t, 'bookings', 'group');
  const before = JSON.stringify({ metrics: db.metrics, events: db.events, histories: [...db.histories] });
  explain(db, t, query, left, right); assert.equal(JSON.stringify({ metrics: db.metrics, events: db.events, histories: [...db.histories] }), before);
});

export function runChecks(Engine, through = 7) {
  const results = [];
  for (const t of tests.filter(t => t.unit <= through)) {
    try { t.run(Engine); results.push({ unit: t.unit, id: t.id, name: t.name, passed: true }); }
    catch (error) { results.push({ unit: t.unit, id: t.id, name: t.name, passed: false, message: error.message, code: error.code ?? 'CHECK' }); }
  }
  return { through, passed: results.every(r => r.passed), total: results.length, failures: results.filter(r => !r.passed).length, results };
}
