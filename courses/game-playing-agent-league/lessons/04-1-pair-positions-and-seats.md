# 4.1 Pair positions and swap seats

Your candidate wins every game in one starting seat and loses every game in the other. You will construct a complete paired comparison that separates a policy's result from the opportunities its seat received.

## Name the quantity you are measuring

An estimand is the quantity a comparison is intended to estimate. Here, a simple estimand is policy A's mean utility against B over a declared distribution of starting scenarios, giving both seats equal weight. Utility is +1 for a win and -1 for a loss. A win fraction of 0.75 corresponds to mean utility 0.5 when every scored game is a win or loss.

For each starting scenario, run A in seat 0 against B in seat 1, then swap policies on the same starting state. Do not quietly replace the state when swapping. Geometry and side-to-move can make a seat favorable; pairing ensures both policies receive it.

As a worked sibling, A wins as seat 0 and loses as seat 1 on a particular scenario. Its paired mean utility is `(1 + -1) / 2 = 0`. Reporting only the first game would say +1 and answer a different question. The paired average does not prove the starting game is balanced; it removes that one-sided allocation from this comparison.

**Commit 4.1-p1.** On scenario S, A loses in seat 0 and wins in seat 1. On scenario T, A wins in both seats. Compute A's per-scenario means and equal-scenario overall mean utility. Explain why the four individual results should remain available.

```sh
node cli.mjs attempt 4.1-p1 --answer 'your means and explanation'
node cli.mjs feedback 4.1-p1
```

## Freeze the denominator before collecting results

The supplied plan contains an ordered `roster` of match slots. A slot identifies its scenario, ordered seat policies, canonical pair, replicate, seeds and budget. Its ID is the denominator's unit of identity. Results arrive as `{slotId, record}` envelopes. The record also names its plan, scenario and policy snapshots so the reducer can reject a mismatched result.

Implement `summarize(records, plan)` in `learner/report.mjs`. It reports expected and observed coverage, missing slots, duplicates and invalid records before drawing a conclusion. A convenient list of completed games is not the evaluation plan. If the most difficult game crashes, silently removing it can improve an average without improving the agent.

A policy forfeit is different from an infrastructure interruption. A declared illegal action or deterministic budget violation receives the runner's forfeit result and remains visible as a qualification problem. A host failure does not invent a game outcome. Preserve the failure, keep the slot unresolved, and use a linked retry of that exact planned game.

**Commit 4.1-p2.** A 12-slot plan has ten valid results, one duplicate of a completed slot and one result from an unknown plan. What are the expected count and valid unique observed count? What must happen before the report can claim complete coverage?

```sh
node cli.mjs attempt 4.1-p2 --answer 'your coverage accounting'
node cli.mjs feedback 4.1-p2
```

## Keep weights and identities stable

If each scenario has two seats and two randomness replicates, first aggregate those four games into a scenario block. Give each scenario the weight declared in the plan. Pooling a scenario with ten retries as though it supplied ten independent samples changes the question and can dominate the result.

For a complete pair, the payoff matrix entry `A[i][j]` is policy i's mean utility against j. The reversed entry is its negative because these are the same zero-sum matches viewed from the other policy. An unplayed pair is unknown, not zero. The diagonal zero is a convention, not a claim that self-play was measured.

Run the report practice checker after implementing coverage and reduction:

```sh
node cli.mjs check 4
node cli.mjs report ./work/value-season.json --out ./work/value-report.json
```

**Commit 4.1-p3.** A second experiment adds extra games only on scenarios where the candidate initially lost. Propose a valid use of those games and an invalid use. Explain how your retained report can keep the new evidence without silently rewriting the original estimand.

```sh
node cli.mjs attempt 4.1-p3 --answer 'your valid and invalid uses'
node cli.mjs feedback 4.1-p3
```

Keep the frozen plan, coverage report and per-scenario blocks. They become the inputs to uncertainty analysis in 4.2.
