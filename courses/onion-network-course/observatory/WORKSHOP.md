# The reply never arrived. What happened?

Build an experiment that distinguishes a lost forward message from a lost reply, then decide what can recover. You control several circuits, the order of events and the fault boundary. Your eight protocol functions still do the work. This workshop supplies a scheduler and observer views, not a replacement implementation.

Start after module 5 with your working **browser-format** source. Complete module 6 for the final observer argument. Budget 35–55 minutes as an untested planning estimate. You can run an unfinished implementation: step errors are preserved and later steps continue. Nothing here automatically awards a pass or forces a particular valid path.

## Run an experiment

In the existing workbench, keep your code in **Your browser project source** and expand **Multi-circuit failure and recovery workshop**. The loaded scenario is `scenarios/recovery.json`. Use **Edit**, **Move up**, **Move down**, **Remove**, and the action form to change its steps. **Add step** appends a new step; **Update step** replaces the selected step. Disabled fields do not apply to that action. Commit observer predictions, then choose **Run experiment**. It runs the exact current code and scenario in the existing disposable worker.

**Save experiment draft** keeps the scenario separately from your code draft. **Download scenario** and **Load scenario JSON** exchange experiment instructions and predictions, never executable protocol code. **Export project history** includes the original source, complete scenario, scenario SHA-256, experiment contract, question hash, build/worker identities, declared help and actual results. A later scenario revision creates a new attempt. A changed scenario or prediction makes the displayed earlier result visibly stale.

The installed Node route uses the same bundled worker, without a browser or server:

```sh
node tools/browser-lab.mjs workshop scenarios/recovery.json learner/browser-solution.js none-declared
```

Replace `learner/browser-solution.js` with the path to **your** completed browser-format source. The distributed starter still contains TODOs; it is not a working solution. The command saves a new `browser-attempts/<id>/submission.json` and `result.json`. Exit zero means the scenario executed, including any recorded step failures; it does **not** mean your protocol or claims passed. A malformed scenario or worker failure exits nonzero. No tool silently converts the synchronous `learner/solution.mjs` API.

## Experiment 1: Two circuits, three views

The starter uses a three-hop `alpha` restricted to cedar/birch/maple and a two-hop `beta` restricted to elm/ash. Your path selector chooses the order. These lengths make disjoint paths possible with five relays; a two-hop path is not a promise of equivalent privacy.

1. Before running, predict what **client**, **archive**, and a relay of your choice can directly establish when `alpha` loses a reply. State at least one claim each cannot establish.
2. Run. Start with the **client** evidence view. It sees a sent lookup and no usable reply. Switch to **archive**: did it receive the lookup? Compare with the operator view only after writing your initial conclusion.
3. Inspect the step that takes birch offline, the next `alpha` send, and the later `beta` send. Which receiver sets changed before failure? Does the failure of one circuit close every other circuit? Support the answer with events, not the scenario's intention.
4. Inspect recovery and the two replay probes. Distinguish old bytes offered to fresh keys from old bytes offered to the closed circuit. Inspect the new circuit's first successful sequence and identity. Why can a fresh circuit use zero without reusing the old encryption key/nonce pair?
5. Change only the first fault to `drop-forward` at hop zero. Add revised predictions and rerun. Compare the two saved scenarios. Which client observations are compatible with both experiments? Which archive observations distinguish them?

The `failed` list is knowledge you explicitly supply to recovery. The client does not learn a hidden failure location from a missing reply. Offline directory entries also constrain path selection. Online and trustworthy are different properties.

## Experiment 2: Move the boundary, keep the packet

Load `scenarios/integrity.json`. A **send** captures the original forward bytes before any injected corruption. A **replay** injects those exact captured bytes, including into another circuit if you name one. It does not wrap a new request.

Predict the first corruption, first replay and second replay separately. Then move the corruption from hop zero to hop one. Keep your code and every other scenario step unchanged. Explain why authenticating nothing at the entry is different from accepting at the entry and failing at the middle: replaying from the start now meets the entry's already-recorded sequence. A later genuine packet is only guaranteed to remain admissible at a receiver whose rejected input did not change its state; upstream receivers may already have accepted it.

Do the same with the dropped message. A drop occurs **before** the selected relay receives or authenticates anything. A corrupted message reaches that relay and may produce a local rejection. Use received/rejected events and the operator's receiver-state snapshots to separate the cases. A replay with broken replay protection may reach the archive again and only fail later from return-key nonce reuse. Do not mistake that later error for successful replay protection.

Design a repair experiment using `recover`, a fresh `send`, and optional `close`. There is no automatic retry: your scenario must request it. Repeating this fictional read-only lookup is suitable for the exercise. Nothing demonstrates exactly-once effects for a purchase, balance change or arbitrary message.

## Experiment 3: Recovery is allowed to stop

Load `scenarios/exhaustion.json`. Predict recovery when only two relays remain online for a three-hop circuit. Restoring capacity does not resurrect the closed circuit or its keys. Determine the explicit next action that permits a fresh lookup.

Try a different legitimate path order in your implementation. Keep valid alternatives rather than forcing cedar to be first. Demonstrate either a qualifying replacement of the old length or a justified stop. Run the existing module checks separately to establish conformance; the workshop intentionally displays faulty implementation behavior too.

## Submit the evidence

Keep three scenario attempts: a baseline, a single-boundary change, and your own recovery design. Include their source/scenario hashes and declared help. For each, cite step numbers and an observer-specific event supporting your claim. Name a plausible alternative explanation the client cannot rule out. Add a short explanation of why the operator's combined trace is stronger than any relay's projection. The reviewer should assess causal reasoning and valid recovery choices, not exact prose, relay order, or one preferred sequence of experiments.

Your reasoning stays **UNASSESSED** until someone reviews it. A nonempty prediction, lack of thrown steps, or a green module check does not establish mastery or anonymity.

## Scenario format

A JSON scenario has `version: 1`, a `title`, a `predictions` array of `{ "observer": "client", "claim": "..." }`, and an ordered `steps` array. The supplied files are editable starting points with no answer predictions.

| Action | Required fields | Effect |
| --- | --- | --- |
| `open` | `circuit`, `length` (2–4), `avoid` (relay list) | Calls your path selector and creates fresh circuit keys. |
| `send` | `circuit`, unique `packet`, `item` (`luna` or `tide`) | Allocates a new sequence, captures your forward packet, then delivers it. |
| `replay` | `circuit`, `packet` | Injects an earlier captured forward packet at this circuit's entry. |
| `offline` / `online` | `relays` | Changes directory availability for later actions. No automatic close or reopen. |
| `recover` | `circuit`, unique `replacement`, `failed` (relay list) | Closes the original, invokes your recovery plan, and creates its replacement if any. |
| `close` | `circuit` | Closes this circuit and invalidates its key handles. |

A send may have `fault: { "kind": "drop-forward", "hop": 1 }`, `fault: { "kind": "corrupt-forward", "hop": 0 }`, or `fault: { "kind": "drop-reply" }`. Omit `fault` for normal delivery. Hop zero is the actual entry selected by your code. `drop-reply` discards the reply immediately after archive processing and before return wrapping. These are declared function-call boundaries, not measured network losses. An offline relay stops forward delivery before receipt. Multiple interventions take effect in path order.

Use only `cedar`, `birch`, `maple`, `elm`, `ash`. Circuits and packets have distinct short letter-led names. Scenarios support 1–32 steps, at most 8 circuit creations, and up to 12 predictions of 2,000 characters each. These bounds keep local reports manageable; they do not constrain a path selector to a preferred answer. Static schema errors stop before steps run. A valid step that names a missing circuit, references an uncaptured packet or uses a nonexistent hop produces a recorded runtime error; subsequent steps still run. No earlier attempt is overwritten.

## What the evidence cannot establish

Steps run sequentially. There is no concurrency, clock, realistic timeout, congestion, packet fragmentation, relay service or external traffic. A `no-reply` client event is a synthetic missing-response observation, without the operator's fault code or location. The client knows its configured path and explicit recovery inputs. Relays see local receipt/rejection and accepted forwarding; the exit and archive see the fictional lookup because this toy has no endpoint encryption.

Step numbers and circuit aliases are shared teaching labels, not evidence that real observers can identify the same traffic. Operator state, fault script and the complete exported result are deliberately available for learning. The observer selector is a projection, not an access control boundary. Closing invalidates key handles but cannot promise secure erasure of JavaScript memory. The worker closes all remaining circuits after recording the final snapshot. None of this is Tor, a Tor deployment tool, a real anonymity guarantee or secure messaging.

Real browser execution, storage behavior, layout and accessibility acceptance remain **NOT_RUN** in this build. Use the offline worker command in this delivery environment; it requires no server, installation or network.
