# 8.1 Freeze a prediction before the patch

Your league is about to receive a rule change, and you want to know whether its design transfers. Commit a prediction and evaluation plan before learning the exact change.

## Prediction creates a comparison with your earlier understanding

A useful prediction names an assumption and a consequence. “Something might break” cannot distinguish insight from hindsight. “My search asks the game for the current player at every node, so I expect it to preserve the backup rule if turn order changes” can be checked. It also identifies a possible failure: a cache that stores values under the wrong perspective might still break even when the main recursion is correct.

Your prediction is not a scored guess of a secret answer. It records what your current model of the system implies. If it is wrong, retain it and explain why. Editing the prediction after seeing the patch removes the evidence of that change in understanding.

As a worked example from another domain, a route planner assumes all edges have nonnegative cost. A new discount can introduce a negative edge. Before seeing the map, the author predicts that a greedy shortest-path implementation may fail and names the condition needed by its proof. The value lies in connecting the algorithm's premise to its behavior, not in guessing the exact discounted road.

**Commit:** item `8.1-p1` asks for a testable transfer prediction about a game-playing assumption. Save it before reading feedback or a challenge specification.

**Practice 8.1-p1:** Write a testable prediction about one assumption your current search or value model makes. Name an observation that would show the prediction was wrong.

## Freeze the experiment as well as the prose

Save the old policy source and parameters, ordinary-game results, responder configuration, training budget and evaluation plan. Do not overwrite the champion in place. A before/after comparison needs a real before artifact.

The plan should separate adaptation from evaluation. Allocate the same allowed simulation credits to the methods being compared. Name the ordinary-rule checks you will rerun as well as the new-rule checks. Otherwise an adaptation that handles the patch by breaking ordinary play could be called an unqualified improvement.

Decide how you will treat an incomplete adaptation run. A host interruption is not a loss. An illegal policy action is a policy failure under the declared contract. Preserve those distinctions, as in the earlier season. They do not disappear because this is the capstone.

**Apply it:** commit item `8.1-p2` about an old checkpoint overwritten by the adaptation process. Identify what evidence was lost and what can still be recovered honestly.

**Practice 8.1-p2:** You overwrote the old champion parameters while adapting. Why is this a problem, and what can you honestly do now?

## A practice patch is not a held-out assessment

The local course can ship practice variants and worked examples. Because their files are available, they are not secret assessment items. The independently administered capstone uses a new instance issued separately from the public package. Its exact rule, starting positions and scoring controls should not have appeared in your worked examples.

The game provider supplies the changed simulator and its written rules. You are not expected to guess hidden rules or implement a new engine. Your work is to reason about the changed assumptions and adapt the policy, learned representation or experiment where needed.

If you have already seen the challenge's private controls or reference answer, label that attempt assisted and use a fresh independently issued instance for a claim of unassisted transfer. Do not hide prior exposure. That record helps distinguish a learning exercise from measurement.

**Transfer:** item `8.1-p3` asks whether a new seed for a publicly disclosed worked patch automatically creates a held-out test. Explain which novelty matters.

**Practice 8.1-p3:** A learner has read a worked solution to a public rule patch. They rerun it with a new random seed. Is this automatically an unassisted held-out transfer assessment?

## Your before artifact

Export the prediction, old snapshots and plan. Record assistance used in reaching the prediction. Then stop changing the before artifact. When the challenge arrives, keep the provider's rule version and challenge identity with your new work. The final lesson compares your prediction with the actual failure or success; it does not erase the first answer.
