# 5.1 See what latest-only self-play forgets

The newest policy defeats yesterday's checkpoint but loses to a policy from several generations ago. You will diagnose that regression without assuming that each generation has become generally stronger.

## A changing opponent changes the learning problem

Self-play generates experience by having policies compete against themselves or related policies. It can produce a useful training curriculum: a new opponent exposes a weakness, the learner adapts, and the resulting games offer new situations. But the distribution of experience changes as the opponent changes.

With latest-only self-play, training concentrates on the newest opponent. A response that wins this narrow contest may neglect a defense that mattered against older policies. This is not necessarily a software bug or catastrophic parameter forgetting in the strict machine-learning sense. It can be a strategic distribution shift: the current objective no longer rewards that defense.

Consider this explicitly synthetic comparison. Snapshot C scores +0.6 against latest snapshot B but -0.5 against older snapshot A. Snapshot B had scored +0.3 against A. C's improvement against B is real on those measured matchups; it does not imply that C is the best choice against a population containing A. The missing comparison matters more than the generation number.

**Commit 5.1-p1.** Your new snapshot wins against its immediate predecessor but its aggregate score against a frozen three-opponent roster decreases. Give two distinct explanations to investigate, one strategic and one experimental, before concluding that self-play caused forgetting.

```sh
node cli.mjs attempt 5.1-p1 --answer 'your two explanations'
node cli.mjs feedback 5.1-p1
```

## Compare on a common roster

Keep a historical archive of immutable snapshots. Evaluate new and old candidates against the same frozen opponents, scenarios, seats, seeds and compute conditions. A history graph should show individual matchups as well as any aggregate score. A rising training reward can coexist with a falling score against the old archive.

Recall module 4: a missing difficult game must not become a zero, a duplicate retry must not add weight, and games from one checkpoint do not become independent training runs. Before explaining a regression strategically, verify snapshot identities and complete coverage. A changed parameter file under an old name can manufacture a false learning story.

When a genuine regression remains, inspect a losing trace. Identify a concrete behavior: the new agent advances too quickly into a threat, overvalues material, or repeatedly assumes a reply that the old opponent does not make. A useful diagnosis connects a change in experience or evaluation to an observed decision. It does not need to tell an anthropomorphic story about the agent's intentions.

**Commit 5.1-p2.** A chart shows performance at generations 1–5, but each point used a different opponent roster. What can the chart legitimately show? Design a second chart that can reveal regression against historical opponents.

```sh
node cli.mjs attempt 5.1-p2 --answer 'your chart interpretation and redesign'
node cli.mjs feedback 5.1-p2
```

## Preserve a weakness before repairing it

Choose one historical regression and save the old/new snapshot hashes, fixed comparison plan and a representative replay. That evidence becomes a regression test for your league design. A later repair should face the same disclosed development case and fresh cases selected under the next evaluation plan.

Adding old opponents to training can help retain useful defenses, but it is not guaranteed to improve every objective. A limited training budget spread across many opponents may learn more slowly against any one of them. This is why module 5 compares latest-only, uniform-history and a declared learner-chosen distribution under the same training budget.

**Commit 5.1-p3.** You have a budget for 600 training games and six archived opponents. Propose a comparison between latest-only and uniform-history training that keeps the budget honest. State which historical evidence you retain even if uniform-history performs worse.

```sh
node cli.mjs attempt 5.1-p3 --answer 'your comparison and retained evidence'
node cli.mjs feedback 5.1-p3
```

Your artifact is a historical matchup audit and a preserved failure case. The next lesson turns a proposed opponent distribution into a reproducible sampler rather than an informal list of opponents you sometimes remember to test.
