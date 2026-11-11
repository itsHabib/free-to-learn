# 2.3 Use deeper search without changing the experiment

Your revised policy wins more often after you add pruning and raise its budget fourfold. The result is real, but it does not tell you which change helped. In this lesson you will compare search changes under matched conditions and preserve a defensible result when deeper search runs out of work.

You need lesson 2.2 and the distinction between a code change and an experiment change. Allow approximately 5–7 minutes of reading and 35–60 minutes of coding and comparison; these are targets awaiting trials.

## Count work, not the label on the algorithm

A depth limit and a compute budget answer different questions. The depth limit restricts how many transitions a branch may contain. The budget restricts the total number of simulated transitions across the whole decision. Two searches with the same depth can use very different numbers of transitions because positions have different legal actions or because one algorithm prunes branches.

For a worked tree with branching factor three, a complete depth-one expansion uses three transitions. Extending every branch one more edge adds nine, for 12 in total. Extending to depth three adds another 27, for 39. These numbers count edges actually simulated, including the root's outgoing edges. A large depth setting does not promise that the budget can complete that tree.

Commit **item `2.3-p1`:** In a full tree with two actions at every nonterminal node, how many simulated transitions are required to complete depth three from the root? Can a budget of ten complete that expansion? Explain your counting unit.

```sh
node cli.mjs attempt 2.3-p1 --answer 'Transition count; budget decision; counting unit'
node cli.mjs feedback 2.3-p1
```

## Keep a completed answer while looking deeper

Iterative deepening runs a shallow search, retains its completed result, then attempts a deeper one. If the new iteration finishes, its result replaces the earlier result. If it cannot finish under the remaining credits, the previous complete result remains available. The repeated shallow work has a cost; it buys a well-defined answer at interruption points.

For example, a policy completes depth one, then depth two, and begins depth three. When the credit limit is reached during the third iteration, it should not silently label a partially explored move as a depth-three optimum. It can return the depth-two result and report the completed depth honestly. That choice may be weaker than an unlimited search, but it is a comprehensible bounded policy.

Other safe partial-search schemes are possible. The requirement is not “use this exact loop.” It is to preserve the meaning of the returned result, respect the budget, and avoid treating a missing hostile reply as evidence of safety. All work through the supplied oracle counts, including repeated expansions between iterations.

Commit **item `2.3-p2`:** A policy completed depth two and selected move C. Its depth-three iteration saw a promising move D before exhausting its credits halfway through D's opponent replies. What result can it safely describe as a completed search result, and which claim about D remains unsupported?

## Pruning changes the work, not perfect minimax's answer

Alpha-beta pruning avoids exploring branches that cannot change the minimax choice given bounds already established elsewhere. The bounds describe what the maximizing player can already guarantee and what the minimizing player can already enforce. A cutoff is justified by those bounds—not by a branch merely looking unattractive.

Consider a root maximizing player with one completed option worth `0.3`. In another option, the minimizing opponent already has a reply worth `0.1`. Any further reply can only leave that option at `0.1` or make it worse for the root. That option cannot beat `0.3`, so its remaining replies need not be evaluated to choose the root action. This is a proof about the current search tree, not a heuristic prediction that all remaining moves look similar.

Move ordering can make useful bounds appear earlier and therefore reduce work. With enough resources to complete the same finite-depth search, correct pruning preserves its value and set of optimal moves. Under a tight budget, ordering can change how much is completed and thus the chosen action. Record the tie rule and ordering when reproducing a bounded result.

Commit **item `2.3-p3`:** A maximizing root already has a completed option worth `0.4`. In a second option, its minimizing opponent has an inspected reply worth `0.2`. Does exploring more replies allow that second option's minimax value to become greater than `0.4`? Explain whether a cutoff is justified.

## Compare one change at a time

To test an ordering or pruning change, hold fixed the rules, starting states, sides, evaluator, random seeds, maximum transition budget and result definition. Record actual credits as well as outcomes. If two algorithms return equally good moves but one uses fewer credits, that is useful evidence even when the win rate does not change.

To test a larger budget, change the budget deliberately and describe that as a compute comparison. Do not attribute its gain solely to a new heuristic. Retain both source/parameter identities and the exact plan. A result on a selected tactical set establishes behavior on that set; broader claims will need the paired tournament and uncertainty work in module 4.

Complete `learner/search.mjs`, then run `node cli.mjs check 2`. Your module artifact includes the evaluator, legal budgeted search, one retained failure/repaired explanation, and a comparison plan. A passing check does not require alpha-beta if a correct unpruned search meets the finite contract. Extra sophistication earns no credit when the underlying value or budget handling is wrong.

**Item `2.3-transfer`:** Version A searches with a hand-built evaluator and 256 credits. Version B uses a new evaluator, a different move order and 1,024 credits, then wins more games on newly chosen positions. Propose the smallest set of matched comparisons that can separate evaluator, ordering and compute effects. State which claim the original comparison cannot support.

Commit this plan before feedback. Use the hint ladder only after recording your reasoning, and label assisted revisions honestly. You now have the agent substrate for later learning: a policy whose score meaning, adversarial backup, resource use and comparison conditions can be inspected rather than guessed.
