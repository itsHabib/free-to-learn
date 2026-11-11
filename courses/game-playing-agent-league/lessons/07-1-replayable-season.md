# 7.1 Assemble a replayable season

Your newest policy has beaten every opponent you tried yesterday, but yesterday's files do not say which parameters or starting positions were used. Assemble a season whose claim can be checked by rerunning the same decisions and games.

## The season is a declared experiment

A season starts with an evaluation plan. The plan names the rules, the exact policy snapshots, the starting scenarios, both seat assignments, the random seeds and the budget. Freeze those fields before the first scored game. A friendly display name such as `champion` is not enough: changing its parameters changes the policy even when the name stays the same.

The six required roles are a supplied random baseline, a supplied greedy baseline, your search policy, your learned-value search policy, an older learned snapshot and a counter-policy. They should differ in behavior or learned parameters. Merely giving the same program six names does not create a league. You may add two more variants if you have a reason to compare them.

For every unordered pair of policies, play both seat assignments on the same starting scenario. Repeat using the declared policy-randomness seeds. This arrangement makes the roster explicit and preserves useful pairing. The two seat games are related observations; they are not two independent draws of a new scenario.

**Commit before continuing:** item `7.1-p1` asks you to calculate the complete match count for a declared small season. Use `node cli.mjs attempt 7.1-p1 --answer 'your count and reasoning'`, then request feedback.

**Practice 7.1-p1:** A season has six policies, three scenarios, both seats and two randomness replicates. How many games are planned? Explain the unit you counted.

## From a missing result to a complete denominator

Suppose a three-policy season uses two scenarios, both seats and one randomness replicate. There are three unordered policy pairs and four games per pair. The plan therefore expects twelve uniquely identified games. If eleven records exist, the report does not silently redefine the season as eleven games. It identifies the missing key.

A policy that returns an illegal action can legitimately forfeit under the declared rules. A host process that crashes before it records a result does not establish that either policy lost. Preserve that failure and retry the same planned game with a linked reason. A duplicate retry must not count twice. Two different outcomes for the same supposedly deterministic match identity are an inconsistency to investigate, not an invitation to keep the favorable one.

Coverage is part of the result. Before computing a headline, reconcile expected keys, completed results, policy failures and unresolved infrastructure failures. This work is evaluation logic, not a demand that you build a database or job scheduler; the supplied host owns storage and execution.

**Apply it:** commit item `7.1-p2` before viewing feedback. Decide what a report should do with one missing game and one duplicate result.

**Practice 7.1-p2:** Your planned twelve-game season has eleven distinct results and a duplicate of one of those results. May you report twelve completed games? What should happen next?

## Two different kinds of replay

Trajectory replay starts from the recorded initial state and applies the recorded actions through the supplied game engine. It checks the next state and the official result at every step. This establishes that the actions form the reported game. It does not establish that the named policy chose those actions.

Policy rerun goes further. It loads the same policy code and parameters, gives them the same observations and private random stream, enforces the same budget and compares the decisions. Then trajectory replay checks the consequences. Both identities matter. A correct board animation can display a fabricated attribution.

The viewer is a way to inspect where a game changed. It displays data; it does not certify that the data is authentic. Use the command-line verifier for the recorded rules and source identity. If a later rule patch changes the game's semantics, keep the old rule identity with old records. Never recompute an old match with new rules while retaining the old label.

**Transfer:** item `7.1-p3` gives a replay that is legal but has the wrong policy hash. Explain the strongest claim it still supports and the claim it cannot support.

**Practice 7.1-p3:** A recorded action sequence replays legally to the reported winner, but its named policy hash differs from the supplied policy file. What can you claim?

## Build and retain

Assemble a development season through the supplied league runner using your actual learner functions. Inspect a loss, trace its first consequential decision and link that game ID in your notes. Then freeze the final plan and execute its entire roster. Keep the plan, snapshots, raw matches, coverage report and your written claim together. If your learner functions are unfinished, finish their earlier checks first; a supplied demonstration is useful for learning the interface but does not replace your season.

The module's evidence is a complete reproducible season, not a particular champion. Record the first report and any repaired report as different attempts.
