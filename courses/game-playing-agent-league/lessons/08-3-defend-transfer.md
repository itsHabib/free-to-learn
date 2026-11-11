# 8.3 Defend what transferred and what did not

Your adapted policy wins more often under the patch but regresses on ordinary play. Defend a conclusion that preserves both results and the limits of the experiment.

## Compare the prediction with the actual mechanism

Retrieve your pre-patch prediction without rewriting it. Identify the assumptions that survived, the ones that failed and the evidence supporting each judgment. If you predicted a search bug but the real problem was a value feature, explain the distinction. A revised mental model is useful evidence of learning; a retroactively perfect prediction is not.

Use a causal explanation proportional to the evidence. If changing one cache key fixes the minimal witness and several fresh structurally similar positions, that supports the cache hypothesis. It does not prove that every remaining loss has the same cause. If you changed search, features and training budget at once, the result describes that combined configuration. An ablation is needed to separate their contributions.

**Commit:** item `8.3-p1` asks you to explain a mismatch between the original prediction and the observed repair. Include one observation that would weaken your new explanation.

**Practice 8.3-p1:** Your prediction blamed turn alternation, but fixing an omitted state counter repairs the witness. How should the final report handle the original prediction?

## The report needs a complete comparison

Show the old and adapted configurations on ordinary and changed rules. Name the opponent pool, scenario set, seeds, budgets and unresolved failures for each cell. Do not omit ordinary-rule regression because the headline concerns adaptation. A deployment decision can legitimately prefer the adapted policy for the new rules while keeping the earlier one for the old rules.

As a worked decision, imagine an adaptation that fixes every issued conformance case but has an uncertain tournament difference. You can conclude that it satisfies those contract cases. You cannot conclude that it improves average playing strength if the comparison is too noisy. Conversely, a high observed win rate does not excuse an illegal action in a contract case. Correctness and empirical performance answer different questions.

If there are too few independent scenarios or training replicas to distinguish candidates, say so. A wider honest interval is more useful than a narrow one obtained by counting correlated moves as independent evidence. Keep the finite-roster average visible even when you cannot generalize confidently beyond it.

**Apply it:** commit item `8.3-p2` about an adaptation with new-rule gains and ordinary-rule losses. State a deployment recommendation with its domain.

**Practice 8.3-p2:** The adapted policy improves under the new rule and regresses under the old rule. Give a scoped deployment recommendation.

## Explain the response boundary

The capstone should include an attempt to find a counter-strategy. Report the responder family, computation and observed outcome. An exact tiny-game best response supports a statement about that tiny game. An approximate responder against the actual league supports a statement about the tested search, not universal robustness.

If a new opponent breaks the adapted policy, retain the loss and consider whether it changes the recommended population. The purpose of the league is to reveal weaknesses as well as improvements. A course that ends with every failed experiment removed would teach the wrong habit.

A separately issued held-out assessment is evidence about your performance on that instance. It is not a guarantee of transfer to every game, every rule change or every future adversary. Keep assistance and prior exposure visible. The report's confidence should grow with independent evidence, not with the amount of code written.

**Transfer:** item `8.3-p3` asks you to distinguish an exact tiny-game result, a finite empirical season and an unbounded claim of robustness. Give each the correct scope.

**Practice 8.3-p3:** Separate these claims: exact zero gap in an enumerated tiny game; no exploit found in a six-policy season; no adversary can ever beat the agent. Which are supported by their stated evidence?

## Final evidence package

Export your first prediction, original and revised work, all assistance records, rule identities, before/after plans, raw matches, coverage, numerical summaries and selected replays. The package should let a reviewer reconstruct the decisions rather than rely on your summary alone.

The full course is accepted only after the complete learner flow and independent assessment are verified. Its eventual publication is a separate operational step: a local package is not a live Free to Learn course. Your own capstone is complete when it satisfies the issued rubric with reproducible evidence, whether the final recommendation is one champion, a mixture or a carefully bounded inconclusive result.
