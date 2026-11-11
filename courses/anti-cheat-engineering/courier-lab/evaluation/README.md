# Evaluation author and integration notes

M7 builds a classifier and case-level report for the owned local courier game. No third-party telemetry, accounts or human behavior are collected. `policy.mjs` is the author solution; learner workspaces receive `template.mjs`, `prompt.json`, `LEARNER.md` and `response-template.md`. Keep fixtures, controls and the author solution outside the editable policy location.

Run the focused verification from the project directory:

```sh
node --test tests/evaluation.test.mjs
```

## Policy and assessment

`classify(signals,settings)` and `evaluate(cases,settings)` implement the wave-4 contract. Inputs are validated, signals are sorted and may contain equal-tick entries. An eligible signal is `range` with `distanceSquared > minDistanceMm²`. Any window `(latest-windowTicks,latest]` reaching the threshold flags the case. Labels are consulted only after prediction; the output preserves case order and counts each case once. Undefined denominators return `null`.

`fixtures.mjs` exports `cases()` and async `assess(candidate)` returning `{passed,criteria:[{name,passed,error?}]}`. Nineteen behavioral criteria cover eligibility, every window rather than only the final one, both strict boundaries, equal ticks, case order, one vote per case, label independence, three different denominators and empty sets. Failed criteria include the input, expected/actual result and a specific `LEARNER.md` section. Runtime failures are recorded as failures rather than throwing away the attempt.

`controls.mjs` exports `correctPolicies` and `wrongPolicies`. The two correct policies independently implement a sliding window and direct window counting with grouped metrics. Eleven wrong controls exercise observation-weighted metrics, cooldown inclusion, inclusive left edge, label leakage, total-based denominators, null-to-zero conversion, final-window-only classification, lifetime accumulation, inclusive distance edge, same-tick deduplication and reversed decision order. These are grader calibration controls, not learner submissions or evidence of learning.

## Corpus APIs and schema

`corpus.mjs` exports:

| Export | Contract |
| --- | --- |
| `CORPUS_VERSION` | `courier-synthetic-evaluation-v2`. |
| `DEFAULT_SETTINGS` | Frozen example `{threshold:3,windowTicks:20,minDistanceMm:500}`; illustrative, not a production recommendation. |
| `SPLIT_IDS` | Frozen `exploration` and `evaluation` ID arrays fixed before settings selection. |
| `generateCorpus()` | Deterministically produce fourteen fresh cases through the real recorder wrappers; no files written. |
| `loadCorpus(source?)` | Async generation when omitted; otherwise validate a corpus object, JSON text, filesystem path or file URL. Replay every record, validate labels/splits, and compare extracted signals. Return a detached corpus. |
| `casesForSplit(corpus,split)` | Project the seven stable IDs in their declared order to detached `{id,label,signals}` inputs. Use a generated or loaded corpus. |
| `extractDenials(record)` | Validate via the current telemetry `replayWindow` and `createReplayEngine` facade, replay the retained operations and return `{tick,actorId,reason,distanceSquared}[]`. |
| `extractSignals(record,{actorId='actor-1'}={})` | Project one actor's denials to `{tick,reason,distanceSquared}[]`; refuse unknown actors. |

Corpus envelope:

```text
{
  schema: 'courier-evaluation-corpus-v2', version,
  labelDefinition, limitations,
  splits: {exploration: string[7], evaluation: string[7]},
  cases: [{id, split, family, description, label, declaredAutomation, actorId, record, signals}]
}
```

The evaluation split adds a delayed start, repeated-invalid receipts six ticks apart and three widely separated errors rather than copying the exploration signals. The required comparison uses threshold 3, minimum distance 500 mm, and windows 8 and 20. Exploration flags its tight repeated-invalid burst at both windows. Evaluation does not flag its six-tick-spaced burst at window 8, but flags at window 20. These results make the split distinction observable without pretending the shipped corpus is secret. Each split has six negative and one positive violation label. Families are `honest-delivery`, `pickup-repress`, `anticipatory-presses`, `delayed-reordered-retries`, `isolated-distant-errors`, `repeated-distant-invalid` and `valid-automation`. True means the repeated-distant-invalid script; false means a script without that repeated-invalid behavior. `declaredAutomation` is true only for the legal automated twin and is separate metadata, never a feature passed to the policy. These are author-assigned synthetic labels, never inferred human intentions. Delayed/reordered retries are controlled input arrival order, not a claim about real network delay or a wall clock.

The honest-delivery and valid-automation twins have byte-identical records and identical empty signal arrays within each split. Both have negative violation labels; only their automation metadata and descriptive identity differ. A deterministic signal classifier must return the same decision for them, so the report carries a separate `indistinguishablePair` diagnostic about automation status. Accepting both is correct for the repeated-invalid target, not an unavoidable false negative. Example settings yield seven cases per split with `tp=1,fp=0,tn=6,fn=0`: precision 1, recall 1, false-positive rate 0. These are counts for the script mix only. They do not estimate operational performance, human false-positive rates or prevalence.

Records use `createRecordedEngine` at capacity 256 with no direct state mutation. All generated records retain the complete history (`startIndex=0`); no record hits the capacity limit. Extraction validates the record first, then derives the denied interaction's distance from the replayed post-movement position and current target. It uses neither the client request nor the engine's preconfigured detector findings as evidence. It emits a persisted `lastDecision` only when its tick equals the current replay tick. A rolled window is supported, but signals before the checkpoint are intentionally absent; checkpoint detector buckets are not invented full observations. The fixed depot coordinate, 1000/1000, matches `courier-runtime-1`.

## Committed report APIs

`report.mjs` uses Node core only. It exports:

- `hashValue(value)`: SHA-256 of recursively key-sorted JSON for deterministic settings/corpus identity.
- `prepareEvaluation({settings,source,corpus?})`: async validate and commit exact settings, candidate source bytes and corpus, returning `{schema,corpusVersion,settings,settingsSha256,sourceSha256,corpusSha256,splitIds}`. Preserve this plan before evaluation.
- `runEvaluation(candidate,{plan,source,corpus?})`: async verify the earlier plan against the same source/corpus, then return `{schema,plan,exploration,evaluation,noPositiveNoPrediction,indistinguishablePair,labelDefinition,limitations}`. Each split has `{caseIds,positiveLabels,negativeLabels,result}` and `result` is the candidate's `{decisions,metrics}`. The no-positive diagnostic is a negative quiet case with no positive labels and no predictions under a correct policy. `indistinguishablePair` contains a claim plus a `splits` array with `{split,caseIds,declaredAutomation,identicalSignals,decisions,sameDecision}` for the two legal twins. This metadata is attached after policy evaluation; it is never supplied to `classify` or `evaluate`.
- `REPORT_LIMIT`: required plain-language limitation string.

The caller must bind the imported candidate module to the same captured `source` bytes and preserve plan/report files in the existing attempt flow. A source hash supplied by a caller cannot prove this binding by itself. This module writes no files, changes no earlier attempts and adds no CLI. The parent integration owns file paths, captured-source execution, display and prepare/check registration. It must state output paths and settings, keep exploration/evaluation distinct and record post-evaluation retuning as revision.

The report does not use elapsed time or a random split; re-running the same source, settings and corpus is reproducible. The corpus is shipped and inspectable. It is a fixed synthetic evaluation split, not a secret held-out human assessment.

## Prediction feedback and reviewer key

`feedback.mjs` stays outside prepared workspaces. After the checker has saved the submitted response, the integration calls `postCheckFeedback()` to release `{schema:1,module:'evaluation',predictions}`. Each prediction carries `{id,question,answer,reason,source,freshVariant:{question}}`. The source points to the actual learner section. This supplies numeric answers and reasons even when the submitted code passes first time; it does not silently grade free-form prose or replace the learner's answer.

`reviewerFeedback()` is separate author material: it returns the fresh variants' reference answers plus a rubric and reference answer for the repair-station transfer. It must not be included in the first post-check payload or copied into a learner workspace. The transfer still needs a review; automatic code checks cannot establish the quality of that written reasoning.

## Course-craft trace and remaining acceptance

Executable functions assess the stated production task (`assessment-03`, `projects-03`). Independent correct and wrong controls calibrate the checker (`assessment-09`). Input/expected/actual feedback and section links support repair (`feedback-07`), while the response keeps first predictions, settings and revisions separate. Post-check prediction answers and fresh variants address `feedback-02` and `practice-10`; the author-only transfer rubric makes separate review concrete (`assessment-15`). The transfer asks for a different repair-resource mechanic and is an ungraded review prompt (`assessment-02`), not evidence of learning (`evaluation-01`).

Tests establish deterministic policy behavior, real replay extraction, synthetic label/split integrity, report commitments and calibrated feedback. Parent integration still owns the actual prepare/edit/check path, desktop/mobile presentation and independent technical/cold-reader review. No browser or human-learning claim follows from this module's Node tests.
