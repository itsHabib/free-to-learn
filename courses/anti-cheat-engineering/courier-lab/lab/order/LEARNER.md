# Author an admission policy and an HTTP test

Implementation reference for **M2/M3: admission and independent testing**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

Your result is two runnable source files: admission.mjs, which the server loads, and learner-scenario.mjs, which exercises actual HTTP. Record required predictions in `predictions.json` and explanations in `response.md`. This is a local owned teaching project, not production anti-cheat.

## Prepare

Run `npm run order:prepare` from the complete reference project, then change into the printed artifacts/order-workspace directory. The working copy has an incomplete policy and scenario. The reference policy, author variants and judging tests stay outside it. Looking at the reference is permitted assistance; record it accurately.

Read the contract below. Fill each required answer or explicit skip reason in `predictions.json` before editing; use `response.md` for your reasoning. Use an editor to implement admission.mjs and learner-scenario.mjs; no code is uploaded through the browser. You can start your completed copy with `npm start`. Stop it with Ctrl-C.

## Policy contract

Inputs have already passed strict parsing. Do not rewrite the parser, engine or clock.

- `admitInput(state,input,tick)` returns `{status,next}`.
- State fields: lastSeq, lastSeen, expiresAt, move, pendingInteract.
- If input.seq is not strictly greater than lastSeq, return status stale with every state field unchanged. A stale input cannot contribute its interaction bit.
- Otherwise return admitted; set lastSeq to the input sequence, lastSeen to tick and expiresAt to tick+4; replace move and OR the existing pendingInteract with input.interact.
- `movementActive(state,tick)` returns whether the intention is still active. T+4 is included, T+5 excluded. Reading state must change nothing.
- The engine owns movement, identity, score, cargo and tick order. No policy result can supply those authorities.

A sequence is an ordering number, not client time. One tick is 50 ms. Movement is continuous only when fresh admissions arrive no more than four ticks apart; a longer gap must stop without catch-up. These controls protect intended behavior. In this instanced game they do not themselves prevent a competitive scoring advantage.

## Your scenario

Export `async function scenario({base,advance})`. Use the supplied HTTP helpers to join, send inputs and read state. `advance` is the bounded owner-side test clock; it is not a gameplay HTTP endpoint. Use ordinary assertions on authoritative state, not only status or error text.

A **seed** is a repeatable fixture selector; a **fixture** is known starting data for a test. A **variant** is a deliberately changed implementation used to test your test. Interaction **coalescing** means that several admitted true interaction bits become one action on the next tick, even if a later input has interact=false.

Cover these contracts with short, understandable cases:

1. Newer input followed by older conflicting input: the older request changes neither direction nor staged interaction.
2. Duplicate retry: it has no repeated effect and produces no finding.
3. Expiry: exactly four movement steps, then stop; a later request resumes without catch-up.
4. Renewal at T+4: the next step still happens.
5. State polling: reading snapshots does not keep movement alive.
6. Legitimate clumping/reordering: at most one interaction per tick; predictable state at named ticks; no cheating inference from a transport retry.

Each scenario starts a fresh server at tick 0 and runs once for each seed in `lab/order/seeds.json`: 17, 31 and 99. All actors spawn at (1000,1000). The core is at (2500,1000), (2250,1000) and (2000,1000), respectively. Read `snapshot.core` when your scenario needs its location. Cardinal movement is 250 mm per active tick. Keep timing tests away from the wall so collision cannot hide an expiry bug. `advance(n)` accepts integers from 1 through 100, with at most 400 total ticks per scenario. You may join at most four actors per run.

The supplied helpers return parsed values. `input(base,token,seq,move,interact)` returns the HTTP response with `status` and `data`; `state(base,token)` returns the snapshot itself. This observation-only example does not solve an assessment case:

```js
const { token } = await join(base);
const seen = await state(base, token);
// seen.tick: 0
// seen.actor: {id, x:1000, y:1000, score:0, cargo:false,
//              lastSeq:0, expiresAt:0, nextInteractTick:0}
// seen.core: {x, y}; seen.depot: {x:1000, y:1000}
// seen.lastDecision: null; seen.findings: []
```

### From an observation to a test

An **assertion** compares a returned value with the contract's expected value and throws when they disagree. A **Promise** represents an operation whose result becomes available later. An `async` function permits `await` inside it; `await` pauses that function until the operation finishes. Awaiting HTTP does not itself advance this test clock. Only `advance(n)` asks the owner to process n ticks.

This complete sibling example checks the remote-pickup rule you already learned in M1. It does not test ordering, expiry or any of this module's seven variants. In a fresh run the core is at least 1000 mm from the actor, outside the 250 mm interaction radius:

```js
import assert from 'node:assert/strict';
import { join, input, state } from './clients/http-client.mjs';

export async function scenario({ base, advance }) {
  const { token } = await join(base);
  const response = await input(base, token, 1, 'idle', true);
  assert.equal(response.status, 200, 'well-shaped input reaches admission');
  await advance(1);
  const seen = await state(base, token);
  assert.equal(seen.actor.cargo, false, 'remote pickup must not grant cargo');
  assert.equal(seen.lastDecision.reason, 'range', 'owner denies distant interaction');
}
```

Read it as arrange (join), act (request then tick), observe (state), assert (compare). HTTP 200 means the input request was handled; the later authoritative decision can still deny the pickup. Checking HTTP status alone would miss an erroneous cargo grant. A failed `assert.equal` reports expected and actual values; preserve that evidence rather than catching and ignoring it.

Completion practice: from a new actor, send one idle interaction, advance one tick, read state, then finish `assert.equal(seen.actor.score, ___, 'remote pickup cannot award a score')`. Predict before running. Use the M1 rule to explain the value. Keep this practice separate from your independent ordering scenario; a passing copy of the worked example cannot discriminate the seven ordering defects.

After an interaction is applied or denied, `lastDecision` is `{status,reason,tick}`. Status is `applied` or `denied`; reasons are `pickup`, `deposit`, `range` or `cooldown`. `findings` contains advisory records. Reading a snapshot must not change any of these fields.

Your scenario is checked against these seven deliberate defects, separately: `equal-seq-admitted` (duplicate changes intent), `stale-admitted` (older input changes intent), `stale-interact` (stale input stages interaction), `expiry-T+3` (one tick too early), `expiry-T+5` (one tick too late), `read-renews` (state polling extends intent), and `stale-finding` (retries create advisory findings). A single assertion need not catch all seven; the complete scenario must. Both correct implementations must pass.

## Submit, inspect, repair

Use [the HTTP construction companion](../../learning-support/http-tests.md) for the full sequence from a solved M1 sibling, through two completion steps, to an independent ordering case. Its final source scenario is deliberately absent.

## Build in four checked milestones

| Milestone | Evidence to inspect |
| --- | --- |
| Pure admission | Hand-trace one newer request, one equal sequence and one older conflicting request. Compare every returned state field, including a previously pending interaction. |
| Expiry decision | Evaluate the same admitted state at T+4 and T+5 without mutating it. In `/learn`, complete the boundary check before using this predicate in a scenario. |
| One HTTP observation | Run the remote-pickup sibling, then complete its score and idle-position assertions. Explain why a handled input can still produce a denied interaction. |
| Independent scenario | Map each required behavior to an observed field and a separating tick. Use `order:check` to inspect correct controls and surviving wrong variants. Add missing observations instead of weakening correct-control expectations. |

An admission sibling: with `lastSeq:2` and `pendingInteract:true`, a newer idle request with `interact:false` still leaves one pending interaction. Coalescing preserves that already staged request until the engine consumes it. Completion: with an existing west direction and sequence 7, fill every state field after an older east request with `interact:true`; use the stale rule, not the spelling of the direction. Then implement the general branch for independently supplied inputs.

<details><summary>Hint 1 — find the first changed authority</summary>

Separate parsing, admission and engine ticks. Your policy controls admission fields; it cannot grant cargo, score or position directly. This makes a snapshot mismatch easier to trace back to its cause.

</details>

<details><summary>Hint 2 — observe private intent through later state</summary>

The snapshot does not expose the private direction or staged interaction directly. Arrange a later tick that makes the intended difference visible as movement or an interaction result. Keep that test away from a wall.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

In the M1 sibling, an idle interaction has HTTP 200 but the next snapshot has `cargo:false` and a `range` denial. The request and its effect are separate observations. Record the companion as assistance, then choose the distinct state observation needed by your ordering case.

</details>

## Run the source check

Run `npm run order:check -- --assistance "none"`, or describe actual hints/reference/AI use. The checker separately assesses your policy and your scenario. It must accept two correct implementations and detect the specified wrong ones. Empty, always-failing and response-text-only tests do not pass.

The console prints a JSON evidence path for every component and scenario run. Open that file for its named criteria, expected/actual values and runtime trace. The neighboring `.output.txt` file retains raw process output.

The command captures your source files, response, original prompt/version, help, seed data and trusted runtime identity. Tests use those captured bytes. Changed files during capture refuse a submission. A missing/changed trusted reference refuses grading. An import error, crashed server or timeout is a failed run, not a detected mutant. Every attempt and later revision remains distinct. Use the first failed criterion and raw observed/expected values to diagnose the relevant file.

The files are local and editable by their owner. This preserves evidence for review; it cannot certify honesty against someone who controls the machine. Explanation quality and transfer are not automatically graded.

## Transfer

Explain why stale input cannot stage an interaction, why polling must not renew intent, and why a human re-press can expose a naive detector's false positive. An owned replay scrubber receives seek commands {seq, frame} instead of movement. The latest admitted command selects a frame; reading the displayed frame must not change the selected frame or the last admitted sequence. Explain which admission/observation rules transfer, which four-tick movement rule does not automatically transfer, and propose one stale-command test plus one read-only polling test. Do not invent an expiry requirement for the scrubber. Keep your original predictions and explain changes instead of rewriting history.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run order:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
