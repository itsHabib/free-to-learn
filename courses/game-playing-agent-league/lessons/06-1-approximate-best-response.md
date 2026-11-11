# 6.1 Build an approximate best response

A cautious policy protects against the worst possible reply, but a particular rival rarely makes that reply. You will build a response to a fixed opponent model and test whether its advantage survives fresh games against the actual opponent.

## Decide which opponent you are optimizing against

Minimax protects against an adversary that selects the worst legal reply. A best response to a fixed stochastic policy instead maximizes expected return against that policy's action probabilities. These are different objectives. Neither calculation should be silently reported as the other.

Consider a worked sibling with two choices. A safe choice always returns 0.2. A risky choice returns +1 with probability 0.8 and -1 with probability 0.2 under the stated opponent. Its expectation is `0.8 × 1 + 0.2 × -1 = 0.6`, so a response to that model favors it. A worst-case calculation sees -1 and prefers the safe choice. If the rival changes its behavior, the exploit can disappear.

The learner's `responsePolicy(context)` lives in `learner/vulnerability.mjs`. Its context supplies `opponentPolicy(state)`, returning legal action/probability pairs for a known fixed model, as well as the counted oracle, your evaluation and `parameters.maxDepth`. At your own turn, maximize. At a modeled opponent turn, average over its declared probabilities. Terminal returns and resource limits still apply.

**Commit 6.1-p1.** A response implementation always takes the minimum child value at opponent turns, even though a fixed probability model was supplied. What problem does it solve, and why can it miss a profitable counter-strategy? State the appropriate backup operation without assuming the modeled opponent is perfect.

```sh
node cli.mjs attempt 6.1-p1 --answer 'your objective and backup diagnosis'
node cli.mjs feedback 6.1-p1
```

## Validate the model and keep the budget

Probabilities must be finite, nonnegative and sum to one within the declared tolerance. Every action must be legal in that state. An invalid distribution is a model error, not permission to silently use a favorable replacement. The model describes behavior observable or explicitly supplied for training; it must not reveal a hidden evaluation policy ID.

Use the same transition-credit discipline as your robust search. Exploring an opponent distribution can be expensive. A depth limit or approximate evaluation creates an approximate response, even if the expectation over each expanded node is exact. Record its policy family, depth, budget and training/selection conditions.

Run the practice checker after implementing the response and the gap function introduced in 6.2:

```sh
node cli.mjs check 6
```

The supplied exact tiny-tree utility is an independent comparison instrument. Your learner code still chooses the counter-policy. Passing tiny controls does not prove that your model matches the real rival throughout a game.

**Commit 6.1-p2.** Your counter-policy performs well against its model but poorly against fresh games from the real opponent. Give one model explanation, one search-budget explanation and an experiment that distinguishes them while preserving the original failure.

```sh
node cli.mjs attempt 6.1-p2 --answer 'your explanations and experiment'
node cli.mjs feedback 6.1-p2
```

## Evaluate a frozen response independently

Training or selecting the responder against one set of games can overfit it. Freeze the response before testing it on fresh scenarios and randomness. Compare both seats. Retain failed restarts and the total response budget; selecting the luckiest of many attempts and reporting only its training score is not an independent test.

The actual opponent may be a hidden per-game mixture of archived policies. Choosing one policy for the whole game is not the same as averaging their original action probabilities independently at every state. Observed actions can change beliefs about which policy was chosen. The course's stateless response family does not implement an unrestricted history-dependent best response, so name that limitation.

**Commit 6.1-p3.** A test runner secretly selects one of two opponents at game start. Your responder is handed the chosen snapshot ID. Explain why this changes the task and what must be removed or relabelled before claiming vulnerability against the hidden mixture.

```sh
node cli.mjs attempt 6.1-p3 --answer 'your information-boundary diagnosis'
node cli.mjs feedback 6.1-p3
```

Keep the responder, model, budget, frozen evaluation and a replay exposing the weakness. The next lesson states exactly what that result can establish about exploitability.
