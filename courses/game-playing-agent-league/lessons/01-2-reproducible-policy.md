# 1.2 Make one policy reproducible

Your policy wins, but a rerun of the same match loses. That may reflect a different random choice, changed code or a different game—not a change in strength. In this lesson you will make a policy's decisions reproducible and identify the evidence needed to rerun them.

You need lesson 1.1 and the idea of a deterministic function. Allow approximately 5–7 minutes to read and 25–40 minutes to implement and investigate; these are unmeasured targets.

## Randomness can be controlled

A deterministic game has no random state transition once its state and action are fixed. Its policies can still make random choices. A random policy is useful as a baseline because it produces varied legal behavior without pretending to understand the position. To study that policy, the runner must be able to reproduce its sequence of random decisions.

The supplied `context.rng()` returns the next number in a private seeded pseudorandom sequence. The same seed and same sequence of calls produce the same values. Values lie in `[0,1)`. A policy chooses from a legal-action list using this stream, not the current time or JavaScript's ambient `Math.random()`.

For a worked choice, take three legal actions in the order `[40,42,66]` and a random value of `0.62`. Divide the unit interval into three equal slots. The value lies in the second slot, so this choice uses the second action. The order matters. Sorting the same actions differently after drawing the number changes the decision even though the set of legal actions is unchanged.

Commit **item `1.2-p1`:** The legal actions are `[27,30,54,55]` and the next private random value is `0.76`. Which action does equal-width sampling select? What changes if the program consumes one extra random value before selecting?

```sh
node cli.mjs attempt 1.2-p1 --answer 'Action and consequence of the extra draw'
node cli.mjs feedback 1.2-p1
```

## Freeze what “the same policy” means

A name such as `challenger` is a display label. The policy's behavior also depends on its source, parameters, seed handling and configuration. A source hash identifies bytes; a parameter hash identifies the associated data. The runner records both. Changing a weight while retaining the name creates a new snapshot.

The experiment also needs a game identity, starting state, side assignment and compute budget. If one program receives 256 simulated moves and another receives 1,024, a difference in results does not isolate policy logic. Similarly, repeating the same seed after changing the move order is a new experiment. Reproducibility requires the relevant conditions, not just one familiar number in the report.

Consider two archived records named `runner-up`. Their source hashes agree, but one uses a parameter vector from Tuesday and the other from Wednesday. It is entirely possible for both records to be genuine and for them to choose different moves. The correct repair is to retain both parameter identities. Renaming one record would make it easier to read, but would not replace that evidence.

Commit **item `1.2-p2`:** Two runs have the same policy name and random seed. The second run has different parameter bytes and twice the simulation budget. Can their disagreement establish nondeterminism? List what would have to be held fixed for that diagnosis.

## Replaying moves is weaker than rerunning a policy

A trajectory replay starts from the recorded state and applies the recorded actions. It asks whether those actions produce the recorded states and result under the stated rules. It is valuable: an edited winning score should disagree with the referee's calculation.

A policy rerun asks a further question: given the recorded policy, parameters, observations, seed and budget, does the policy choose those actions again? A person could attach the wrong policy name to a perfectly legal action trace. That trace could pass trajectory replay while failing policy rerun.

This distinction helps you localize a problem. If policy decisions differ before any state difference, inspect policy identity, random-call order and configuration. If actions agree but states differ, inspect the rule/runtime identity and transition record. Do not begin by tweaking strategic weights; that would change the object you are trying to diagnose.

Commit **item `1.2-p3`:** Every recorded action replays to the recorded final state. The reported policy, rerun with its frozen inputs, chooses a different first action. Which reproducibility claim passed, which failed, and what should the report avoid claiming?

## Revise your policy and retain the evidence

In `learner/baseline.mjs`, make your choice rule explicit. You may keep a deterministic rule or use the private random stream. A valid deterministic policy does not need artificial randomness. A valid randomized policy must draw only from its supplied stream and return a legal action.

Run `node cli.mjs check 1`. The checker exercises legality and declared reproducibility behavior; inspect the individual results. Keep your first failed version in your own version history or exported record. The course journal records your written attempts and assistance; it does not magically preserve every edit to a JavaScript file. Save code snapshots when you want to compare versions.

Use `node cli.mjs history` to inspect attempts and `node cli.mjs export ./my-attempts.json` to create a portable journal. Export is useful evidence of your reasoning history, not proof that a policy produced a tournament trace.

**Item `1.2-transfer`:** A program logs a random number for debugging by calling `context.rng()` and then calls it again to choose its move. Debug logging is later disabled, and decisions change. Explain the cause and propose a repair that preserves the intended choice sequence without removing useful diagnostics.

Commit the transfer answer before feedback. After a miss, request a hint, revise the specific explanation and rerun the relevant check. You are ready to proceed when you can reproduce the decision and explain exactly which frozen inputs make that claim meaningful.
