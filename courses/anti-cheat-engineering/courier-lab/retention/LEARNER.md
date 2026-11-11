# M9: Keep a useful, bounded export

Implementation reference for **M9: retention**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

Implement `retain(events, settings)` so an owner can keep a small denial-event export without copying every field available at capture time. Then measure what two limits save and explain which later questions the smaller export cannot answer. This exercise assumes the earlier replay and detector work, plus JavaScript arrays and objects.

A denial event describes an interaction that the game refused. An **export** is a file made for later inspection. A **retention limit** decides which observations remain in that file. The game may need much more state to continue running or reproduce a history; this exercise changes only the export.

Use synthetic data only. Do not substitute live accounts, actual tokens, addresses or device data into this lab.

## The contract

From the reference project run:

```sh
npm run core:prepare -- retention
```

Open the printed workspace and edit `retention/policy.mjs`. The function takes an event array and `{nowTick,maxAgeTicks,maxEvents}` and returns an array. The source events are already in nondecreasing tick order. Equal-tick events retain their original order. `nowTick` is a nonnegative integer and both bounds are positive integers. Each event already has an integer tick, string actor ID and reason, and a finite nonnegative squared distance.

Keep only events newer than `nowTick-maxAgeTicks` and no later than `nowTick`. Among those, retain the newest `maxEvents` as four-field records. You can assume the inputs are valid. This exercise assesses the retention decisions, rather than an additional parser. Optional input validation must not change the result for valid inputs. Keep filesystem work, wall clocks and measurements out of your policy; the supplied owner helpers handle them.

Before inspecting a run, record the required first answers or explicit skip reasons in `predictions.json` and explanations in `response.md`: where the old edge belongs, how a count limit treats a tie, and what remains after deleting one export. These predictions are reviewed alongside your work and are not automatically graded.

## The tick window

Keep an event only when:

```text
nowTick - maxAgeTicks < event.tick <= nowTick
```

The left edge is exclusive; an event exactly that old is removed. The current tick is inclusive. A future event is removed even if there is room in the file. `maxAgeTicks` measures game ticks, not seconds. The setting says nothing about wall-clock retention without a separate mapping between those units.

Follow a small sibling example. Suppose the current tick is 20 and the age bound is 5. The old edge is 15. Ticks 14 and 15 fall outside the window, ticks 16 and 20 fall inside, and tick 21 is in the future. Filtering by age before limiting the count matters: future observations must not displace usable observations.

Compare this with your edge prediction and append any correction. Do not replace the original prediction.

## The count bound

After selecting the window, keep at most `maxEvents` of its newest entries. Because the input is already sorted, the newest entries form its tail. Return that tail in the supplied order. You do not need to sort anything, fill missing ticks or combine events that share a tick.

For a separate example, the eligible entries are `A@16, B@18, C@18, D@20` and the count bound is three. The result is `B@18, C@18, D@20`. B still precedes C because that was their observed order. A count bound can shorten the useful history even when the age bound would permit older entries.

In `response.md`, explain what would happen if there were six eligible entries at the current tick and the count bound were four. State which property chooses between the tied entries.

## Four fields only

Each returned event has exactly:

```js
{ tick, actorId, reason, distanceSquared }
```

Copy those values explicitly. Extra fields such as `capability`, `address` and `device` occur only as synthetic examples in the supplied source. Copying the source object wholesale defeats the export's narrow purpose. Deleting unwanted fields from a source object also breaks the contract: a caller may still need the original event. Construct the retained objects without changing the input array, its objects or the settings.

The retained actor ID is **pseudonymous**: it labels an actor without directly naming a person. Its repeated actions still describe behavior and may be linkable to other information. Removing an address does not establish anonymity. The four-field format is minimization for this exercise, not a claim that those fields are appropriate for every real system.

Submit your source after the first predictions:

```sh
npm run core:check -- --assistance "none"
```

Replace `none` with the actual help used. The core runner captures the exact question, source, response and assistance and preserves first and revised attempts separately. After that capture, its prediction feedback gives the keyed answers and reasons, plus fresh questions. Compare them with your saved first predictions and append any correction; the written answers remain ungraded. Read the first failed code criterion's expected and actual result and its teaching link. Fix the decision it identifies, append why the change addresses that failure, and check again. A pass means agreement with the stated cases; it does not prove every possible input or establish learning gains.

## Export and deletion scope

Finish the selection policy before interpreting the export helper or a deletion receipt.

## Build in three checked milestones

1. **Window first.** Trace the worked age window above, including both edges and a future observation. Completion: `nowTick=30`, `maxAgeTicks=4`, and source ticks 26, 27, 29, 30, 31. Decide eligibility before considering a count bound. Keep that calculation separate from the required first predictions.
2. **Count and projection.** For the eligible completion entries, apply a count bound of two and construct only the four named fields. Hand-check a tie using source order. Keep the source objects unchanged: projection means producing a smaller new record, not deleting fields from a caller's record.
3. **Inspect and measure.** Use the first failed core criterion to locate a window, count, order, shape or mutation error. After repairing the policy, run the declared measurement settings and check what they remove. A smaller file alone does not establish useful evidence.

<details><summary>Hint 1 — decide what is eligible</summary>

Filter the age interval before applying the count bound. Otherwise a future or expired event can take a slot that belongs to an eligible observation.

</details>

<details><summary>Hint 2 — use the supplied order</summary>

The input is already sorted and equal-tick entries keep their order. The newest eligible entries form a tail; sorting or deduplicating would add a rule the contract never requested.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

At tick 20 with age 5, the exclusive old edge is 15. From eligible `A@16, B@18, C@18, D@20`, a count of three keeps B, C and D in that order. Record this as assistance; finish the different tick-30 completion yourself.

</details>

## Define one deletion's scope

The reference `store.mjs` helper applies a policy, checks the output bounds and four-field shape, encodes it, then writes one new file. It refuses an existing destination and an export over its declared byte limit. Its receipt reports settings, counts, byte length, path and a digest of the bytes. It does not save the raw source events or make a backup.

`deleteExport(receipt)` checks that the receipt still names the same regular file and removes that export. A missing or changed file produces an error. Record the actual path and successful deletion result. Deleting this file does not erase another export, an explicit copy someone made, a learner attempt or a causal checkpoint. Do not claim all captured data was deleted.

A **causal checkpoint** stores enough state to continue replay, such as pending intent, positions and detector history. This minimized export stores only selected denial observations. It cannot replace a checkpoint, and replay requirements do not justify silently adding checkpoint state to this export.

## Measure the tradeoff

The supplied `measureRetention` helper uses the named `courier-denials-v1` synthetic workload: 4,096 events ending at tick 4,095. Declare at least two settings, a warmup count and a measured sample count in `response.md` before inspecting results. From the reference project, run the following shape with your workspace policy and a new output path; each setting is `nowTick:maxAgeTicks:maxEvents`:

```sh
npm run retention:measure -- <workspace>/retention/policy.mjs <new-report>.json 4095:512:64 4095:128:16 --warmup 5 --samples 20
```

Substitute your declared values. The report echoes the actual settings and counts used, along with workload name, size and digest, Node version, platform, architecture, retained counts, elapsed samples and JSON byte lengths. Compare that echo with your declaration before interpreting the results. Omitting settings and counts uses the stated defaults of 2048/1024 and 256/128 at tick 4095, with two warmups and five measured samples; do not describe that default run as your different declaration. The digest identifies the exact workload bytes without putting source identifiers in the report.

The report measures two scopes. **Whole operation** includes source validation, copying, the policy, mutation checks, output validation and JSON encoding. **Policy plus encoding** adds the measured policy call to JSON encoding and byte counting; it excludes those validation and copying steps. Both exclude disk I/O. Warmup exercises the same operation before measured samples. Keep every elapsed sample for both scopes instead of reporting only the fastest. With fewer than 20 samples, the summary calls its largest observation the maximum; it does not call it p95. With at least 20 samples, p95 is the nearest-rank sample percentile, still not a stable estimate of production tail latency.

JSON bytes are the direct cost these limits change. Whole-operation time may change little because validation and copying still inspect the complete input. Compare the two scopes before attributing elapsed time to retention. Process allocations, garbage collection, other work on the machine and runtime warmup affect both timings; encoded JSON bytes do not measure the process's total memory use. This local sequential exercise provides no production capacity estimate.

Record which observations disappear under the smaller setting, using tick ranges and counts rather than copying discarded identifiers. A smaller file is only useful if the evidence it keeps can still support the question being asked.

## Reconcile the detector window

Suppose an advisory detector examines the previous 20 ticks, while the export retains only the previous 8 ticks. At tick 40, relevant observations occurred at ticks 23, 29 and 37. In `response.md`, explain which observations remain in the export, which past threshold decision cannot be independently recomputed from it, and how a count limit could discard more evidence. Distinguish the detector's live causal state from what an auditor can establish using this export alone.

## Transfer for review

A collaborative drawing tool exports rejected edits for debugging. It needs to explain a rate-limit decision over 30 seconds, while users can request that old exports be deleted. Propose a minimal event shape and two retention bounds, explain how they support or limit that debugging question, and define exactly what one deletion action removes. Explain what separate policy would govern any live rate-limit state or another saved copy. This is an ungraded design review; preserve your first answer and append repairs. The author keeps a separate advisory rubric and reference design for the reviewer; a code pass does not review this proposal.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
