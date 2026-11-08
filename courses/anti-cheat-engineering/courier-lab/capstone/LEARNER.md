# M11: Build a repair-station rule and test its boundary

Implementation reference for **M11: capstone**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

A repair station spends credits to restore energy. A retry must not buy the same repair twice, and a nearby client must not be able to choose its own price or position. Build the rule from server state, then write a separate HTTP scenario that can find incorrect implementations.

Your deliverables are `capstone/policy.mjs`, `capstone/scenario.mjs` and your reasoning in `response.md`. This capstone assumes the earlier request-order, authority and bounded-evidence work, plus JavaScript functions, objects, arrays and assertions. The code runs only against the owned local arena.

## Policy contract

Run `npm run core:prepare -- capstone` from the reference project, then enter the printed workspace. The final source files provide exported interfaces with TODO bodies; implement both from this contract after the guided practice. The checker captures both files, the original question, your response and assistance. Keep first answers and failed attempts; append changes instead of replacing the earlier account.

The policy exports `repair(state, actorId, request)`. Inputs are validated. The request has exactly `{requestId,stationId}`. The server resolves `actorId` from its session token. The state owns configuration, stations and actors:

```js
{
  config: { repairCost: 2, repairEnergy: 3, energyCap: 10, rangeMm: 400, receiptLimit: 2 },
  stations: [{ id: 'alpha', x: 0, y: 0 }, { id: 'beta', x: 2000, y: 0 }],
  actors: [{ id: 'actor-1', x: 0, y: 0, energy: 4, credits: 6, receipts: [] }]
}
```

Positions are integer millimetres. The actor is already present. Return `{reason,receipt,state}` with a fresh state and unchanged input objects. Failed operations use `receipt:null`. You do not need another parser inside the policy. HTTP validation remains in the supplied server.

Before implementing or running a scenario, record the required first answers or explicit skip reasons in `predictions.json`, with explanations in `response.md`. Use the rules below to predict retries, exact range boundaries, failed IDs and receipt capacity. These explanations are preserved for review rather than automatically graded.

## Request identity

A **receipt** records one successful resource change. It has exactly `{requestId,stationId,energyAdded,creditsSpent,energy,credits}`. Its balances describe that successful operation, even if later operations change the actor's current balances.

Look for the request ID in this actor's receipts before making a new decision. If the stored station differs, return `conflict` and change nothing. If the station matches, return `duplicate` with the original receipt and the current state. The actor may have moved since success; a retry acknowledges the earlier repair and performs no new repair. Rechecking distance before finding the receipt can incorrectly refuse that acknowledgment.

The ID belongs to the actor's session, not to the whole arena. Another actor can use the same ID for its own operation. IDs are opaque labels; their spelling or ordering does not compute balances. No timestamp or counter decides what a repair costs.

## One resource transaction

For a new ID, apply these checks in order:

| Check | Failure reason |
| --- | --- |
| The station exists | `station` |
| The actor has room for another receipt | `history-full` |
| `(actor.x-station.x)² + (actor.y-station.y)² <= 400²` | `range` |
| Energy is below 10 | `full` |
| Credits are at least 2 | `funds` |

On success, subtract 2 credits, add the smaller of 3 and the space below energy 10, append one receipt, and return `repaired`. These changes form one **transaction**: either all happen or none happen. Do not debit credits before a later check can fail. The complete state comes from the server; a body claiming a different energy, position, price or score is not another source of truth.

For a sibling example, consider a storage service that spends one token to add up to four units, with a capacity of twelve. If it already holds eleven units, the successful operation adds one unit while still spending one token. The receipt records the actual one-unit change. Apply the repair contract's own values when implementing this arena.

## Failed requests

A failed request changes neither balances nor receipt history. The same request ID may later succeed after the actor moves into range or another relevant state changes. Reserving an ID on a failed operation turns a temporary refusal into a permanent one and makes a later retry look like a success that never occurred.

Your pure policy fixtures also include validated states near the energy cap and below the required credits. They test decisions beyond the default session's initial state. An HTTP-only scenario starting at energy 4 cannot by itself establish every possible state transition.

## Bounded receipts

Each actor can retain two successful receipts in this exercise. Once that list is full, a new ID returns `history-full`, before range, energy or funds checks. Existing IDs still resolve normally. Keep the old receipts; evicting one and accepting its ID later would let the same operation be charged again.

This limit is an explicit session boundary. The lab does not invent a safe distributed retry horizon or claim durable storage across crashes. A different system would need a defined session lifecycle and persistence policy. Deleting a learner's original attempt or silently replacing a receipt is not a solution to the bound.

## Independent HTTP tests

Use [the receipt companion](../learning-support/capstone-receipts.md) first if a retry, a receipt and current state are still difficult to keep separate. It works a different storage-locker transaction and then removes steps. [The HTTP companion](../learning-support/http-tests.md) teaches request, observation and assertion construction. Neither contains the assigned repair implementation or its completed HTTP scenario.

Write `async scenario({base,moveActor})` in `capstone/scenario.mjs`. Import `node:assert/strict` and the supplied `./client.mjs`. Native `node:assert` imports and callable `assert(condition)` also work; the runner does not patch assertions, received JSON or `structuredClone`. The helper exports:

| Helper | Result |
| --- | --- |
| `session(base)` | New `{id,token}` from POST `/session` |
| `state(base,token)` | Current server state from GET `/state` |
| `submit(base,token,body)` | `{status,data}` from POST `/repair` |
| `request(base,path,{method,token,json})` | Raw `{status,data}` for boundary tests |

Rule decisions use HTTP 200, including refusals, with `{reason,receipt,state}`. A repair body with extra fields is HTTP 400 and changes no state. A missing or unknown session token is HTTP 401. Both authenticated endpoints derive actor identity from that token. Tokens remain local transport details and must not be copied into your written report.

`moveActor(id,{x,y})` is an owner test control provided directly to your scenario. It is not an HTTP route and cannot alter balances or receipts. Use integer coordinates from -10000 to 10000. Each fresh run allows at most eight sessions and 256 HTTP requests. Use assertions that compare actual state with expected state. Seeing `range` alone does not show that a failed request left credits unchanged.

Each completed successful run must submit a repair and read state. A genuine assertion on a wrong HTTP response may stop that run before its next state read. Compare actual energy, credits, receipt contents and state after a refusal with expected values; methods such as `equal` and `deepEqual` help. Use the supplied HTTP helper directly or from your own captured helper module. The runner checks HTTP participation, then tests whether your complete scenario distinguishes the correct implementations from each named defect. It does not infer which fields an arbitrary assertion compared. A status-only scenario misses the energy-only, receipt-content and refusal-side-effect controls. A single successful run establishes participation, not the quality of your test suite.

The captured scenario runs once against your captured policy, then against two correct implementations and thirteen plausible mistakes: charging a duplicate again; checking range before receipts; ignoring station conflicts; reserving failed IDs; excluding the exact distance edge; charging one credit; adding only two energy; recording the wrong energy in a receipt; debiting a credit on a range refusal; evicting old receipts; ignoring vertical distance; sharing request IDs across actors; and accepting client resource claims. Every run uses a fresh process and imports the scenario and its helpers anew. Module counters do not carry across variants. An assertion must fail on every wrong variant and pass on both correct controls and your submitted policy. A missing import, connection error, arbitrary exception, forged assertion error code or timeout does not detect a defect. Plain JSON and normal assertion behavior are preserved, including copied expected state and in-place sorting. Failure may stop at the first assertion: checking credits before receipts is valid. This finite behavioral panel does not prove arbitrary test correctness or stop a machine owner from tampering with the runner. Each run has a one-second limit; the panel has an absolute eight-second budget that stops and reaps an active worker. Timeouts or exhausted runner budgets are reported as runner failures, never as detected defects. This means the check did not finish; learner code can cause it. Completed criteria and earlier scenario diagnostics remain in the saved result under `error.input`. The first 4096 bytes of scenario output are retained for diagnosis. These are teaching-runner resource limits, not claims about production performance.

The checker supplies no completed HTTP test to your workspace. Decide which observations separate these implementations and write your own requests and assertions. The policy and scenario are judged separately: a passing policy cannot compensate for tests that never check state, and a sensitive scenario does not repair a wrong policy.

## Build in four checked milestones

| Milestone | Evidence to inspect before adding another concern |
| --- | --- |
| Represent one transaction | On paper, name the unchanged input, fresh output, selected actor and all fields one success changes. Use the locker sibling, complete its near-cap case, then use this contract's values independently. |
| Preserve identity and refusal | Trace an earlier success, a later success, then retry the earlier ID. Keep the old receipt alongside current balances. Also trace a failed ID that can later succeed; no failed operation appends a success receipt. |
| Implement the policy | Compare the first failed pure-policy criterion's input and expected/actual output. Fix its decision before revisiting later state differences. Check deep input preservation as well as balances. |
| Author independent HTTP evidence | For each named defect, identify a request sequence and an observed field that would differ. Execute through the supplied helpers, inspect current state, and use ordinary assertions. Both correct controls must pass before a failed wrong variant is meaningful. |

The first two are guided construction work. The final source files are an independent whole task: no helper here decides their branches for you. The checker preserves failed source attempts and reports the policy and scenario separately.

<details><summary>Hint 1 — distinguish a repeated operation from a new one</summary>

Ask whether a successful receipt already exists for this actor and ID before planning a new resource change. This is why retry identity is separate from current distance and balances.

</details>

<details><summary>Hint 2 — write a branch change set</summary>

For each refusal, write “no resource change; no new receipt.” For success, list the energy change, credit change and appended receipt together. Compare your assertions with those sets; checking only `reason` leaves side effects invisible.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

In the companion's locker example, `A` records 9 units and 4 tokens; `B` later leaves 12 units and 3 tokens. Retrying `A` returns the historical 9/4 receipt but keeps current state 12/3. This suggests two distinct assertions: one on the receipt, another on current resources. Record the viewed section as assistance, then construct your repair case independently.

</details>

Submit with:

```sh
npm run core:check -- --assistance "none"
```

Describe actual help instead of `none` when applicable. Inspect expected and actual evidence, follow the teaching pointer, repair the first faulty decision and append why your change addresses it. The local adapter serializes each synchronous resource transaction, but this exercise does not establish production concurrency safety, remote identity assurance or measured learning. Worker cleanup covers its inherited process group; a self-detaching child can escape. This teaching runner is not an OS sandbox.

## Transfer for review

A shared printer charges a quota when it accepts a job. A connection can drop after acceptance, the client can retry, and completed-job details can no longer be retained indefinitely. Propose the retry identity, receipt scope and expiration/session boundary. Explain what must happen when the receipt bound is reached, and how a retry can distinguish a previously accepted job from one never accepted. Identify what additional durable state or protocol is needed across a server restart. Preserve your first answer and append any repair; this design explanation is not automatically graded.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
