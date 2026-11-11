# Construct an HTTP test

Use this reference after the M3 teaching and checks in [the guided route](/learn). It explains how to build the independent scenario described in [the order guide](../lab/order/LEARNER.md#your-scenario). The final scenario remains your work. The [support workflow](README.md) explains prediction capture and assistance.

## 1. Separate the four steps

An HTTP **request** asks the server to do something. The **response status** says how the request was handled. An **authoritative snapshot** reports state held by the server. An **assertion** compares that observed state with what the contract predicts and throws an error on disagreement.

Use four steps: arrange a known starting state, act through the public input path, observe the resulting owner state, then assert the relevant fields. In this lab, `await input(...)` waits for the HTTP response. It does not move the actor. `await advance(n)` invokes the owner's test clock and processes `n` ticks. `await state(...)` reads a snapshot without advancing time.

A `Promise` is an eventual result. An `async` function can use `await` to wait for it. If an input is not awaited, a later snapshot can race the request: a test failure may describe test ordering rather than game ordering. Keep these actions sequential until their order is deliberate.

## 2. Study a complete sibling

This checks the M1 remote-pickup rule, not the M3 ordering defects. In each supplied M3 seed, the new actor begins at `(1000,1000)` and the core is at least 1000 mm away. The interaction radius is 250 mm. The request is well-shaped, so HTTP 200 is expected; after the tick, cargo must still be false.

```js
import assert from 'node:assert/strict';
import { join, input, state } from './clients/http-client.mjs';

export async function scenario({ base, advance }) {
  const { token } = await join(base);
  const reply = await input(base, token, 1, 'idle', true);
  assert.equal(reply.status, 200, 'the owner handles a valid input');
  await advance(1);
  const observed = await state(base, token);
  assert.equal(observed.actor.cargo, false, 'remote interaction grants no cargo');
  assert.equal(observed.lastDecision.reason, 'range', 'owner applies the range rule');
}
```

`assert.equal(actual, expected, message)` places the observation first and the prediction second. A useful message names the rule, not “test 1.” Leave assertion failures uncaught so the runner can distinguish a behavioral disagreement from a completed scenario.

This code is a worked sibling. It can pass while all seven ordering defects survive. It therefore cannot stand in for your independent submission.

## 3. Complete, then remove more support

First completion: reuse the sibling's arrange, request, tick and snapshot. Add an assertion that remote pickup does not increase `observed.actor.score`. Record the expected score before running; derive it from the starting score and the absence of a delivery. Read the result and explain any mismatch.

Second completion: start another fresh actor, save its `x` and `y`, submit an idle input and process one tick. Write both position assertions without copying the finished cargo assertions. This checks your use of observations without yet solving an ordering case. A changed `lastDecision` is allowed; idle position is the property under test.

Now write an independent M3 case. State the expected effect before coding, identify the snapshot fields that can reveal it, then choose requests and tick boundaries that make correct and incorrect behavior differ. Test an ordering rule, not the already solved remote-pickup rule.

## 4. Turn each requirement into an observation

Use the exact limits and helper signatures in the order guide. `advance` is an owner test control, not an HTTP endpoint available to a player. A fresh actor starts with `lastSeq:0`, `expiresAt:0`, `score:0` and `cargo:false`. The server snapshot exposes those fields along with position. It does not expose the private direction or staged interaction bit directly.

| Requirement | Observable evidence to plan |
| --- | --- |
| Older or equal sequences do not change intent | Admit one direction, deliver a conflicting retry, then inspect movement on a named subsequent tick. A receipt alone cannot show retained direction. |
| A stale input cannot stage interaction | Arrange an interaction opportunity and compare cargo/score after the next tick. Reading `lastSeq` alone cannot reveal the staged bit. |
| Four ticks are active and the fifth is not | Record position around both boundary ticks on open floor. A wall can make early and late expiry look identical. |
| Polling is read-only | Compare the same actor before and after snapshots, and inspect movement at the original expiry. No input should occur between the observations. |
| A retry creates no cheating finding | Inspect the `findings` array after the retry, alongside state. A status code is silent about advisory findings. |

Keep a small expected-state table next to the case while writing it. Record processed tick, sequence, position and the specific interaction/finding fields you need. Assertions should follow from that table; do not generate expected values by calling the policy you are testing.

## Milestones

| Milestone | Evidence before moving on |
| --- | --- |
| One valid exchange | The sibling completes with an awaited request, tick and snapshot. Its assertions check the known M1 outcome. |
| One independent ordering case | Explain which wrong behavior changes one of your asserted values. Confirm the case on each seed through `order:check`. |
| Boundary coverage | Include both sides of expiry, stale and equal sequence behavior, read-only polling and findings. The result names which wrong variants survive. |
| Complete scenario | Both correct controls pass and every named wrong variant triggers a real assertion. Preserve the failed attempt and repair only the missing distinction. |

The checker separately assesses your policy and scenario. “Wrong variants survive” means the test still accepts at least one wrong behavior. An import error or timeout does not count as detecting it. “A correct control fails” means your expected result or setup needs inspection before the mutant score is meaningful.

## Hints for a stuck practice case

<details><summary>Hint 1 — identify what the rule owns</summary>

Write which state may change on admission and which changes only on a tick. This prevents an assertion on the HTTP response from standing in for the engine effect.

</details>

<details><summary>Hint 2 — choose a separating moment</summary>

Use two conflicting directions, or inspect the tick on each side of the declared expiry. If both implementations reach the same wall, choose another starting path; the observation must expose the intended difference.

</details>

<details><summary>Hint 3 — worked sibling step, after a saved attempt</summary>

In the remote-pickup sibling, HTTP 200 and `cargo:false` can both be correct. The response accepts an input; only the following tick evaluates the distant interaction. That is why the cargo assertion belongs after `advance(1)` and a new snapshot. Apply that separation of request and effect to your own ordering case. Record this section as assistance.

</details>
