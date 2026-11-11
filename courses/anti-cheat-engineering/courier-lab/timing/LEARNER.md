# Investigate delay, expiry and recovery

Implementation reference for **M4: timing**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

Goal: predict what the owner processes when requests arrive late or a connection disappears, then explain a safe recovery. Allow roughly 30–50 minutes including code and repairs; this estimate has not been tried with learners.

## Prepare and predict

From the reference project run `npm run core:prepare -- timing`. Change into the printed workspace. Read this guide and complete the required answers or explicit skip reasons in `predictions.json`; keep explanations in `response.md` before editing `timing/policy.mjs` or running its checker. You will compare a pure prediction function with the existing game engine and owner clock, rather than replace either mechanism.

A **receipt** is an input reaching the owner. A **processed tick** is one simulation step the owner actually performs. A **connection binding** links one client label to one server actor. A **resume** uses that same binding; a **fresh join** creates another actor. A **callback** is a function the runtime invokes when work is ready. Here callback time means the owner clock reading when that function runs. Client send time, server receipt tick and owner elapsed time answer different questions.

## Receipt and movement

The owner receives a parsed input containing a sequence and E, W or idle direction. Its optional `sentAtMs` annotation records what the client claimed; it cannot grant earlier movement. Only a strictly larger sequence is admitted. Admission sets expiry using the current processed tick, replaces direction and leaves position unchanged until the next tick.

This partial worked example shows how to read the fields without solving the assessment: an idle input admitted at tick 6 has `receipt:{status:'admitted',tick:6,seq:1}` and expiry 10. Position remains at 1000 because idle is not motion. An observed tick of 6 is an owner state, not six requests and not a client timestamp.

## Four processed ticks

An input admitted at T can move on T+1, T+2, T+3 and T+4. At T+5 it cannot move unless a newer input renewed the window. Each eligible E/W step changes x by 250 mm. The scripts stay on open floor so a wall or arena edge cannot hide an expiry defect. They do not teach collision prediction.

## Retries and reordering

A repeated sequence is stale even if the prior response was lost. An older conflicting sequence is also stale. Neither changes position, direction or expiry. A new sequence received after a gap grants a new four-tick window; it cannot repay steps that never ran. This is protocol behavior, not evidence that a retry came from a cheater.

## Owner clock

Every sample uses elapsed milliseconds since the previous sample plus the retained fraction. Divide by 50 and take whole ticks. Process at most five; drop excess whole ticks and keep only the fraction. Increment overruns once for a callback that dropped work. For example, an idle world sampled at 26 ms then 51 ms performs zero ticks with remainder 26, followed by one tick with remainder 1. It must not discard the first fraction.

Dropped work is not processed time. A callback delayed by seconds does not make the actor leap through every nominal tick. Nor does sampling twice at the same millisecond create a step.

## A clock has an origin

A **monotonic clock** measures elapsed time without going backward when the calendar clock is corrected. Its readings are meaningful relative to an origin. In Node, `performance.now()` measures milliseconds from the start of the current process; see the [official API](https://nodejs.org/api/perf_hooks.html#performancenow). It is not the number of simulation ticks processed.

Worked comparison: in one process, readings 120 ms and 170 ms are 50 ms apart. If a new process starts and reads 20 ms, subtracting the old 170 from the new 20 does not measure a negative interval. Those readings use different origins. The application needs a declared cross-restart time contract before it can decide what survived. This is a design consequence of the API's process-relative origin, not a guarantee supplied by a timestamp.

Completion practice: the same process reads 45 ms, then 95 ms. Record the elapsed interval. A restarted process next reads 10 ms. Can those three numbers alone establish how long the restart took? Compare your explanation with the origin rule above, then tackle the separate reservation-deadline transfer in response.md.

## Connection recovery

The mechanism models a delivery outage by preventing inputs on a disconnected binding from reaching admission. The owner engine keeps running. Disconnect does not delete an actor, clear its last sequence or instantly stop already-admitted motion. The old window expires normally.

Resume restores that binding. Its position, last sequence and expiry persist, so retrying an already admitted sequence remains stale. A fresh join uses a different connection label and creates the next server actor at its starting state. The old actor remains until the owned world is discarded. This matches the game engine's actor lifetime; it does not model production session cleanup, TCP retransmission, tokens or restart authentication. No bearer token is exported.

## The contract

Implement `predictTiming(record)` without file, network or real-time APIs. The owner validates each record before use. Input has `schema:1`, `startMs` and up to 80 labelled `actions`:

| type | Extra fields | Meaning |
| --- | --- | --- |
| join | id | New connection and actor; at most four |
| input | id, seq, move; optional sentAtMs | Attempt delivery; move is E, W or idle |
| sample | nowMs | Finite nondecreasing owner reading |
| disconnect | id | Pause delivery on an existing binding |
| resume | id | Restore the same binding |

Return `{ok:true,checkpoints}` with one checkpoint after every action. A checkpoint has `label`, processed `tick`, ordered `actors`, `receipt` and `clock`. Each actor has `{id,connection,connected,lastSeq,expiresAt,x}`. IDs are actor-1 onward; starting x is 1000, lastSeq and expiresAt are zero. Keep private direction state inside your function. Other state starts idle and the clock starts at `startMs`, tick 0, remainder 0 and overruns 0.

Only input actions have a receipt: `{status,tick,seq}`. Status is admitted, stale or offline. Only sample actions have a clock result: `{ticks,dropped,overruns,remainder}`. Use `null` for the other actions. Do not insert client time into these outputs or mutate the input record.

## Build in four checked milestones

Work through [the timing predictor companion](../learning-support/timing-predictor.md) before constructing the whole function. It supplies a complete smaller clock trace, a partial trace, and a smaller actor trace. Its 10 ms/two-tick clock and three-tick movement window are sibling rules, not this contract's constants.

1. **Clock state.** Write a trace with only sample actions. Track previous owner reading, fractional remainder, processed tick and overruns. Check each row with the worked calculation, including a repeated reading and a delay above the cap. This isolates clock arithmetic from actor logic.
2. **One actor.** Add join, one admitted input and enough samples to cross expiry. At the input checkpoint, position must be unchanged. At subsequent checkpoints, list each processed tick before adding movement. This catches movement at receipt and an off-by-one expiry separately.
3. **Delivery and identity.** Add a duplicate, older sequence, disconnect, offline input, resume and fresh join. Check which actor record persists and which sequence/expiry fields remain unchanged. Offline delivery is not a new sequence admission.
4. **Checkpoint output.** Build a fresh returned actor object after each action, excluding private direction. Inspect earlier checkpoints after later actions: old positions and flags must not change. The number and order of checkpoints must match actions, including joins and disconnects.

These milestones are source-construction aids, not additional commands or progress scores. The core checker reports the first differing checkpoint after a captured attempt. Identify the earliest differing field; later positions can be consequences of one wrong clock or expiry value.

<details><summary>Hint 1 — separate ownership</summary>

Write an action-to-fields table before the loop. Only a sample advances the processed tick; only admitted input replaces direction and expiry. This keeps a client annotation from changing owner time.

</details>

<details><summary>Hint 2 — split each sample</summary>

Calculate due whole ticks and the fraction before applying the five-tick cap. Then process each permitted tick in order, checking expiry at that tick. The actor may be active for only part of a multi-tick sample.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

Open the companion's “Work a smaller clock” example. Its available 41 ms contains four 10 ms ticks, of which two are processed and two dropped, leaving 1 ms. Total tick grows by two, not four. Record the viewed section as assistance, then recalculate your own case with this guide's 50 ms and cap of five.

</details>

## Check, inspect and repair

Run `npm run core:check -- --assistance "none"` from the prepared workspace, or describe actual help. Read the first failed investigation and checkpoint; its JSON preserves expected/observed state and a link back to this guide. Match the discrepancy to a clock, receipt or identity rule. Append a repair explanation instead of rewriting your original prediction, then run again. Existing submissions and source hashes remain preserved by the core runner.

The checker uses ten finite investigations and is calibrated against two independently implemented correct predictors plus eleven wrong controls. Passing means these predictions agree with the named engine cases. Your reasoning and reservation-deadline transfer are saved but not automatically scored. The transfer changes the expiry contract: explain where processed-tick reasoning stops applying. The exercise has not measured human learning, production recovery safety or malicious-client detection.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
