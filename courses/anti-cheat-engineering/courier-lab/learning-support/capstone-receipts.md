# Reason about receipts before writing the capstone

Use M11 in [the guided route](/learn), then return to [the capstone contract](../capstone/LEARNER.md) for the exact interface, check order and HTTP helpers. This reference works a different resource service and shows how to plan independent observations. It contains no completed repair policy or repair scenario. Record help using the [support workflow](README.md).

## 1. A receipt refers to an operation, not today's balance

A **transaction** changes related resources together. A **receipt** preserves the result of one successful transaction so a retry can acknowledge that same operation without executing it again. **Idempotence** here means that repeating the same accepted request has no additional resource effect. It does not mean returning whatever balances happen to be current.

Work a sibling storage locker: opening a locker costs one token and adds up to four stored units, with a capacity of twelve. Each user has their own successful request IDs. The policy retains three receipts. Its range and authentication rules are outside this smaller example.

The locker begins with 5 units and 5 tokens. Request `A` for locker north succeeds: units become 9, tokens become 4. Save receipt `A` with `unitsAdded:4`, `tokensSpent:1`, `units:9`, `tokens:4`. Request `B` then succeeds: only three units fit, so units become 12 and tokens become 3. Receipt `B` records the actual three-unit addition.

Retrying `A` returns receipt `A`, including the balances 9 and 4 from that success. Current state stays at 12 units and 3 tokens. Returning 12 and 3 as receipt `A` would rewrite history; returning state 9 and 4 would roll back request `B`. The receipt and current state answer different questions.

First completion: begin a second locker at 10 units and 4 tokens. Fill the receipt and current balances after request `C` succeeds, then after an identical retry. Identify which numbers are historical and which describe the current state.

## 2. A failed ID is available; a successful ID is bound

In the sibling, request `D` for an unavailable locker fails. No resource changes and no successful receipt exists. When the locker becomes available, the same ID may succeed. Keeping a success-shaped record for the failure would falsely acknowledge work that never happened.

After successful `A` at locker north, an `A` request naming locker south conflicts. The old ID is already bound to north. It must not buy another operation or replace receipt `A`. Another user may use an `A` of their own because IDs belong to that user's record.

Once the sibling has three successful receipts, a fourth new ID is refused. Existing IDs can still be acknowledged. Discarding the oldest receipt to make space would turn its later retry into a new charge. Capacity is a lifecycle decision, not merely an array-trimming task.

Second completion: make a table with one failed request later retried successfully, a retry after another success, an ID conflict, and a new ID at receipt capacity. Fill “new charge?”, “new receipt?” and “which receipt returned?” for each. Explain the answer before implementing Courier's distinct cost, energy cap and two-receipt limit.

## 3. Implement by decision boundaries

The final capstone provides the interface and checks, not a completed starter algorithm. Keep the reference contract beside your editor. Write one branch at a time and decide which fields it may change.

| Milestone | Evidence to inspect |
| --- | --- |
| Fresh output | Input objects remain unchanged; returned state is a separate value. The actor is found by server-provided `actorId`. |
| Existing successful ID | A matching retry returns its original receipt and current state; a station conflict changes neither. Check before new-operation restrictions. |
| New ID refusal | Each ordered refusal returns `receipt:null`, without changing resources or consuming an ID. |
| One success | Actual energy gain, fixed cost and one complete receipt change together. A near-cap success records only the energy actually added. |

Do not calculate current balances from the spelling of a request ID, assume the request supplies a trustworthy actor or copy constants from this locker example. Courier's supplied state owns configuration, actor balances and station positions.

## 4. Plan independent HTTP evidence

Read [the HTTP test reference](http-tests.md) if request/response/assertion sequencing is unfamiliar. The capstone helper uses different names and a different endpoint from M3; import the helpers listed in its own contract.

For a repair test, save the server state before an action, send the request, inspect `reply.data.reason` and `reply.data.receipt`, then read current state. Compare only fields whose change the case is intended to permit. A refusal reason may change while energy, credits and receipt history must remain equal. A success changes those resources together.

Build a case matrix before writing the scenario:

| Behavior | What a status-only assertion would miss |
| --- | --- |
| Successful repair | Wrong debit, wrong actual energy gain, wrong receipt contents |
| Repeated success ID after later work or motion | Repeated debit, refreshed receipt balances, incorrect range recheck |
| Failed request then retry | An ID consumed by failure; resources changed on the refusal |
| Receipt capacity | Old receipt eviction and later charging of an old operation |
| Different actors | IDs incorrectly shared across actor records |
| Boundary and client claims | Ignored y distance, excluded exact edge, resource fields accepted from a request |

Keep the HTTP and pure-policy evidence separate. `moveActor` moves positions; it cannot manufacture arbitrary credits or energy. Some validated pure-policy cases therefore cover states your default HTTP session cannot reach. Conversely, an HTTP validation failure tests the request boundary before the policy is called.

Your complete scenario must pass both correct implementations and fail all named wrong variants using actual assertions. If a correct control fails, inspect setup and expectations first. If a wrong variant survives, identify the missing observation, not just another request to send. A timeout, import failure or arbitrary thrown error is no behavioral proof.

## Hints for a stuck practice case

<details><summary>Hint 1 — name the two histories</summary>

Separate current resources from the receipt of an earlier success. A retry needs both, because acknowledgment and current state may legitimately contain different balances.

</details>

<details><summary>Hint 2 — write a change set for every branch</summary>

For a refusal, the resource-and-history change set is empty. For a success, list debit, energy increase and appended receipt together. This exposes a mutation performed before a later check can refuse.

</details>

<details><summary>Hint 3 — worked sibling step, after a saved attempt</summary>

After locker requests `A` and `B`, retry `A` returns the old 9-unit/4-token receipt while leaving current state at 12 units/3 tokens. An assertion only on the word “duplicate” misses both a repeated charge and a rewritten receipt. Compare historical receipt fields and current state independently. Record this section as assistance.

</details>
