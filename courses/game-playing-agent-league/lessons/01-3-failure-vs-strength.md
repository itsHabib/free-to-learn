# 1.3 Separate playing strength from harness failure

A tournament says your agent won six games, but two planned matches are missing. A clean percentage would conceal whether the agent played well, returned illegal moves or never ran. In this lesson you will classify those outcomes and preserve enough evidence to make the result interpretable.

You need lessons 1.1–1.2. Allow about 5–7 minutes to read and 20–35 minutes to examine records and complete the module; these times are design targets.

## A legal loss is useful evidence

A completed game has a sequence of legal actions and a terminal outcome from the referee. Your agent may lose because its evaluation was poor or it missed an adversarial reply. Those are strategic failures. They belong in the result. Deleting them would remove precisely the observations that can improve your policy.

A policy forfeit has a different cause. The program may return an illegal action or exceed the deterministic simulation quota. It did not satisfy the decision contract. The league records the forfeit and its reason instead of silently substituting another policy's move. A strong fallback would award the program competence it had not demonstrated.

For a worked record, suppose a policy is allowed 12 simulation calls but makes a thirteenth and then returns a legal move. The final action's legality does not erase the quota violation. The program used a decision process outside the agreed contract. Compare that with a policy that uses only four of the allowed 12 calls and loses legally: using less than the maximum is permitted, and its loss remains a game result.

Commit **item `1.3-p1`:** Classify these three cases as legal game loss, policy forfeit, or unresolved infrastructure failure: (A) the opponent reaches the final row after legal play; (B) the policy returns an action absent from the current legal list; (C) the host process stops before a result is committed. Explain why they must not be collapsed into one label.

```sh
node cli.mjs attempt 1.3-p1 --answer 'A: ...; B: ...; C: ...; explanation'
node cli.mjs feedback 1.3-p1
```

## An interrupted host has not supplied a game result

A host crash, failed write or watchdog interruption can leave the result unknown. It does not establish that either policy won. Keep the partial record and classify the planned game as incomplete. The report cannot quietly replace the unknown outcome with a draw; the default game has no draw rule that says “the computer stopped.”

An exact rerun can resolve an incomplete game when its inputs are retained. Link the retry to the same planned match, its snapshot identities and the reason for rerunning. Do not count the original partial record and the retry as two independent games. If an apparently identical completed record arrives twice, the system should recognize the duplicate. If their results conflict, it should expose the conflict rather than choosing whichever result arrived last.

Suppose a plan contains ten matches. Seven complete legally, one policy forfeits, and two are interrupted. There are eight resolved outcomes and two unresolved entries. A win rate among the seven legal games answers a narrower question than a score over all resolved outcomes. Neither denominator turns the two unknown entries into evidence. Later modules will specify the comparison before running it; for now, preserve the categories so that comparison remains possible.

Commit **item `1.3-p2`:** A report has four wins, three legal losses, one forfeit by the evaluated policy and two host interruptions in ten planned games. Give the counts of resolved and unresolved matches. Is “four wins out of ten completed games” an accurate description? Explain the correction.

## Diagnose the first disagreement

Use the earliest reliable divergence to decide what to inspect. If the policy returns a forbidden action, examine the decision contract and current observation. If a legal action produces an unexpected state, inspect the rules/version and transition evidence. If a complete action trace agrees but a displayed score differs, recompute the score from the referee result. If the trace stops before completion, do not reason backward from a guessed winner.

The CLI's `verify` command checks recorded evidence; run `node cli.mjs help` for its required file argument and supported verification modes. Read whether a report verifies the action trajectory or also reruns the policy. Those are the distinct claims from lesson 1.2.

This is why the supplied runner owns records and transitions while you own strategy. It keeps a policy's claim separate from the evidence used to judge that claim. A policy cannot make itself a winner by returning `{winner: 0}`. Your function returns an action ID; the referee determines what happens next.

Commit **item `1.3-p3`:** A dashboard says “player 0 won,” but replaying its recorded legal actions ends with player 1 reaching the target row. Which evidence should decide the official result? Identify the first two things you would compare before changing either policy.

## Complete the first cumulative artifact

Your module artifact is a small legal, reproducible policy in `learner/baseline.mjs`, plus written reasoning that distinguishes strategy from execution failure. Run:

```sh
node cli.mjs check 1
node cli.mjs history
```

Read failures by requirement. Repair a legal-action problem with the contract in lesson 1.1; repair a changing decision with the frozen inputs in lesson 1.2. A passing check is engineering evidence for those finite behaviors. Your explanations remain self-assessed practice until reviewed separately. Neither result says the policy is strong.

**Item `1.3-transfer`:** A developer removes every record with a nonzero error count before ranking policies. One policy has many illegal-action forfeits; another has no forfeits but loses strategically. Explain how this filter can reverse the apparent ranking, and state which records or counts the report must retain.

Commit your answer, inspect feedback, and make a new attempt after any repair. Do not replace an inconvenient first answer. Continue to module 2 when your baseline passes its checks and you can trace a reported loss to either a legal game outcome, a policy-contract violation, or a genuinely unresolved execution problem.
