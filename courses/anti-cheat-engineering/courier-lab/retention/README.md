# Retention author and integration notes

The learner implements `retain(events, {nowTick,maxAgeTicks,maxEvents})`. Inputs are validated and sorted. The age window is exclusive on the old edge and inclusive at now; then keep the newest count in stable input order and create exactly `{tick,actorId,reason,distanceSquared}`. Input validation is intentionally outside the assessed pure policy; the owner helper validates its own integration boundary. No dependency on the evaluation module is needed.

`template.mjs`, `prompt.json`, `LEARNER.md` and `response-template.md` are learner inputs. Keep reference `policy.mjs`, `fixtures.mjs` and `controls.mjs` out of the editable solution slot. The parent integration owns registry, prepare/check commands and browser views. The guide uses that shared runner contract; it does not introduce another attempt store.

Exports:

- `fixtures.mjs`: `cases()` and async `assess(candidate) -> {passed,criteria}`. Each failed criterion contains `message`, `expected`, `actual` and a `LEARNER.md` source. Synthetic extra field values are redacted from failure displays. Eight annotated wrong controls and two separately structured correct controls calibrate it.
- `store.mjs`: `validateEvents(events)`, `validateSettings(settings)`, `buildExport(events,settings,{policy=retain,maxBytes=1048576,measure=false}={}) -> {payload,json,summary}`. Source arrays have at most `MAX_SOURCE_EVENTS=100000`; ticks and limits use safe integers; actor ID/reason strings have 1–128 characters. Unknown source fields are discarded by the policy. Output validation checks four fields, age/count, source values and stable subsequence order; the assessment additionally checks newest selection. `payload` has `{schema:1,kind:'minimized-denial-events',settings,events}`; newline-terminated UTF-8 `json` is what byte counts measure. Summary contains only settings, counts, byte length and limit. When `measure:true`, the return value also has `timings:{policyMs,encodeMs,policyAndEncodeMs}`. Policy and encoding are timed separately, leaving input/output validation, cloning and mutation checks outside their sum. Encoding includes UTF-8 byte counting.
- `writeExport(path,events,settings,options={}) -> Promise<receipt>` applies `buildExport` and writes exactly one new file, mode 0600, with exclusive creation. Its parent directory must already exist. Existing destinations and oversize output are refused. The receipt adds absolute `path`, `kind` and SHA-256. No source file or backup is written.
- `deleteExport(receipt) -> Promise<{path,deleted,jsonBytes,scope}>` deletes that unchanged regular file after checking its digest. It refuses missing, changed or symbolic-link paths. It does not delete other copies, other exports, learner evidence or checkpoints. This local helper is not a secure concurrent file replacement protocol or a forensic disk-erasure guarantee.
- `measure.mjs`: `createSyntheticWorkload(eventCount=4096) -> {name:'courier-denials-v1',version:1,events}` and `measureRetention({workload,settings,warmup=2,samples=5,policy=retain}={})`. `settings` is an array of 2–16 setting objects; defaults compare age/count 2048/1024 and 256/128 at the workload's final tick. Warmup is 0–100, samples 1–100. Schema 2 reports echo the selected `settings`, `warmup` and `samples`. Each run retains its `elapsedMs` and `jsonByteSamples` fields and adds raw `policyMs`, `encodeMs`, and `policyAndEncodeMs` arrays. `timingSummary.wholeOperation` summarizes `elapsedMs`; `timingSummary.policyAndEncode` summarizes the narrower sum. Both contain `{sampleCount,medianMs,maxMs,p95Ms,tailStatistic,tailMs}`. Below 20 samples, `p95Ms` is null, `tailStatistic` is `max` and `tailMs` is the observed maximum. At 20 or more samples, `p95Ms` uses nearest rank, `tailStatistic` is `p95` and `tailMs` is that sample percentile; this does not establish a population tail estimate. `summarizeTimings(values)` computes that summary without mutating its input. Reports include workload SHA-256, retained count, Node version, platform and architecture, and no event identifiers or source values. Source events are synthesized and kept only in memory.
- `feedback.mjs`: `postCheckFeedback()` returns keyed prediction answers, reasons, teaching links and fresh variant questions. The owner releases it only after capturing the submitted response; it is not part of a fresh workspace and does not claim to grade prose. `reviewerFeedback()` separately returns fresh-variant answers, the reconciliation key and a transfer rubric/reference design for advisory review. Do not display reviewer material in ordinary check feedback.

Example integration from the project directory, after selecting the submitted policy:

```js
import { writeExport, deleteExport } from './retention/store.mjs';
import { createSyntheticWorkload, measureRetention } from './retention/measure.mjs';
import { retain } from './retention/policy.mjs';

const workload = createSyntheticWorkload();
const settings = [
  { nowTick: 4095, maxAgeTicks: 2048, maxEvents: 1024 },
  { nowTick: 4095, maxAgeTicks: 256, maxEvents: 128 },
];
const report = measureRetention({ workload, settings, warmup: 2, samples: 5, policy: retain });
const receipt = await writeExport('/existing/scratch/denials.json', workload.events, settings[1], { policy: retain });
const deletion = await deleteExport(receipt);
// Persist report, receipt and deletion if wanted; do not persist workload.events.
```

Retained actor IDs remain pseudonymous behavior. This export is not an anonymous data set and is not a causal replay checkpoint. Shrinking it may make a prior detector decision unreconstructable from the export even while the live detector has state supporting its own decision. JSON bytes are the directly changed cost: whole-operation timing may be dominated by validating and cloning the same input. JSON size is not total process memory; local sequential elapsed samples do not establish production capacity. No timing threshold appears in the tests.

Run from the project directory:

```sh
node --test tests/retention.test.mjs
```

Tests exercise real scratch-file creation and deletion, unchanged neighboring exports, byte bounds, report omission of source data and calibration. This source-only module has no UI; desktop/mobile rendering, shared CLI integration and cold-reader review remain integration acceptance work.

Course-craft trace: `assessment-03` links the outcome to executable source; `assessment-09` is covered by two correct and eight intended wrong controls; `feedback-07` supplies expected/actual behavior and repair links; predictions and appended response history support `practice-08` and attempt preservation. Post-capture keys and fresh questions support `feedback-02` and `practice-10`. Transfer remains ungraded advisory review with a separate rubric and reference design (`assessment-02`, `assessment-15`). Measurement scopes and small-sample labels address `evaluation-02`; no test is a claim of human learning (`evaluation-01`).
