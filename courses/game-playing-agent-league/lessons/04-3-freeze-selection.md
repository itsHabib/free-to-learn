# 4.3 Freeze selection before final evaluation

After seeing a final evaluation loss, you repair the policy and run the same cases again. You will distinguish useful development from confirmation and preserve the history that makes the distinction visible.

## Give each partition a job

Training data changes parameters. Selection data helps choose among features, budgets, checkpoints or policies. Final evaluation measures a candidate chosen before its results are inspected. These are roles in a workflow, not magical properties of filenames.

If you use a final result to decide what to change, that result has become selection evidence. This does not make the improvement worthless. It changes what you can claim. Label the follow-up exploratory and use fresh, separately specified final evidence for a confirmatory claim.

As a worked sibling, a designer compares three feature sets on a selection roster, chooses the second, freezes its source and parameters, and runs a distinct final roster once. That final report evaluates the chosen version. If the designer instead picks whichever feature set scored highest on the final roster, the apparent winner benefits from selection on the very evidence being reported.

**Commit 4.3-p1.** A policy fails final scenario Q. You add a feature targeting Q and rerun all final scenarios. Which results can still be retained, how should the new report be labelled, and what would support a new confirmatory claim?

```sh
node cli.mjs attempt 4.3-p1 --answer 'your evidence disposition'
node cli.mjs feedback 4.3-p1
```

## Freeze a concrete comparison

A useful plan identifies the exact policy snapshots and parameters, game/rules hash, scenario roster, seed schedule, seat assignments, budgets, score, uncertainty procedure, missing-game handling and intended claim. A label such as “candidate-v2” is insufficient if its file can change between games.

The supplied plan and snapshot machinery preserve identities. Your responsibility is to choose the comparison before inspecting its final outcomes. Record why the comparison answers the decision you need to make. A plan might ask whether a specific candidate improves mean utility against a declared opponent mixture while keeping old-opponent regressions visible.

Predeclaring a plan does not rescue an invalid metric or buggy runner. Run correctness controls first. If a genuine infrastructure defect forces a repair, retain the old failed run and explain which records are invalid. Do not disguise a policy edit as an infrastructure repair so that it inherits the old untouched-test label.

**Commit 4.3-p2.** Mid-run, you discover that one policy's parameter file changed while its display name stayed the same. Explain why averaging the completed games is unsafe and identify what must be frozen and rerun.

```sh
node cli.mjs attempt 4.3-p2 --answer 'your identity repair'
node cli.mjs feedback 4.3-p2
```

## Avoid choosing the story after seeing the noise

If you inspect many pairwise comparisons, some may look favorable by chance. Reporting only the most attractive nominal interval hides this search. Likewise, repeatedly checking an ordinary interval and stopping at the first favorable result does not preserve its original fixed-sample interpretation.

For this course, choose one primary contrast and sample plan before final evaluation. Other pairwise results may be shown as descriptive evidence with that label. If your decision needs many simultaneous claims or adaptive stopping, use a separately justified statistical procedure. Do not improvise one after the results arrive.

“No clear improvement” is an acceptable conclusion when evidence is limited. It does not mean your implementation is correct automatically; code checks and experimental validity remain separate. Preserve negative results because they help the next controlled decision and stop future you from rediscovering the same failed idea.

**Commit 4.3-p3.** A colleague tests 30 candidate/opponent comparisons and wants to headline the only positive nominal 95% interval. Propose an honest report of what happened and a follow-up experiment that tests the resulting hypothesis.

```sh
node cli.mjs attempt 4.3-p3 --answer 'your report and confirmation plan'
node cli.mjs feedback 4.3-p3
```

Your module artifact is a frozen plan, complete coverage report, correctly grouped uncertainty and a claim tied to exact snapshots. Keep these rules when you begin automatic self-play: automation can generate more comparisons, but cannot make adaptive selection disappear.

## Execute your report

After completing `summarize`, run `node cli.mjs report ./work/value-season.json --out ./work/value-report.json`. Use the actual season produced in module 3. The host verifies its schedule and replay, then your code builds the statistical report. Inspect the matrix, scenario blocks and uncertainty before interpreting a winner. A valid host record cannot make a flawed summarizer correct.
