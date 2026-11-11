# Build a timing predictor one state transition at a time

Start with M4 in [the guided route](/learn), then use [the timing contract](../timing/LEARNER.md#the-contract) for exact fields. This reference supplies smaller worked cases and an implementation sequence. It does not supply `predictTiming`. Record help using the [support workflow](README.md).

## 1. Name the state before the loop

The predictor is a **state machine**: read one action, change only the state that action owns, then append a snapshot. Keep four kinds of state separate:

| State | Meaning | Changed by |
| --- | --- | --- |
| Clock reading and fractional remainder | Owner milliseconds already accounted for, plus less than one tick of unused time | `sample` |
| Processed tick and overrun count | Work actually performed, plus callbacks that dropped whole ticks | `sample` |
| Actor and connection state | Position, current private direction, sequence, expiry and connected flag | Relevant actor actions and processed ticks |
| Checkpoint list | Detached observations after each action | Every action |

The action's `id` is a connection label. The returned actor's `id` is generated as `actor-1`, `actor-2`, and so on. Store the private direction for later movement, but do not include it in returned actors. Build a new actor snapshot each time; storing the same mutable object in every checkpoint makes earlier observations change when you process later actions.

## 2. Work a smaller clock

This sibling clock uses **10 ms per tick and at most two processed ticks per sample**, different from Courier's 50 ms and five. It begins at reading 100, tick 0, remainder 0, overruns 0.

For each sample, add `new reading − previous reading + old remainder`. Divide that amount into whole due ticks and a fraction. Process no more than the cap, discard excess whole ticks, retain only the fraction, then save the new reading. An overrun counts the sample that dropped work, not every dropped tick.

| New reading | Available ms | Due ticks | Processed | Dropped | Remainder | Total tick | Overruns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 107 | 7 | 0 | 0 | 0 | 7 | 0 | 0 |
| 116 | 16 | 1 | 1 | 0 | 6 | 1 | 0 |
| 151 | 41 | 4 | 2 | 2 | 1 | 3 | 1 |
| 151 | 1 | 0 | 0 | 0 | 1 | 3 | 1 |

The delayed sample advances two processed ticks. The two dropped ticks do not remain in a debt queue. The repeated reading advances none. Neither four nor forty requests would themselves add a clock tick.

First completion: start from the final row and sample at 160. Fill available milliseconds, due, processed, dropped, remainder and total tick before checking your calculation. Use the fraction already retained; do not restart at zero.

Second completion: make your own three-row sibling trace with one fractional sample, one capped sample and one repeated reading. Explain why your final tick is the sum of **processed** ticks. Have `/learn` check a new Courier clock case before implementing the full loop.

## 3. Join clock work to actor work

A receipt records delivery of an input, not motion. A new sequence changes private direction and sets expiry from the current processed tick. Each processed tick then checks whether that tick falls within the admitted window. Disconnect changes delivery availability; it does not reverse an input the owner already admitted.

Work a sibling actor with a three-tick intent window. It starts at x=20. Each active step adds 2. An east input admitted at tick 8 expires at 11. Ticks 9, 10 and 11 produce x=22, 24 and 26. Tick 12 leaves x=26. If the connection goes offline just after tick 9, the admitted motion still reaches x=26; a new input while offline changes none of that state. Resuming the same connection restores delivery to the same actor.

Completion: start a different sibling at x=30 with a west input admitted at tick 4 under that three-tick rule. Fill its expiry, positions at ticks 5 through 8 and the effect of retrying the same sequence after resume. Then return to Courier's own **four-tick** window and **250 mm** steps. Do not copy the sibling constants.

If a Courier sample processes several ticks, apply movement once for each processed tick in order. Evaluate expiry at each new tick, not only once at the sample's end. Otherwise a sample crossing expiry can incorrectly move for all or none of its steps.

## 4. Build, check and add one concern

| Milestone | Trace to prepare | Evidence to inspect |
| --- | --- | --- |
| Clock only | `sample` actions, no actors; include fractions and a repeated reading | One checkpoint per action, correct `clock`, no receipt, sum of processed ticks |
| One actor | Join, newer input, then samples spanning expiry | Position stays unchanged at receipt; movement stops after the fourth active Courier tick |
| Delivery and identity | Duplicate/older input, disconnect, offline input, resume, fresh join | Rejected inputs leave intent and expiry intact; resume keeps an actor; fresh join adds one |
| Full output | A mixed action record | Old checkpoints retain old values; only input has a receipt and only sample has a clock result |

These are implementation milestones, not separate scoring commands. Use the core check after a coherent source attempt and inspect its first failed checkpoint. Compare the earliest differing field before repairing later outputs. For example, a wrong expiry can explain several later positions; changing each position independently hides the first cause.

## Hints for a stuck practice trace

<details><summary>Hint 1 — decide which clock you mean</summary>

Label each number as client annotation, owner reading or processed tick. Only the current processed tick grants an input's movement window; this avoids turning a client's timestamp into authority.

</details>

<details><summary>Hint 2 — split the sample into two calculations</summary>

Compute whole ticks and fraction first. Compute capped work and dropped work second. The fraction is below one tick even when the callback was badly delayed, so dropped whole work cannot return on the next sample.

</details>

<details><summary>Hint 3 — worked sibling step, after a saved attempt</summary>

In the 10 ms sibling, the jump from 116 to 151 contributes 35 new ms plus the old 6 ms. Forty-one ms means four whole ticks and 1 ms left. The cap processes two, drops two, increments the overrun count once, and advances total tick from 1 to 3. Record this section as assistance, then recompute your own case with Courier's constants.

</details>
