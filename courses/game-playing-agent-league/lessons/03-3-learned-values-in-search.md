# 3.3 Put learned values inside search

A new agent wins more games, but it also searches four times as many positions. You will compare learned and hand-written evaluations while keeping computation and evaluation conditions visible.

## Keep known outcomes stronger than guesses

Search uses an evaluation when it stops before a terminal state. A terminal result is different: it is an outcome established by the game rules. The course keeps terminal returns exactly at -1 or +1 and bounds nonterminal heuristic scores to `[-0.99,+0.99]`. A learned raw prediction of 1.4 must not outrank a proved win.

The bound is applied at the search boundary. Keep the raw prediction separately for regression diagnostics; otherwise clipping can hide a badly calibrated model. Feature computation must use the requested player's perspective, and terminal checks still happen before depth truncation.

For a worked sibling, imagine two available actions. One reaches a terminal win. The other reaches an unexplored position whose regression prediction is 1.2. The search adapter bounds the second estimate below 1, preserving the distinction between a forecast and an established result. This is an interface guarantee, not proof that the forecast is otherwise good.

**Commit 3.3-p1.** A model predicts -1.7 for a nonterminal position. Should the training-error report, the search score and the terminal-return field all contain the same number? Explain the purpose of each field.

```sh
node cli.mjs attempt 3.3-p1 --answer 'your three-field explanation'
node cli.mjs feedback 3.3-p1
```

## Change one cause at a time

An ablation is a comparison that removes or changes one component while retaining the others. To study learned values, compare the same search procedure with a hand-written evaluation and with the learned evaluation. Use the same scenarios, seats, policy seeds, transition budget and evaluation protocol. Record actual credits used: equal upper limits do not guarantee equal consumption.

Then compare the learned evaluation with and without the added search. This asks a different question: how much does planning contribute once the value function is fixed? A four-cell comparison—hand-written/learned crossed with shallow/deeper search—can reveal interactions. Learning might help at shallow depth and matter less when search reaches terminal outcomes.

For example, agent A uses a hand-written value at 64 credits, while agent B uses a learned value at 256. Their win-rate difference measures the combined change. You cannot attribute it solely to fitting. A new comparison with the same credit budget is needed; relabeling the old table does not repair the design.

**Commit 3.3-p2.** You can afford only one additional comparison after observing B beat A under different budgets. Specify the comparison that best isolates the learned value's contribution, including which settings you freeze.

```sh
node cli.mjs attempt 3.3-p2 --answer 'your controlled comparison'
node cli.mjs feedback 3.3-p2
```

## Follow a changed decision back to its evidence

Re-run your search and learning practice checks before comparing agents:

```sh
node cli.mjs check 2
node cli.mjs check 3
node cli.mjs roster ./work/value-model.json --out ./work/value-league.json
node cli.mjs league ./work/value-league.json --out ./work/value-season.json
```

The code checks establish finite correctness properties. The experiment must still establish what the change did in games. Pick a position where the policies choose different actions. Inspect the explored replies, cutoff states and evaluated features. A plausible explanation names how the value difference changed the search decision; “the AI learned strategy” is too vague to test.

The supplied roster adapter assembles random, greedy, hand-written-search and learned-search policies. It supplies wiring, not your value or search logic. Use fresh output names when you rerun: saved evidence is not overwritten.

Retain one useful improvement and one failure or limitation. If the learned policy is weaker, preserve that result and investigate its dataset, features or distribution. Do not keep retesting the same final positions until a favorable version appears and then present them as untouched evaluation.

**Commit 3.3-p3.** A learned evaluation improves average outcome but repeatedly misses a rare forced defense. Propose an intervention and an evaluation that could reveal whether you fixed that weakness without erasing the evidence of the original failure.

```sh
node cli.mjs attempt 3.3-p3 --answer 'your intervention and evaluation'
node cli.mjs feedback 3.3-p3
```

The search adapter and serialization are supplied. Your module artifact is the fitted value, your existing search, an ablation plan and a trace-based explanation. Module 4 turns these comparisons into a report with complete denominators and appropriately limited uncertainty.

## Run your fitted policy

After completing your features, fit and search, use the supplied plumbing:

```sh
node cli.mjs league development-league.json --out ./work/behavior.json
node cli.mjs fit ./work/behavior.json --out ./work/value-model.json
node cli.mjs roster ./work/value-model.json --out ./work/value-league.json
node cli.mjs league ./work/value-league.json --out ./work/value-season.json
```

Use new output names for new experiments. These commands call your implementations; they do not supply a trained solution. The four-policy development roster includes the supplied baselines and your two search variants. Module 4 supplies the reasoning needed to interpret the comparison.
