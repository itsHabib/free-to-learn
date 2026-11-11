# Learner contract, prototype v2

This is the executable slice's contract. The wider design contains additional planned interfaces; this document names the executable scope. The current database has one process, fixed schemas, logical concurrent clients and a synchronous atomic publication boundary.

`buildEngine(BaseEngine)` returns your subclass. The supplied shell owns handles, the private write map, typed predicates, durable string encoding, disk I/O and traces. Your methods decide the eight policies below. Histories are arrays in ascending commit-sequence order. A version is `{table,key,csn,row}`; `row:null` is a tombstone. Rows are detached at client boundaries. CSNs are logical numbers, not times or disk batch IDs.

## 01 — visibleVersion(history, snapshot, examine)

Return the committed version with greatest `csn <= snapshot`, including a tombstone, or `null` when no version qualifies. Call `examine(version)` when examining a version so the trace records work. Do not mutate history. The shell overlays the transaction's own private writes before consulting this method. Requirements: R02, R03.

## 02 — commitTransaction(tx)

The shell verifies an active owned handle and refuses commit while a query is open. Your method must check `this.conflicts(tx)` before persistence. A nonempty conflict list finishes the transaction aborted. A read-only successful transaction finishes committed without generating a write CSN. Otherwise call `this.prepare(tx)`, then durably persist its result, publish its complete logical root, and finish committed. A failure during persistence/publication must poison the coordinator and return indeterminate through the supplied helper. Do not promise definite failure after losing an acknowledgement. Requirements: R04, R05.

Helpers:

| Helper | Meaning |
| --- | --- |
| `conflicts(tx)` | Calls your later validation policies when the current stage enables them. Unit 02 uses a declared validation-free stage and independent writes; it is not SI yet. |
| `prepare(tx)` | Returns `{csn,versions,changes,operations}` without writing; checks the version limit. |
| `persist(prepared)` | Sends one atomic batch to the accepted store. May fail after bytes became durable. |
| `publish(prepared)` | Installs the complete new logical history and CSN; no other client runs inside this synchronous call. |
| `finish(tx,state,details)` | Makes the handle terminal, closes queries, clears private writes and returns `{status:state,...details}`. |
| `indeterminate(tx,error)` | Poisons the engine, makes this handle indeterminate and returns a diagnostic. |

Successful write commits return `{status:'committed',csn}`. Validation aborts return `{status:'aborted',conflicts}`. State/input/resource errors throw with a named category. A pre-persistence resource refusal leaves the active transaction available to abort. An indeterminate coordinator must be reopened before any further use.

## 03 — writeConflicts(tx)

Return a list with one description for every conflicting key, in any order and any clear description format. Each key in `tx.writes` conflicts when its latest committed history version has `csn > tx.snapshot`. The history map uses `JSON.stringify([table,key])` keys. A tombstone counts as a committed write. Value equality does not erase a write occurrence. Conflict-free independent writers both commit. Requirements: R06, R09.

## 04 — readConflicts(tx)

Used in database-wide `serializable` mode. Return conflicts between the transaction's logical reads and committed changes after its snapshot. The shell records point reads, including missing keys, as `{kind:'point',table,key}`. Scans record `{kind:'predicate',table,predicate}` even when empty. `this.changes` contains `{table,key,csn,before,row}` entries. A predicate depends on either a matching before-image or matching after-image. `BaseEngine.matches(row,predicate)` handles typed evaluation and null rows.

The mode validates ordinary transactions even if they happen to perform no writes. An explicit `begin({readOnly:true})` prohibits writes and may serialize at its pinned snapshot; the supplied dispatcher skips conflict validation only for that declared read-only case. It guarantees the declared commit-order serial interpretation for accepted histories; it is not PostgreSQL SSI and may abort more often. All writers in a run use the same mode. An SI anomaly demonstration belongs in `snapshot` mode, where read dependencies are intentionally not validated. Requirements: R07, R08.

At scan admission, the supplied shell takes one deep copy of the complete predicate, including nested `and.args`. That owned value is used for predicate validation, index candidate selection, every iterator pull and the recorded logical dependency. Later caller mutations cannot retarget an open scan. Create a new scan to ask a different query. Capturing the query is a supplied-runtime responsibility; your `readConflicts` policy must validate the recorded dependency, not guess what a caller might have changed elsewhere.

## 05 — indexMemberships(history, field)

Return the distinct typed values appearing in any retained non-tombstone version at that field. The shell builds a materialized candidate map from these memberships and rebuilds enabled maps before publication. It derives candidate keys, then applies your visibility policy and rechecks the predicate. Use `BaseEngine.valueKey` if you need a typed map key. Private writes are merged separately. Old membership cannot disappear merely because the latest row moved. Map rebuilding is deliberately simple; an incrementally maintained tree is not implemented. Requirements: R10 and plan-independent R07.

## 06 — retainedVersions(history, watermark)

Return a nonempty safe subsequence of history. Preserve every version newer than the watermark and the newest version at or below it, when one exists. A more conservative safe list is allowed, but cleanup after all readers finish must make progress and retain only the latest version in the no-reader checks. A tombstone may be the needed boundary. The shell computes the watermark from all active transaction snapshots, including idle ones, and protects query handles until close/exhaustion/abort/error. It retains the latest tombstone even when no readers remain. Requirements: R11–R13.

The shell persists deletion records using the accepted batch store. Logical removal does not imply physical log shrinkage. No compaction speed or memory-RSS claim follows from the returned `removed` count.

## Operations available to your schedule

`begin`, `get(tx,table,key)`, `put(tx,table,key,row)`, `delete`, `scan(tx,table,predicate,{access})`, `commit`, `abort`, `vacuum`, `close`. Scan returns a closeable iterator. `access` is `scan` or `index`; index currently supports equality and `isNull`. An open query prohibits private writes and commit in that transaction. Abort closes its queries. Terminal handles cannot read, write or commit again.

Default table `items` has `label:text`, `group:text`, `active:boolean`, `value:integer`. Keys are unsigned 31-bit integers. Values can be null, or their declared type; text is valid Unicode up to 128 UTF-8 bytes, integers are signed 32-bit. Predicates support `true`, `eq`, `lt`, `ge`, `isNull`, `and`. `lt` and `ge` form a half-open range. Text comparison is bytewise UTF-8. Equality with null is false; use `isNull`. At most three tables, eight fields per table, two indexes per table, 8 active transactions, 128 distinct staged writes and 12,000 retained versions are enforced. Other larger resource targets in the design are not yet enforced by this slice.

## Scenario file

A scenario object has `mode`, `initial` and `actions`. `initial` is an array of version records conforming to the fixture format. An action names `op` and, when needed, transaction alias `tx`, `table`, `key`, `row`, `predicate` and `access`. Start each alias with `{ "op":"begin", "tx":"reader" }`. Scans are drained within one action; the lower-level API supports paused iterator tests. The scenario runner exposes `open-scan`, `pull`, `close-query`, `analyze`, `compare-plans` and `inspect`; it does not expose restart or fault injection. Those are checked directly by the public/instructor API tests and remain runner work.

Public criteria name exact requirements and can be read in `checks.mjs`. The checker records failures rather than treating code-import errors as bad database semantics. Passing these finite checks is not a proof for all client programs, independent acceptance, or a completed course.

## 07 — summarizeSnapshot and planEqualityJoin

`summarizeSnapshot(rows, field, metadata)` receives visible `{key,row}` entries and dated physical metadata. Return that metadata unchanged with `rowCount` and `frequencies:[{value,count}]`. Include null as its own value. The metadata supplies table, field, snapshot, physicalCSN, physicalRevision, physicalKeys, total versionProbes from analysis, and historical indexCandidates by value. The prototype uses exact bounded frequencies rather than sampling. The persisted physicalRevision advances on write publication and on cleanup that removes versions. Cleanup can make statistics stale even when the snapshot and physicalCSN are unchanged.

`planEqualityJoin(left,right,value,weights)` estimates three fixed candidates for a query selecting `left.field = value` and joining equal fields. Let m and n be the corresponding non-null visible frequencies; equality to null gives both zero. Let a and b be historical index candidate counts for the value. The candidate visits are: scan-loop `(left.physicalKeys, m * right.physicalKeys)`; scan-hash `(left.physicalKeys, right.physicalKeys)`; index-loop `(a, m * b)`. Estimate each side's version examinations as the ceiling of its visits times its analysis versionProbes divided by physicalKeys (zero for an empty side). Predicate evaluations equal total candidate visits. Every candidate estimates m*n output rows. Hash build adds right.rowCount, and hash probe adds m, only for scan-hash. Other hash costs are zero.

Return `{candidates,selected}`. Every candidate is `{id,estimatedRows,work,cost}` with IDs scan-loop, scan-hash, index-loop. Work fields are candidateVisits, versionExaminations, predicateEvaluations, hashBuild, hashProbe, outputRows. Cost is their weighted sum. Choose any minimum-cost candidate; numeric verification uses absolute tolerance 1e-9. Default weights are respectively 1, 2, 1, 2, 1, 1. These teaching work units are not milliseconds. The statistics may be stale and the estimates may be wrong; correctness still requires the same query result.

Planning must not execute candidates. The supplied operators and comparator own actual execution. They build needed indexes before measured comparisons and expose index-build events separately. This planning prototype rejects staged private writes; use a read-only transaction. It supports two distinct tables and one same-type equality field, not general SQL, three-way joins, correlated predicates or optimizer search.

## 08–09 — learner-authored investigations

The executable evidence interfaces and criteria are in PROJECTS.md. You author the scenarios, preserved defect/repair, observations and explanations. Source-aware author calibration is kept outside the learner packet. `engineeringPassed` is a bounded check result, not independent acceptance, a learning-effectiveness claim or course completion.
