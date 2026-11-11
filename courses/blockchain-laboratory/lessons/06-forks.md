# 06 · Two honest histories

Two nodes accept different valid branches during a partition. Implement a shared ordering rule and state exactly what agreement after delivery does—and does not—establish.

Your artifact is `chooseHead`. It receives validated records only. You do not validate advertised headers inside a sorting function; module 05 establishes the precondition.

## Agreement needs a shared total order

Consider two observations. Node X receives valid height-2 branch F, then valid height-2 branch A. Node Y receives A, then F. If each keeps the first arrival, they remain split despite possessing identical evidence. If each chooses the smaller ID on equal height, they converge after both messages arrive.

Our order is greatest height, then lexicographically smallest ID. Worked example: candidates (height 2, ID c), (height 3, ID f), (height 3, ID a) select a. Height dominates ID; the tie rule only applies at equal height. The input list must not be sorted in place because other code may retain its order.

Complete the comparator: when heights differ, prefer the larger. When they match, use explicit string comparison. Neither current wall-clock time nor local arrival position belongs in this protocol order.

{{practice:06a}}

## Convergence is conditional; finality is stronger

Now compare two more observations. A finite set of valid records eventually reaches every honest node: all compute the same maximum, so they converge. A sender keeps generating longer valid branches, or some messages are delayed forever: the assumptions of that convergence argument no longer hold. A shared sorting rule does not cause missing information to arrive or limit an adversary's proposals.

Even when all nodes select one head now, a longer competing branch can arrive later. This rule permits reorganization. It supplies no irreversible finality and no economic or computational cost for building length. Calling it “longest chain” must not smuggle in assumptions from proof-of-work systems. The lab has no mining or stake, and is not a security design for an open network.

Safety means a prohibited outcome never occurs under declared assumptions. Liveness means a required outcome eventually occurs under declared assumptions. “All nodes eventually select the same tip after this finite schedule is fully delivered” is a modest convergence property. “A certified value at a fixed height cannot conflict with another certified value” will be a different safety property in the next module.

{{practice:06b}}

## Checkpoint and changed case

Implement and run `node lab.mjs check 06`. Keep a written counterexample to the statement “the selected transaction is final.” You need only a valid later branch that wins the ordering rule.

For a changed case, two nodes have identical validated records but different local mempools. Predict whether head selection differs. Then let one node miss a single height-4 record. Explain why a temporary disagreement no longer demonstrates a comparator bug. Distinguish different computations over the same input from the same computation over different input.
