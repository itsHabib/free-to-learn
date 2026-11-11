# 8.1 Freeze a prediction before the patch

Your league is about to receive a rule change, and you want to know whether its design transfers. Commit a prediction and evaluation plan before learning the exact change.

## Prediction creates a comparison with your earlier understanding

A useful prediction names an assumption and a consequence. “Something might break” cannot distinguish insight from hindsight. “My route planner's proof needs every edge cost to be nonnegative, so I expect its greedy search can return a wrong route once a change makes an edge negative” can be checked. It also names what would show it wrong: the greedy route still matching an exhaustive search on every test map built around a negative edge. The worked example below develops this case.

Your prediction is not a scored guess of a secret answer. It records what your current model of the system implies. If it is wrong, retain it and explain why. Editing the prediction after seeing the patch removes the evidence of that change in understanding.

As a worked example from another domain, a route planner assumes all edges have nonnegative cost. A new discount can introduce a negative edge. Before seeing the map, the author predicts that a greedy shortest-path implementation may fail and names the condition needed by its proof. The value lies in connecting the algorithm's premise to its behavior, not in guessing the exact discounted road.

**Commit:** item `8.1-p1` asks for a testable transfer prediction about an assumption your own agent makes. Save it before you open lesson 8.2, this item's feedback or any challenge text. Navigation is open, so keeping this order is your own discipline. The item also asks you to declare what you had read before predicting. If you have already read 8.2, say so: that is an exposure record, not a fault, and the prediction then counts as assisted practice.

**Practice 8.1-p1:** Write a testable prediction about one assumption your current search or value model makes. Name the consequence you expect and an observation that would show the prediction was wrong. Then declare what you had read before predicting: lesson 8.2, this item's feedback, or any rule-change or challenge text.

## Freeze the experiment as well as the prose

Save the old policy source and parameters, ordinary-game results, responder configuration, training budget and evaluation plan. Do not overwrite the champion in place. A before/after comparison needs a real before artifact.

The plan should separate adaptation from evaluation. Allocate the same allowed simulation credits to the methods being compared. Name the ordinary-rule checks you will rerun as well as the new-rule checks. Otherwise an adaptation that handles the patch by breaking ordinary play could be called an unqualified improvement.

Decide how you will treat an incomplete adaptation run. A host interruption is not a loss. An illegal policy action is a policy failure under the declared contract. Preserve those distinctions, as in the earlier season. They do not disappear because this is the capstone.

**Apply it:** commit item `8.1-p2` about an old checkpoint overwritten by the adaptation process. Identify what evidence was lost and what can still be recovered honestly.

**Practice 8.1-p2:** You overwrote the old champion parameters while adapting. Why is this a problem, and what can you honestly do now?

## A practice patch is not a held-out assessment

This package ships worked examples and analysis items. It ships no patched game simulator and no runnable practice patch. The rule change discussed in lesson 8.2 is hypothetical, and because every learner can read it, it is not a secret assessment item. The independently administered capstone uses a new instance issued separately from the public package. Its exact rule, starting positions and scoring controls should not have appeared in your worked examples.

For that separately issued challenge, the instructor supplies the changed simulator and its written rules. You are not expected to guess hidden rules or implement a new engine. Your work is to reason about the changed assumptions and adapt the policy, learned representation or experiment where needed.

If you have already seen the challenge's private controls or reference answer, label that attempt assisted and use a fresh independently issued instance for a claim of unassisted transfer. Do not hide prior exposure. That record helps distinguish a learning exercise from measurement.

**Transfer:** item `8.1-p3` asks whether a new seed for a publicly disclosed worked patch automatically creates a held-out test, and which kind of novelty would matter.

**Practice 8.1-p3:** A learner has read a worked solution to a public rule patch. They rerun it with a new random seed. Is this automatically an unassisted held-out transfer assessment? Which kind of novelty would matter?

## Your before artifact

Export the prediction, old snapshots and plan. Record assistance used in reaching the prediction. Then stop changing the before artifact. When the challenge arrives, keep the instructor's rule version and challenge identity with your new work. The final lesson compares your prediction with the actual failure or success; it does not erase the first answer.

## What you can complete now, and where to stop

All nine analysis items in this module, `8.1-p1` to `8.3-p3`, can be completed now. They ask for reasoning about worked examples and hypothetical cases, and none of them needs a patched simulator. Commit `8.1-p1` first, then work through lessons 8.2 and 8.3.

When the nine items are committed, freeze and export the before artifact as described above, if you have not already. Then stop executable work. Do not write a rule patch, a second engine or a stand-in for the challenge. Executable adaptation starts only when an instructor supplies a versioned challenge: the rules, the simulator, conformance examples, the challenge identity, and the budget and evaluation instructions.
