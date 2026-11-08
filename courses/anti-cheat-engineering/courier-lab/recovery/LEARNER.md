# M10: Recover code, configuration and state together

Implementation reference for **M10: recovery**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

A courier can pick up a core at the legal 250 mm edge. A candidate release narrows its configuration to 100 mm and stores state in a new format. Select a complete recovery tuple and verify that the same legal pickup works again, while accounting for later actions the older snapshot loses.

This exercise builds on authoritative gameplay, configuration identities and causal checkpoints. It runs only the owned local game. From the reference project run `npm run core:prepare -- recovery`, fill the required answers or explicit skip reasons in `predictions.json`, edit `recovery/policy.mjs` and keep explanations in `response.md` in the printed workspace, then run `npm run core:check -- --assistance "none"`. Replace `none` with the help used. The checker preserves first and revised source, responses and feedback; consulting the author implementation counts as assistance.

## The contract

Export `selectRecovery(evidence)`. This pure function selects identities; the trial runner performs the actual restore. Inputs are already validated and deeply immutable. Use no files, clocks or network operations, and do not inspect or change the stored state body.

The input contains `targetReleaseId`, `releases`, `configurations` and `snapshots`. IDs are unique within each list. A release identifies its package, state decoder and required configuration. A configuration is versioned separately. A snapshot is a named saved state with a declared schema, configuration provenance and ordering number.

| Evidence | Fields used by selection |
| --- | --- |
| Release | `id`, `packageHash`, `stateSchema`, `configId`, `configHash` |
| Configuration | `id`, `hash`, `releaseId`, `stateSchema`, `maxInteractionDistanceMm` |
| Snapshot | `id`, `hash`, `ordinal`, `stateSchema`, `configId`, `configHash`, opaque `state` |

Hashes are opaque identity strings here. Copy them from the selected evidence; do not invent a plausible hash. `ordinal` is a nonnegative safe integer representing declared snapshot order, not a wall-clock time. Extra provenance fields may exist and do not change the selection rules.

Read the worked examples, then complete the different required cases in `predictions.json` before coding; use `response.md` for explanations. These are practice and explanation, not an unseen mastery test. Describe what the three selected artifacts do. Predict what happens if the package returns to the baseline but configuration and state remain from the candidate. Keep that prediction before reading the trial results.

## Declared target

Find the release whose `id` equals `targetReleaseId`. An absent target returns exactly `{ok:false,reason:'unknown-target'}`. Choosing a familiar baseline when the caller requested another release hides a failed recovery plan. A candidate can be a valid declared target when all its artifacts are compatible; the function does not decide which release an operator should want.

The order of refusal checks is target, configuration, then snapshot. If a target is absent and snapshots are empty, report the missing target first. This makes one defective request produce one reproducible explanation.

Practice: a caller requests release `r3`, while the evidence lists only `r1` and `r2`. Record your return value and explain why choosing `r1` would overstep the request. Use the checker feedback to correct the rule and append a second example of your own.

## Compatible tuples

A **recovery tuple** joins one package, one configuration and one saved state. Find the configuration named by `release.configId`. Require its hash to equal `release.configHash`, its `releaseId` to equal the release ID, and its schema to equal `release.stateSchema`. Return exactly `{ok:false,reason:'configuration-mismatch'}` if the configuration is missing or any of those checks fails.

Next filter snapshots. The snapshot schema must equal the release schema, and its configuration ID and hash must match the selected configuration. If no snapshot meets all three requirements, return exactly `{ok:false,reason:'no-compatible-snapshot'}`. A familiar filename or a recently created snapshot is not enough.

For example, release `r1` requires configuration `c1` with hash `h1` and schema 1. A snapshot with schema 1 and `c1/h2` is incompatible even though the names look right. The hash records a different configuration identity. A schema-2 snapshot is also incompatible even if you replace its displayed label with 1: the decoder needs the actual old structure.

Practice: compare snapshots `A={schema:1,config:c1/hash:h1}` and `B={schema:2,config:c1/hash:h1}` for that release. Explain which evidence is missing if neither the snapshot schema nor its configuration provenance is recorded. Do not propose rewriting those fields as a recovery method.

## Snapshot order

Choose the compatible snapshot with the greatest `ordinal`. Break a tie by ascending JavaScript string comparison of `id`: if both have ordinal 8, `a-ready` precedes `z-ready`. This means UTF-16 code-unit order, as used by `<`, rather than language-aware `localeCompare`; for example, `Z-ready` precedes `a-ready`. Do not sort the immutable source array in place. You can filter into a new array and sort it, or scan while keeping the best candidate.

Suppose compatible snapshots have ordinals 2 and 6, while an incompatible candidate snapshot has ordinal 10. Select ordinal 6. This preserves more compatible history than ordinal 2 and avoids treating recency as compatibility. Success returns exactly:

```text
{ok:true,releaseId,packageHash,configId,configHash,snapshotId,snapshotHash}
```

Every value comes from the chosen existing artifacts. Return no replacement state or additional fields. Practice with the input array in the order `[ordinal 10, ordinal 2, ordinal 6]`; record why the output is unchanged when the array is reversed. Then compute the tie case before running the checker.

## State compatibility

The trial uses the existing courier engine for movement, cooldown, pickup and delivery. The baseline state envelope is `{schema:1,checkpoint}`. The candidate envelope is `{schema:2,payload:{world:checkpoint}}`. The inner checkpoint still contains real engine state, but the old decoder does not accept the new envelope. Code-only recovery therefore refuses it instead of treating an unknown structure as an empty or fresh game.

The candidate also changes the configured interaction range from 250 mm to 100 mm. A narrow adapter checks that configuration before forwarding an idle interaction to the unchanged engine. A denied configured action advances the real world with `interact:false`; it does not fabricate an engine range denial. The report distinguishes the adapter's `configuration-range` reason from the engine's own decision.

Both defects matter. Restoring only configuration cannot make the old decoder understand the new state. Restoring only the package leaves the narrower configuration in place and the state incompatible. In this exercise recovery selects a known compatible tuple; it does not perform a reverse migration.

Practice: identify which check protects against a wrong configuration with the right name, and which protects against a new-format snapshot with the old configuration identity. Explain why a schema label change alone does not recover its contents.

## Run the recovery trial

Check selection in small steps before interpreting a restored world.

## Build in three checked milestones

1. **Resolve the declared target and configuration.** Trace one missing-target case and one same-name/wrong-hash configuration. Record the first refusal and why later snapshot choices are not yet meaningful.
2. **Choose among compatible snapshots.** Use the worked ordinal-2/6/10 case above. Completion: compatible snapshots `z-ready` and `a-ready` both have ordinal 8; an incompatible snapshot has ordinal 11. Fill the selected ID, then repeat with the array reversed. Do not choose by input position or mutate the array.
3. **Verify the restored behavior and its cost.** Use the checker and actual trial to inspect the selected identities, restored action and discarded history separately. A valid selection object is only the first part of that evidence.

<details><summary>Hint 1 — separate compatibility from recency</summary>

First ask which snapshots the selected package and configuration can interpret. Only then compare ordinals. A newer incompatible snapshot does not become readable by being newer.

</details>

<details><summary>Hint 2 — preserve the selected evidence</summary>

Copy identity values from the chosen artifacts. Do not rewrite a schema label or invent a matching hash; selection is not migration.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

In the ordinal-2/6/10 example, ordinal 10 is incompatible, so ordinal 6 is the most recent usable state. It can restore behavior while losing later acknowledged work. Record this as assistance, then solve the separate tie completion and inspect the trial's loss report.

</details>

## Observe an actual restore

The owner-side checker invokes `runTrial` with your selection function. Keep the four observations separate: `baseline`, `candidate`, `codeOnly` and `recovered`. Each shows relevant package, configuration and snapshot identities. A successful selection still needs an actual restore and action; returning `ok:true` cannot make the runner claim that pickup worked.

The trial first reaches the pickup boundary and saves a baseline checkpoint. It executes a pickup and delivery, returns to the boundary, converts the current state to the candidate envelope, and tries pickup under the narrowed configuration. Code-only recovery attempts to load that candidate state with the old decoder. Full recovery loads the named compatible baseline snapshot and reruns the original idle pickup through the engine.

Record the settings and source/report identity shown by your integrated runner, each phase's result, and the actor's before/after cargo and score. Each attempted action also records `inputSeq` and `lineage`, the branch of history it belongs to. The original branch uses `original`; a successful restore names its source snapshot and tick, such as `restored-from:baseline-ready@tick3`. A refused restore has no new action or branch, so these fields are null. A stale last decision is not a new decision; the candidate report preserves the earlier deposit while marking the new configured action denied.

## What recovery loses

The recovered snapshot is older than the failed candidate. A later completed delivery disappears from the restored score, along with intervening movement, inputs and the earlier pickup. The runner reports original and restored ticks, discarded recorded operations, score difference and successful post-snapshot actions. Each lost successful action retains its original lineage and input sequence. The new successful pickup is a new action in the recovered branch; it does not replay or compensate the discarded delivery.

`dataLoss.restored` records whether a snapshot was actually restored. `restoredActionApplied` records whether the following interaction succeeded. Restoring the older, farther-away snapshot can make the first value true and the second false. Do not infer a successful action from a successful restore.

The failed candidate acknowledged inputs through sequence 12, but the selected snapshot remembers only sequence 3. `dataLoss.acknowledgedSequences` therefore reports `highestBeforeRestore:12`, `restoredLastSeq:3` and the reopened range `4–12`. The new branch pickup uses sequence 4 again. A production recovery design would need additional coordination, such as a recovery epoch that distinguishes branches or a retained sequence floor that prevents reuse, with defined client retry behavior. This trial implements neither; the lineage label only makes the consequence visible.

Practice: explain the difference between “the same legal action works again” and “no acknowledged action was lost.” Describe what additional coordination would be needed before making the second claim in a system with external payments or shared resources. This toy restore has no database transaction, compensation log or concurrent clients and makes no production rollback guarantee.

Append each correction and assistance declaration in `response.md`. The new repair-service scenario at the end asks for the same compatibility and loss reasoning with a different state change. It is a separate review prompt, not an automatically scored proof of transfer or human learning.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
