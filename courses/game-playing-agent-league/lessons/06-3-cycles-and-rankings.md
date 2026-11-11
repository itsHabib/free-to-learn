# 6.3 Read cycles that a single ranking hides

Agent A beats B, B beats C, and C beats A. You will recognize this nontransitive structure and explain why a single ordered leaderboard cannot capture every matchup.

## Read the pairwise relation first

A relation is transitive when A being above B and B above C implies A above C. Competitive policies need not satisfy that property. Different strategies can expose different weaknesses. Nontransitivity therefore concerns interactions, not merely uncertainty in a scalar skill number.

Consider an explicitly synthetic exact matrix with zeros on its diagonal: A earns +1 against B and -1 against C; B earns +1 against C and -1 against A; C earns +1 against A and -1 against B. Against a uniform mixture of the other listed strategies, no one is a universal champion. Yet choosing any single policy leaves a clear counter-policy in the set.

A directed graph makes this structure visible. Draw an edge from a policy to one it defeats under the declared comparison rule. The three edges above form a directed cycle. Retain the underlying matrix: a graph alone can hide the size and uncertainty of each advantage.

**Commit 6.3-p1.** A scoreboard sorts the synthetic cycle by policy name after all three receive the same average. Explain what the order means and why calling the first row the strongest policy would be misleading. Identify the information a reader needs beside the scalar score.

```sh
node cli.mjs attempt 6.3-p1 --answer 'your leaderboard interpretation'
node cli.mjs feedback 6.3-p1
```

## Do not manufacture a cycle from missing or noisy results

In the real league, pairwise payoffs are estimates from finite games. An unplayed pair is unknown, not a tie. A tiny positive mean is not automatically a reliable directional edge. Show the complete count, interval procedure, comparison status and any missing games for each pair.

If you inspect many potential edges, recall the selection problem from 4.3. A cycle found after searching many noisy comparisons is descriptive unless the simultaneous inference or confirmation plan supports a stronger claim. Do not choose the edge threshold after looking at the plot merely to make a dramatic loop appear.

The course includes an exact analytic cycle control so that you can demonstrate correct reasoning even if your particular game population does not develop a natural cycle. A genuinely transitive-looking population is a valid observation. Failing to produce a dramatic cycle is not a reason to alter results.

**Commit 6.3-p2.** A beats B in complete paired evidence and B beats C, but A versus C was never run. What graph can you draw? What claim must remain open, and which missing comparison would resolve it under the same plan?

```sh
node cli.mjs attempt 6.3-p2 --answer 'your graph and missing evidence'
node cli.mjs feedback 6.3-p2
```

## Choose a population for a declared opponent distribution

A mixture can reduce the weakness of committing to one predictable policy. In the exact cyclic example, a uniform mixture has zero restricted gap against those three strategies. That conclusion depends on the complete specified matrix. Adding a stronger unlisted response can change it.

The league samples a member once per game. Its average payoff against an independently sampled opposing mixture is the corresponding weighted matrix average when the matrix describes those same frozen policies and conditions. Mixing policies anew at every turn changes the policy and requires new evaluation; the old matrix is no longer sufficient.

A single scalar remains useful for a specific decision—for example, expected utility against a stated opponent mixture. Label that mixture and keep the payoff structure visible. A policy can be best for today's target distribution without being generally best or safe against every response.

**Commit 6.3-p3.** A deployment expects one opponent 90% of the time and the other two only 5% each. Explain why the best expected-return choice may differ from a low-gap mixture. Propose a report that shows the tradeoff and a test for what happens if the opponent distribution changes.

```sh
node cli.mjs attempt 6.3-p3 --answer 'your objective tradeoff and test'
node cli.mjs feedback 6.3-p3
```

Your module artifact is a working counter-policy and gap function, a pairwise matrix, a cycle/unknown-edge interpretation, and a bounded vulnerability claim. Module 7 uses these artifacts to assemble and defend a replayable season rather than simply naming its highest-scoring row.
