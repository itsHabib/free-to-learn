# M6: Reproduce a bounded history

Implementation reference for **M6: causal replay**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

Implement a policy that decides whether one recorded window reproduces its claimed final gameplay state. A screenshot of a score is not enough: the replay needs both the state before the window and every operation inside it.

From the reference project run `npm run core:prepare -- telemetry`. In the printed workspace, fill the required answers or explicit skip reasons in `predictions.json`, edit `telemetry/policy.mjs`, and keep explanations in `response.md`. Then run `npm run core:check -- --assistance "none"` (or describe the help used). The checker captures your exact files and records first and revised attempts separately. A passing run establishes agreement with these cases; it does not establish production security or learning gains.

## The contract

Your function is `replayWindow(record, engine)`. It returns either `{ok:true,state}` or `{ok:false,reason}`. `state` is the canonical gameplay result produced by the supplied engine.

A **checkpoint** is enough private game state to continue execution: actor positions and scores, movement intent, pending interactions, expiry, cooldown and detector history. A public snapshot omits some of this state. A **window** combines a checkpoint with a bounded sequence of later operations. This lets the recorder replace older history without pretending that the game began again at its initial position.

The record has eight fields:

| Field | Meaning |
| --- | --- |
| `schema` | Envelope version; only `1` is supported. |
| `runtimeRelease` | Rules used for this record; must equal `engine.release`. |
| `startIndex` | Absolute index of the last operation before this window. |
| `checkpoint` | State immediately after `startIndex`, before the first retained operation. |
| `events` | Up to 256 entries, each exactly `{index,event}`. |
| `endIndex` | Absolute index of the last retained operation; equal to `startIndex` for an empty window. |
| `complete` | Must be `true`; the producer claims no gap inside this window. |
| `final` | Claimed canonical state after all retained operations. |

Refuse unexpected envelope fields. A checkpoint does not contain a bearer token, a password or the old event log. Do not add those fields to a record.

## Complete windows

The recorder takes a new checkpoint **before** the next operation would exceed its capacity. It then records that operation as the first entry in the new window. The old window is replaced; the new window is complete on its own.

```text
older operations ... 40 | checkpoint | operation 41 | operation 42 | final
                  startIndex = 40                      endIndex = 42
```

There are two retained operations here. The checkpoint represents the world after operation 40. Replaying starts from that checkpoint, not from a newly seeded empty world. A zero-event window is also meaningful: restore the checkpoint and compare it directly with `final`.

The event array must exist, contain at most 256 entries and have `complete:true`. Return `incomplete` if any of those requirements fails. Capacity is a storage bound, not a reason to silently accept only the tail of an incomplete record.

## Absolute order

`startIndex` and `endIndex` are nonnegative safe integers. For the example above, the entry indices must be `41,42`, in that order, and `endIndex` must be `42`. Each entry contains only `index` and `event`.

Return `sequence` for missing, repeated or reordered indices, invalid boundaries, an invalid indexed entry or an end boundary that disagrees with the array length. Do not sort entries, renumber them, fill a gap or drop a stale input. A stale input can leave the gameplay state unchanged while still being part of the observed operation history. Final-state equality alone cannot reveal its removal.

Before editing, save the required predictions in `predictions.json` and keep your explanation in `response.md`. Explain why a reordered pair can be invalid even when both operations happen to produce the same final state.

## Causal state

The supplied facade has five members:

| Member | Use |
| --- | --- |
| `release` | Supported runtime release string. |
| `restore(checkpoint)` | Return a fresh mutable game world; throw if the checkpoint is invalid. |
| `apply(world,event)` | Apply one operation; throw if the event is invalid. |
| `canonical(world)` | Return detached public gameplay state. |
| `equal(left,right)` | Compare JSON values, ignoring object key order. |

Events are `join`, `input` and `tick`. Each tick is one recorded operation. Valid input includes requests that the engine classifies as stale. The facade owns their detailed schemas and limits, so use it instead of implementing another movement or detector model in your policy.

For example, an actor may have staged an interaction before a rollover. If the checkpoint saved only the public position, the first retained tick would lose that interaction. Similarly, two retained detector observations may cause the next denied interaction to produce a finding. Resetting the detector during restore changes that result.

Catch checkpoint or event failures and return `event`. Never continue after a failed application, since you no longer have a reproduction of the supplied history.

## Final comparison

After restoring and applying all entries, compute `engine.canonical(world)` and compare it with `record.final` through `engine.equal`. Return `final` if the final state is absent or differs. Report success with the state you computed, rather than copying the claim in `record.final`.

Check in this order: schema, release, completeness, sequence, checkpoint/events, then final comparison. Return `schema` for an unsupported schema or unexpected envelope field, and `incompatible` for a release mismatch. This order makes a failure reproducible when a record has more than one defect.

## Capture and replay a real session

First isolate the policy decisions, then inspect a real captured window.

## Build in three checked milestones

1. **Validate the envelope and sequence.** In the worked `startIndex=40` window above, only indices 41 and 42 are permitted. Completion: a window starts at 70 and has three events; fill its required indices and end boundary. Decide the failure phase if the middle index is repeated. Do this before calling the engine.
2. **Restore and apply.** Use the supplied facade to restore one checkpoint and apply each retained event in its given order. A zero-event window still restores; it does not construct a fresh initial world. Stop at a failed restore or event instead of comparing a partial execution with the claimed final state.
3. **Compare computed state.** Return the state obtained from `canonical`, not the input's claim. Use the first failed core criterion to separate an invalid record from valid execution whose final claim is wrong. Preserve the input objects while testing.

<details><summary>Hint 1 — identify the starting world</summary>

The checkpoint already includes the effects before the retained window. Recreating an empty world loses intent and history that the first event may depend on.

</details>

<details><summary>Hint 2 — separate order from outcome</summary>

Validate absolute indices before execution. Two stale inputs may produce the same final gameplay state in either order, while only the recorded order is a valid reproduction.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

For the window beginning after operation 40, two retained operations require indices 41 and 42 and `endIndex:42`. A record containing 41 and 43 fails `sequence` even if the final score happens to match. Record this as assistance, then implement the general bounds and application loop independently.

</details>

## Run a real capture

From the reference project run `npm run trace:sample -- artifacts/session-window.json`, then `npm run window:replay -- artifacts/session-window.json`. The capture script drives the actual server over HTTP and obtains a record through its owner-only test channel. The normal game has no HTTP time or export route. The replay runs a separate deterministic world; it does not change a live player's state.

Keep the original record. In a new copy, remove an event, duplicate an index or change the final score and run the replay command again. Name the failure phase before examining the verdict. A refused record means the supplied evidence could not support this replay, not that a person cheated.

## Repair and scope

Each failed criterion names a requirement and shows expected and observed results. Follow its section link, inspect the condition your code accepted or rejected, and append your repair explanation to `response.md`. Run again with the actual help you used. Keep your first prediction and first attempt available.

Browser playback is a teaching aid. The owner-side checker replays through the real engine. Neither one authenticates the producer of the record: someone who can rewrite both the checkpoint and its claimed final state may produce a different internally consistent history. Replay also does not prove token ownership, actual network timing, packet order or a trustworthy wall clock. Those need evidence outside this deterministic window.

The response template ends with a new repair-station scenario. Use it to explain which facts belong in a checkpoint and which claims replay cannot settle; it is a review prompt, not an automatically scored proof of transfer.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
