# Repair a real server rule

Implementation reference for **M1: spatial authority**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

Your task: restore one server-side proximity check and prove that it blocks a remote pickup while a legitimate delivery still works.

You need Node 22 or newer and a terminal. No extra packages, accounts, drivers or operating-system changes. Use only your local copy of this owned game. The software is a teaching project, not production anti-cheat.

## Prepare your working copy

From the reference project's directory, run `npm run lab:prepare`. It creates `artifacts/workspace` and prints its exact path. Change into that directory and open `predictions.json` and `lab/response.md`. Do not run the checker or consult the worked reference until you have recorded the first predictions below. Those predictions must precede the first revealed checker feedback, not only your first code edit.

`npm start` runs this working game; use its printed local URL. The workspace contains the game, one incomplete source file, the client helper and a submission bootstrap. Trusted tests, the complete guard and reference manifests remain outside it. The original project is a worked comparison and counts as assistance if you consult it.

## Trace and predict the decision

The client sends `{v, seq, move, interact}`. A **sequence** is a monotonically increasing input number, used to avoid repeating old input. It is not a timestamp. The server stages a direction and, if requested, one interaction. On its next **tick** (a 50 ms simulation step), it moves the courier and evaluates the interaction against server-owned positions.

A pickup changes **cargo**, the server's record that the courier carries the core. A delivery changes **score**. Neither property appears in the accepted request schema: the allowed field names and value types. A modified client can still send `interact:true` from far away. The missing guard must reject that attempt before either server property changes.

The legal radius is 250 millimetres, inclusive. Compare squared distance with the squared radius and use both coordinates. This avoids a square root and keeps integer boundary arithmetic exact. A cooldown is the waiting period after a successful interaction. The existing cooldown decision must remain in place, so the range repair cannot grant another interaction during that wait.

Record the required first answers in `predictions.json` now, before running the checker. Use `lab/response.md` for the calculations and reasons. The cases below identify the boundary to reason about:

| Courier relative to target | Your decision and reason |
| --- | --- |
| 250 mm east, 0 north | |
| 251 mm east, 0 north | |
| 150 mm east, 200 mm north | |
| 200 mm east, 200 mm north | |

Also predict what a remote pickup would do with the guard missing. Save the required answer or explicit skip reason and your separate explanation. Keep these original predictions when feedback later changes your answer; append the correction and its evidence.

## Observe the starter and repair it

The next steps connect the geometry to one source change and its real HTTP evidence.

## Work from a sibling to your own guard

A sibling circular zone has radius 5 units. An offset of `(3,4)` has squared distance `3²+4²=25`, equal to `5²`, so it is inside the inclusive zone. `(4,4)` gives 32 and is outside. Checking each coordinate against 5 would incorrectly accept the second point: a square bounding box is larger than the circle.

Completion: a different zone has radius 10 and offset `(6,8)`. Fill in the two squared terms, their sum, the squared radius and the inclusive decision. Then choose an offset whose individual coordinates are each below 10 but whose distance is outside. Complete the corresponding check in `/learn` before producing your source guard with this project's own radius.

| Milestone | Evidence to inspect |
| --- | --- |
| Predict geometry | Save the original `predictions.json` answers, then work the separate sibling calculation above. Keep the first predictions unchanged. |
| Locate the decision | Find `interactionDenial` and identify which values come from the owner. Identify the existing cooldown check that must survive. |
| Implement one guard | Build the squared two-coordinate comparison at the marked gap. No request-provided position or cargo may supply the decision. |
| Check both behaviors | In `lab:check`, read expected/actual cargo for the remote attempt and the legal delivery. A remote refusal alone could hide a guard that rejects everything. |

<details><summary>Hint 1 — identify the protected transition</summary>

The client requests interaction; the owner decides whether cargo or score changes. Place the range decision before that state transition so a distant request cannot receive its benefit.

</details>

<details><summary>Hint 2 — preserve the existing rule</summary>

Use the actor-to-target difference on both axes, and compare quantities with the same squared units. Keep the cooldown decision rather than replacing it with a distance-only rule.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

The radius-5 sibling accepts `(3,4)` because both sides equal 25 and refuses `(4,4)` because 32 is greater than 25. Equality is legal. Record this viewed hint as assistance, then use the project's own values and preserve its existing decisions.

</details>

## Run and inspect a source check

After saving your predictions, run:

```sh
npm run lab:check -- --assistance none
```

Record whatever help you actually used instead of `none`. The starter is supposed to fail the remote-pickup test. A separate honest-delivery test should pass. Read the expected and actual cargo, not just the process exit code. The checker reveals boundary explanations after saving the submission, so later runs are attempts made with that feedback available.

The checker saves your submitted `defense.mjs`, exact question, response, help declaration and result in a new `artifacts/attempts` directory. It never replaces earlier submissions. If saving fails, it refuses to run. Owner-side execution uses the captured source and trusted tests outside your workspace; the saved metadata identifies that execution and its hashes.

Open `defense.mjs`. The `interactionDenial` function returns a reason or `null`. Restore the guard at `LAB_PROXIMITY_GUARD`, preserving the other decisions. Run the same checker with an accurate help declaration. Append the first failed criterion, its expected and actual values, the reason for your repair and the new evidence path to `lab/response.md`.

The prepared package offers `npm start` and `npm run lab:check`. It does not contain a local answer-bearing test suite or a `ci` shortcut. Each authoritative check starts separate Node servers, sends real HTTP requests and asserts server-owned state.

## Explain and transfer

Write your own answers in `lab/response.md`. Each checker run preserves its current text alongside the exact code:

1. Why would a browser-only distance check leave the server vulnerable to remote pickup?
2. A valid request arrives twice after a connection interruption. Why should the retry be a no-op without becoming a cheating finding?
3. A modified client sends exactly the same legal messages as an ordinary client. What does this server observe? What does it fail to establish?
4. Transfer: a repair station has a radius of 400 mm and a resource cost. Outline a server-owned predicate and one legal boundary test, one invalid-state test and one retry test. Do not merely rename the pickup test: account for charging the resource at most once.

A pass covers these fixtures. It does not prove you can design every server rule. The explanation and new mechanic expose what still needs reasoning. Worked reference code is assistance if consulted; record that honestly. These expectations implement prediction before reveal (`practice-08`) and preserved, actionable project feedback (`feedback-07`).

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `lab/response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run lab:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
