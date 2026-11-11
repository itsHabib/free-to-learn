# Investigation and transfer contracts

Keep your authored scenarios, run folders and descriptors inside your project (`work/`) so the supplied export copies the whole investigation. Run source is self-contained policy code exporting `buildEngine`; importing private instructor files is not a valid submission.

## Scenario operations

`begin` takes a transaction alias `tx` and optional Boolean `readOnly`. `get`, `put`, `delete`, `scan`, `commit`, `abort` use that alias. Reads/writes name `table` and where appropriate `key`, `row`, `predicate`, `access`. `open-scan` names a query alias `as`; later `pull` and `close-query` use `query`. `inspect` returns pins/version count/CSN; `vacuum` attempts logical reclamation.

`analyze` names `tx`, `table`, `field`, and a saved statistics alias `as`. `compare-plans` names `tx`, a query `{left,right,field,value}`, and `leftStats`/`rightStats` aliases. It executes all three supplied physical candidates over one snapshot. Queries in this slice require read-only transaction state (no staged writes); explicit read-only declaration is recommended. An alias cannot replace a still-active transaction or an existing query.

The scenario root is `{mode, schema, initial, actions}`. `mode` is `snapshot` or `serializable`. `schema` maps table names to column/type objects; types are `integer`, `text`, `boolean`, each nullable. `initial` contains version records `{table,key,csn,row}`. Initial rows and schemas are supplied input; your authored actions are the client program. Use a single initial CSN unless history itself is the intended test. At most 500 actions are accepted.

Execute a scenario with `node lab.mjs run work work/scenario.json work/runs/NAME --help-used none --prediction "your expected result and reason"`. The output directory must not exist. The prediction and exact source are recorded before execution. A run returns observations, not an automatic pass. Reads before a regular Serializable transaction commits are provisional; a declared read-only transaction has a stable serialization point at its snapshot and cannot write.

## Unit 08 descriptor

Author `work/investigation.json` with these fields:

| Field | Required value |
| --- | --- |
| `format` | `advanced-storage-investigation-v1` |
| `runs` | Object with `broken`, `repaired`, `variant` paths relative to the descriptor |
| `diagnosis` | Your causal explanation; nonempty presence is checked, quality uses the rubric |
| `claims` | At least two objects described below, covering predicted and observed cost |

A cost claim contains `run` (`broken`, `repaired`, `variant`), zero-based `action` index, physical `plan` ID, `measure` (`observedCost` or `estimatedCost`), and numeric `value`. The referenced action must be `compare-plans`. Absolute numeric tolerance is 1e-9; costs are work units, not time. Unsupported, conflicting or invented claims fail.

Broken and repaired runs use exactly the same scenario bytes and different source bytes. The variant uses the same repaired source but changes the transaction/read/write/cleanup operation structure. Changing labels, values, or adding only inspection/statistics bookkeeping is insufficient. All three runs replay from their saved sources and must match recorded results and runtime identity.

The broken run must exhibit a snapshot mismatch against the independent copied-map oracle. Repaired and variant runs must have none. The repaired scenario must include an overlapping commit, a read after another commit, indexed access, vacuum with and without pins, and a plan comparison. The repaired engine must pass all seven component milestones.

Run `node lab.mjs assess work work/investigation.json --help-used none`. An engineering pass is evidence for those criteria only. The explanation rubric asks for the violated invariant, discriminating schedule, causal repair, preservation of valid alternatives, and accurate distinction between estimates and measurements.

## Optional supplied witness minimization

Use `node lab.mjs minimize work/runs/broken work/witnesses/first --seed 7 --budget 80 --help-used none` to reduce a recorded snapshot defect without overwriting its original source or evidence. `show-witness` explains removed operations and the preserved failure; `replay-witness` verifies both original and reduced runs. See [WITNESSES.md](WITNESSES.md) for exact signature, budgets and export/import rules. This is supplied investigation tooling, not another learner policy. Keep the full original scenario for the required repair comparison and the independent schedule variation.

## Unit 09 supplied schema and invariant

Use tables named `items`, `collections`, and `holds`. Suggested supplied schema: items has `collection:integer`, `location:text`, `eligible:boolean`; collections has `collection:integer`, `name:text`; holds has `collection:integer`. Choose a small initial catalog with at least two items and two collections. All rows have separate integer primary keys. Use three distinct aliases for the exporter, purger and holder, with one transaction for each role in a run. Other clients may perform additional transactions.

The purge transaction reads an empty holds predicate for its target collection, then stages deletion of one or more existing items in that collection. A different transaction commits a matching hold before the purge finishes. Its change must be a holds read dependency, without a same-key write conflict masking that dependency. The SI run exposes the purge succeeding despite its outdated premise; the Serializable run aborts the purge with a holds read-conflict witness. Deleting a missing key does not demonstrate this invariant.

An exporter declared read-only starts early, retains its old item view through at least one concurrent change of collection/location, and commits successfully. After the move commits, retrieve the moved item through an indexed predicate that matches its old membership but not its new one. A drained scan or an explicitly consumed iterator is accepted. Observe cleanup while the exporter is pinned, then demonstrate actual version removal after all pins close. Make a within-snapshot plan comparison in the export view and another in a later snapshot. A current observer is allowed—and expected—to see different data from the exporter.

Author `work/transfer.json`:

| Field | Required value |
| --- | --- |
| `format` | `advanced-storage-transfer-v1` |
| `runs` | Paths named `snapshot` and `serializable`, relative to this descriptor |
| `roles` | Your transaction aliases named `exporter`, `purger`, `holder` |
| `explanation` | Your invariant/retention/plan-cost argument |

The two scenario files must differ only in database-wide mode, and both use the same current engine source. The checker verifies all snapshot observations with the copied-map oracle, the specific purge/hold pattern, the read-only exporter, index/lifetime work, separate view comparisons and component regressions. It does not grade prose quality or claim an independently authored unseen assessment.

Run `node lab.mjs transfer work work/transfer.json --help-used none`. Then export outside the source tree and repeat the component checks, `assess`, and `transfer` using the copied project. Local engineering flags are not a learning certificate or a live-course completion claim.

## Workshop preparation

The [schedule experiment workshop](WORKSHOP.md) can supply learner-authored schedules and ordinary run directories for these projects. Each deterministic trial is stored at `EXPERIMENT/trials/TRIAL`; actual snapshot failures can enter the existing minimizer unchanged. Compare predicted and observed behavior, preserve your failing policy, repair it on the same schedule, then add a structurally different challenge. Workshop completion alone does not satisfy the investigation or transfer criteria in this document.
