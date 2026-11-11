# Schedule experiment workshop

Turn a concurrency claim into a schedule you can change, predict and inspect. You use **your own policy implementation** on the supplied course engine. There is no completed engine hidden in this workshop.

Start after unit 04 for the predicate experiment with scans. Implement unit 05 before running its index trials. Start the retention experiment after unit 06. An untouched starter still reports its unimplemented methods; creating a workbook does not complete them.

## First experiment

From the course directory, using Node 26.5.1:

```sh
node lab.mjs workshop-init work retention work/retention
```

This creates `work/retention/workbook.json` and two copies of your current policy, `baseline.mjs` and `candidate.mjs`. Your project engine and previous attempts stay intact. Keep the baseline as your control; edit the candidate to explore a different collection policy. Both initially contain the same code, so their results should agree until you change something.

Open the workbook in your text editor. It contains a real, editable transaction schedule, named observation checkpoints and separate predictions for each trial. The retention schedule pauses a query, commits a writer, collects versions, closes just the query, collects again, then ends the reader and collects once more.

1. Trace the starting versions by hand. Which version is each reader entitled to use?
2. For every trial/checkpoint, add an `expected` JSON value and write `because`. Predict the actual behavior of that policy, including suspected defects. Do not write only what you wish a correct database would do.
3. Run the experiment after committing those predictions:

```sh
node lab.mjs workshop-run work work/retention/workbook.json work/retention-run-1 --help-used none
node lab.mjs workshop-show work/retention-run-1
node lab.mjs workshop-show work/retention-run-1 candidate clean-paused
node lab.mjs workshop-show work/retention-run-1 candidate old-pull
```

The command refuses missing predictions or reasons **before** executing policy code or creating the experiment directory. It snapshots the workbook, schedules and policy files before any trial runs. Reusing an output directory is refused. Each run leaves the original predictions visible beside the observations, even when they were wrong.

Here is the format for one prediction in the initial retention workbook:

```json
"old-snapshot": {
  "expected": 2,
  "because": "The reader begins after the initial versions at CSN 2 and before the writer publishes."
}
```

Fill the other predictions yourself. A row prediction needs the complete row object (or `null` for absence). A `pull` prediction needs the complete iterator result: either `{"done":true}` or `{"done":false,"value":{"key":1,"row":{...}}}`. The ellipsis is explanatory, not valid JSON. Pin predictions use the runtime form `[{"tx":1,"snapshot":2,"openQueries":0}]`; transaction IDs start at 1 in begin order.

## Experiment A: how much history is enough?

Compare your current retention method with a candidate of your choice. One deliberately risky hypothesis is that keeping only each key's latest version is enough. Another is that keeping all history forever is safest. A third preserves the watermark boundary. Implement the alternative yourself in `candidate.mjs`, then predict its different removal counts **and** old-reader results.

Inspect `clean-paused`, `idle`, `clean-idle`, `old-get` and `clean-free`. The trace exposes active transaction snapshots, open query counts, retained-version count, logical read dependencies and the exact events emitted. A closed iterator does not end its transaction. Explain a remaining pin using the actual transaction state, not a rule about whether someone recently read a row.

Now change the experiment, not only the algorithm:

- Move `old-start` and `open` after `publish`. Update your predictions before rerunning. Does the latest-only candidate still lose a needed version for this schedule?
- Add a second reader beginning after `publish`, release the original reader before `clean-idle`, and predict the new watermark. Give every new action and transaction a new ID/alias.
- Replace the writer's update with a delete. Predict the tombstone case, including what the old and new readers see. Keep the other rows as controls.

Save each revision in a new output directory. Find a schedule that distinguishes your two policies, then a schedule on which they agree. Agreement on one schedule is not general safety. Keeping everything may preserve every observed read while failing the cleanup progress contract; the snapshot oracle does not grade that progress.

## Experiment B: two bookings, one empty predicate

```sh
node lab.mjs workshop-init work predicate work/bookings
```

Both ordinary transactions read the same empty `group = reserved` predicate and then reserve different keys. The workbook compares your baseline in Snapshot mode, Serializable mode with a scan, and Serializable mode with an index. A fourth trial uses your candidate policy with Serializable/index access. If unit 05 is unfinished, remove both index trials for now; add them back after implementing index membership.

Predict each commit status and the fresh reader's final keys. The application rule is **at most one reservation**. Decide from the final keys whether it holds. No canned "invariant passed" result is supplied.

Inspect `b-empty` in the scan and index trials. Read the captured predicate in the transaction state. An empty result still records a dependency. Then inspect `b-commit`: which committed change intersects that dependency? Index candidate counts may differ while the logical question stays the same.

Make at least one further experiment and predict all affected checkpoints:

- Reverse `a-commit` and `b-commit`. Which writer survives the conservative Serializable rule?
- Change b's predicate and staged row to a different group. Should unrelated bookings both be admitted?
- Stage the same key in both transactions. Separate a write/write rejection from predicate validation.
- In `candidate.mjs`, change only your predicate conflict policy. Can it miss an insertion into an empty result? Can it reject unrelated activity? Explain both an accepted and a rejected outcome.

The writes in this workbook are explicit schedule actions, not conditional application code. If you move a read so it becomes nonempty, you must also reconsider whether the application would still issue that write. This workshop does not invent application branches.

`snapshot` and `serializable` are the course modes, not selectable isolation levels on a real database. The latter is the course's conservative commit-order validation, not PostgreSQL SSI. Declaring these booking transactions `readOnly:true` is not a way to avoid conflicts: their writes would be invalid.

## Author a different schedule

The JSON remains yours to edit. Keep `format` as `advanced-storage-workshop-v1` and supply a title, an experimental question and an integer seed. `scenario.initial` and `scenario.actions` use [the existing course contract](CONTRACTS.md). Every action also needs a unique lowercase `id`, such as `reader-before-cleanup`. It remains attached to the action in exported runs and reduced witnesses.

A trial selects a policy source relative to the workbook, an explicit `mode`, and optionally `access:"scan"` or `access:"index"`. The access override applies to **every** scan/open-scan in that trial. Omit it to use each action's access selection. Use an index-compatible equality or `isNull` predicate for an index trial; a range with index access is an invalid experiment, not a database anomaly. All selected policy files must live inside your project and fit the course's portable self-contained `buildEngine(BaseEngine)` interface.

A checkpoint names an action and a projection of its result, after-action state or measured work:

```json
{
  "id": "visible-values",
  "after": "my-scan",
  "path": ["result", "*", "row", "value"],
  "question": "Which values does this reader see, in key order?"
}
```

`*` maps over an array. Use `['state','versions']` for retained-version count, `['state','pins']` for pins, or `['work','versionExaminations']` for this action's measured version probes (write these as double-quoted JSON strings). Results are compared as JSON values; object key order is ignored and array order is preserved. Missing fields are reported as unavailable, never silently equated with `null`. Comparison is exact; there is no numeric tolerance.

Limits are 96 actions, 128 initial versions, four trials, 48 checkpoints, 128 KiB per workbook, 64 KiB per policy, 750 ms per execution and one MiB of worker output. The workshop uses the basic transaction/query/cleanup actions; plan analysis and fault injection remain with the existing course interfaces. It stops writing if internal free space is below 5,000,000,000 bytes or the destination lacks room for the planned output. Output on an internal path must also preserve that internal floor. These are bounded experiments on trusted local code, not a JavaScript security sandbox.

## Read a disagreement honestly

The report separates three questions:

| Evidence | Meaning |
| --- | --- |
| Prediction matched/different | Whether your prior JSON claim equals the observed projection. Predicting broken behavior correctly still matches. |
| Snapshot mismatches | Whether the existing copied-map oracle found a wrong read against the observed commit history. It does not grade which commits should have been admitted. |
| Execution status | Whether the trial completed and repeated identically. Invalid operations, missing implementations, resource limits, timeouts and differing repeats are not semantic witnesses. |

A Snapshot-mode two-booking anomaly can have **zero snapshot mismatches**: each client read a valid old view. A bad Serializable validator can also admit both without producing a wrong snapshot value. Use the commit statuses, final keys and dependencies to explain that failure; the existing minimizer does not minimize application invariants or commit-admission errors.

Every completed trial runs twice in fresh processes using the same seeded `Math.random`. This detects variation in those two observations; it does not control clocks, filesystem state or arbitrary code effects. A differing repeat retains both outputs and receives no ordinary run manifest. Inspect `observation.json` and `repeat.json`. If a worker throws, available partial events remain visible; a forcibly timed-out process may provide no partial trace.

## Take a real wrong read into the existing minimizer

When the report identifies an actual snapshot mismatch for a deterministic trial, its `trials/TRIAL` directory already has the existing run format. For example, after your retention candidate demonstrably loses an old view:

```sh
node lab.mjs minimize work/retention-run-1/trials/candidate work/retention-witness --seed 17 --budget 80 --help-used none
node lab.mjs show-witness work/retention-witness
node lab.mjs replay-witness work/retention-witness --help-used none
```

Use the seed saved in your workbook if you changed it. The minimizer independently checks exact source/runtime/results and fresh reproducibility. It can refuse a candidate; the workshop does not manufacture a failing result for it. [Its original limitations](WITNESSES.md) still apply.

Read which actions survived, explain the first wrong read, repair your candidate, and rerun the **same** workbook into a new experiment directory. Keep your earlier prediction and failure. Then construct a structurally different schedule to challenge the repair. This is preparation for [unit 08's investigation](PROJECTS.md), not a replacement for its requirements or a course completion verdict.

## Preserve the experiment

The project export includes workbooks, policy snapshots, predictions, event traces, run manifests and witnesses:

```sh
node lab.mjs export work ../advanced-storage-with-workshop
```

From the exported directory, `node lab.mjs workshop-show work/retention-run-1` verifies saved file hashes and displays the recorded comparison. It does not rerun policy code. Use `workshop-run` with a new destination for new evidence, or `replay-witness` to verify a reduced failure. Hashes detect accidental changes; editable local receipts are not authenticated authorship certificates.

These schedules use the real supplied **course implementation** and its in-memory disk model. A `durable` event means that model acknowledged a batch. It is not an experiment on hardware durability, real filesystem recovery, physical disk shrinkage, OS threads or distributed transactions. Measured work counters are not elapsed-time benchmarks. The original local-use and publication-rights restrictions remain in force.
