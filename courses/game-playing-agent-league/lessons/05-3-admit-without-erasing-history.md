# 5.3 Admit a new policy without erasing history

A candidate has the highest average score but reopens a weakness your league had already repaired. You will make an admission decision using a declared objective, comparable evidence and preserved historical snapshots.

## Admission answers a product question

Admitting a policy means making it available for future sampling or selection. It does not have to mean replacing every older policy. A league may value broad coverage, low vulnerability to a tested responder, strong performance against a target population, or a useful counter-strategy. State the objective before evaluating the candidate.

A synthetic example illustrates the distinction. Candidate C gains substantially against a recent aggressive rival but loses a defense against an older cautious rival. If your declared objective is average return against a population dominated by the aggressive rival, admitting C may be reasonable. If preserving the cautious-rival defense is a mandatory constraint, the same evidence may justify rejection or retaining both policies. There is no context-free “highest score wins” rule.

Any empirical thresholds must be declared before the relevant selection experiment and interpreted with uncertainty. They should not be repeatedly adjusted until the preferred candidate passes. You can revise the policy for the next experiment, but record that revision.

**Commit 5.3-p1.** A candidate improves average utility by 0.08 but loses 0.4 against a previously important opponent. Give two defensible admission decisions under different explicitly stated objectives. Explain why the raw average alone cannot choose between them.

```sh
node cli.mjs attempt 5.3-p1 --answer 'your two objectives and decisions'
node cli.mjs feedback 5.3-p1
```

## Compare like with like

Use frozen selection evidence with common game rules, scenarios, seats and compute budgets. A candidate evaluated with four times the search budget is a different system; its result can be useful, but does not demonstrate that the policy logic alone improved. An incomplete result cannot silently pass because the finished games look favorable.

Snapshot identity includes source, learned parameters and relevant configuration. A new display name does not create a new policy. Conversely, an unchanged source file with different learned weights may represent a genuinely different policy. Retain parent IDs, training data/configuration and actual credit usage so the ancestry can be audited.

The final league requires six distinct roles: supplied random and greedy baselines, your search policy, your learned-value/search policy, an earlier snapshot and a counter-strategy. It allows up to two additional variants. Diversity here must have a behavioral or parameter basis; eight aliases of the same source and weights do not provide eight strategies.

**Commit 5.3-p2.** Two archive entries have different names but identical source, parameters and configuration hashes. A third has the same source as the first but different learned weights. Explain how you would classify them and what further behavior evidence could help.

```sh
node cli.mjs attempt 5.3-p2 --answer 'your identity and diversity audit'
node cli.mjs feedback 5.3-p2
```

## Retention is not deletion

An active sampling roster can have a size limit. Removing a snapshot from active sampling means assigning it no current training probability or excluding it from a particular run. It does not require deleting its source, parameters, failed experiments or historical reports. Those records explain how the current league reached its decision.

Keep at least one historical policy in evaluation even when it is no longer sampled for training. Save the exact admission evidence and decision. If a later generation regresses, you can reproduce the older comparison instead of relying on a remembered headline.

A candidate can be correctly rejected. A weak training run should remain a recorded run rather than disappear from an algorithm comparison. An inconclusive admission decision may justify collecting more preplanned evidence; it should not trigger unbounded retries until a lucky result appears.

**Commit 5.3-p3.** The archive has reached its active-size limit. Design a retention decision that frees one training slot while preserving the ability to reproduce an old failure and measure future regression. State exactly what remains stored and what changes.

```sh
node cli.mjs attempt 5.3-p3 --answer 'your retention record'
node cli.mjs feedback 5.3-p3
```

Your module artifact is a reproducible sampler, historical comparison and written admission/retention rule. Module 6 will challenge the admitted champion with a deliberately trained response, then test whether your ranking hides a strategic cycle.

## Execute the population experiment

After the feature, fit, search and sampler checks pass, run `node cli.mjs train development-training.json --out ./work/training.json`. The supplied driver calls your sampler once per game and retains learned generations with their data hashes and parent snapshots. It uses append-only admission; your own admission decision remains an explicit experimental choice to justify.

`node cli.mjs roster ./work/training.json --out ./work/population-league.json` assembles a six-role development roster. Its counterpolicy requires module 6 before the full roster can run. Do not treat assembly as proof that the policies meet their roles.
