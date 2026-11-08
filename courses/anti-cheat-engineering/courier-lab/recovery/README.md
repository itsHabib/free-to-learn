# Recovery author and integration notes

M10 teaches recovery of package, configuration and state as a compatible tuple. All actions run in the owned local courier world. No files are changed by the trial; no deployment, OS change, third-party account or production migration is involved.

From the project directory:

```sh
node --test tests/recovery.test.mjs
```

## Policy contract

`policy.mjs` exports the author implementation `selectRecovery(evidence)`. The learner receives `template.mjs`, `prompt.json`, `LEARNER.md` and `response-template.md`. The shared core runner imports owner-side `fixtures.mjs`, whose async `assess(candidate)` returns `{passed,criteria}`. Do not copy the author policy or controls into the learner workspace.

Evidence has `{targetReleaseId,releases,configurations,snapshots}`. Release fields are `{id,packageHash,stateSchema,configId,configHash}`. Configuration fields are `{id,hash,releaseId,stateSchema,maxInteractionDistanceMm}`. Snapshot fields are `{id,hash,ordinal,stateSchema,configId,configHash,state}`. Additional provenance fields are allowed. Arrays have unique IDs, ordinals are nonnegative safe integers, hashes are opaque identity strings and all evidence is deeply frozen.

Selection first resolves the declared release, then checks its named configuration's exact hash, release ID and schema, then filters snapshots by matching schema, configuration ID and hash. Greatest ordinal wins; ties use ascending JavaScript string order of ID. Success is exactly `{ok:true,releaseId,packageHash,configId,configHash,snapshotId,snapshotHash}`. Refusals are exactly `{ok:false,reason}` with `unknown-target`, `configuration-mismatch` or `no-compatible-snapshot`, in that precedence order. The selector does not decode, modify or manufacture state.

`controls.mjs` supplies two correct implementations (filter/sort and independent scan) and eleven isolated wrong controls: code-only tuple, newest regardless of compatibility, oldest compatible snapshot, ignored target, ignored configuration hash, ignored schema, invented configuration, silent target fallback, mutation of source evidence, array-order tie breaking and locale collation. Sixteen pure fixture cases and one actual-game trial criterion calibrate the checker. A mixed-case `a-ready`/`Z-ready` fixture distinguishes locale collation from the required UTF-16 code-unit order. Failures retain input, expected/actual behavior and a teaching-section link.

## Trial APIs

`runtime.mjs` exports:

| API | Result |
| --- | --- |
| `TRIAL_VERSION` | `courier-recovery-trial-v2` |
| `RECOVERY_LIMIT` | Required limitation text about local scope and lost actions. |
| `hashValue(value)` | SHA-256 of recursively key-sorted JSON. |
| `createTrialEvidence()` | Async, deterministic frozen `{evidence,baseline,candidate,codeOnly,live,postSnapshotActions,current,currentEventIndex,action,limitations}`. |
| `runTrial(candidatePolicy)` | Async; candidate has `selectRecovery(evidence)`. Returns `{schema,baseline,candidate,codeOnly,recovered,selection,identities,dataLoss,limitations}`. |

Successful action observations contain `{phase,lineage,inputSeq,identity,action,status,reason,before,after,engineDecision}`. `lineage` is `original` for the continuing pre-recovery branch, or `restored-from:<snapshotId>@tick<tick>` for a restored branch. `inputSeq` is the actual sequence admitted to the engine. `identity` contains release/package, configuration/hash, snapshot/hash and state schema. Before/after state is `{tick,actor,lastDecision}` from the existing engine's canonical snapshot. Refused restores contain `{phase,lineage:null,inputSeq:null,status:'refused',reason}` and identity when it can be resolved: no new action or branch has run. A code-only observation also records separate state/configuration incompatibility flags.

`identities` contains the exact validated selection evidence, including named state bodies, to keep provenance inspectable. `dataLoss` reports `restored`, `restoredActionApplied`, `fromTick`, `restoredTick`, `discardedTicks`, `discardedRecordedOperations`, `scoreBeforeRecovery`, `scoreAtRestoredSnapshot`, `lostScore`, `acknowledgedSequences`, `discardedSuccessfulActions` and a limitation note. A failed restore has null restore/loss counts; it must not claim recovery happened. An actual restore followed by a refused interaction has `restored:true` and `restoredActionApplied:false`. This v2 report replaces the ambiguous v1 `applied` field; it does not rewrite earlier saved v1 reports.

`acknowledgedSequences` contains `{highestBeforeRestore,restoredLastSeq,reopened}`. `reopened` is an inclusive range string, or null when no acknowledged sequence became reusable or no restore occurred. Each discarded successful action contains `{lineage,inputSeq,tick,status,reason}`. The correct trial reports highest sequence 12, restored sequence 3, and reopened range `4–12`; the new branch action uses sequence 4. These sequence numbers are taken from real actor state, rather than inferred from tick numbers.

The runner computes package identities from hashes of the real engine, admission, defense, telemetry runtime and recovery adapter source, plus release/schema descriptors. Configuration hashes identify their complete JSON bodies. Snapshot hashes identify actual saved state. Hashes identify bytes and declared bundles; they do not authenticate their producer or prove a deployment occurred.

## Real game behavior and its bounds

The trial moves a real actor to x=1750, y=1000, saves baseline state at tick 3, then performs pickup at tick 4 and delivery at tick 8 through the existing engine. It returns to the pickup boundary at tick 11. The baseline configuration allows 250 mm; the candidate allows 100 mm. The narrow adapter checks range for an idle interaction against authoritative position before forwarding the interaction bit to the unchanged engine. If blocked, it still admits an idle non-interaction input and advances the real world. The report calls this `configuration-range`, with `engineDecision:null`; it never mislabels that adapter denial as an engine proximity decision.

State v1 is `{schema:1,checkpoint}`. Forward capture for the candidate produces v2 `{schema:2,payload:{world:checkpoint}}`. The old decoder rejects v2 before attempting restore. The code-only trial deliberately keeps candidate state/configuration with the old package. Full recovery loads the compatible named baseline state and repeats the same idle pickup. No selector rewrites either envelope.

The correct run has baseline pickup applied, candidate configured denial, code-only `state-schema` refusal and recovered pickup applied. The current trial reaches tick 12; recovery returns to tick 3, discarding 9 ticks and 18 recorded operations. The completed delivery's score is lost (1 to 0), along with the post-snapshot pickup and deposit. The recovered pickup is a new branch action and does not compensate those losses. All original phase objects remain separate. A recovery epoch or an independently retained sequence floor, with coordinated client retry behavior, would be needed to prevent an acknowledged input from being accepted on the restored branch. Neither is implemented: `lineage` is evidence, not an admission safeguard.

Parent integration owns CLI/report paths, source capture, module registration and browser presentation. Preserve the failed trial and later recovery as separate evidence, state the output path and settings, and display package/configuration/state identities. The trial writes no files itself, so the existing attempt runner remains responsible for immutable saved reports and first attempts.

## Course-craft trace

Exact policy requirements and the engine trial assess an executable recovery decision (`assessment-03`, `projects-03`). Independent correct/wrong controls calibrate the checker (`assessment-09`). Expected/actual feedback links a repair paragraph (`feedback-07`); original and revised responses stay separate. The repair-service transfer changes both state and an external side effect and remains an ungraded review prompt (`assessment-02`). These deterministic checks do not establish human learning, production rollback safety or rendered usability (`evaluation-01`). Parent technical review, cold-reader and desktop/mobile checks remain integration acceptance work.
