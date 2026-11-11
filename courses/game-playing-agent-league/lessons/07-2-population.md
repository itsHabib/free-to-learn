# 7.2 Choose a population rather than one lucky winner

Your highest-scoring policy loses consistently to an older opponent that the training loop nearly discarded. Choose a retained population and a deployment distribution using the opponents and evidence you actually have.

## A policy's score depends on who it meets

An average score is an expectation under an opponent distribution. Changing that distribution can change the ordering of policies. If a league contains many copies of an easy opponent, a specialist against that opponent may look impressive. Its score does not establish robustness against a different pool.

Begin with the pairwise payoff matrix. Each entry states how one frozen policy performs against another under the same scenario and seat schedule. Missing entries remain missing. They are not draws. Look for large weaknesses, not just the row with the largest average. If the confidence intervals are broad, distinguish an apparent advantage from a supported one.

As a worked comparison, imagine two candidates. Candidate A scores well against the most frequent training opponents but has a large loss against a rare archived one. Candidate B is slightly worse against the frequent opponents and much better against the rare one. Under the current frequency weighting, A can have the larger average. Under a policy that protects against the worst measured matchup, B can be preferable. Neither conclusion is meaningful until the selection objective is stated.

**Commit:** item `7.2-p1` asks which information is missing from a claim that one candidate is simply “better.” State the objective and evidence you would need, then inspect feedback.

**Practice 7.2-p1:** Policy A has the higher mean score while policy B has the better worst measured matchup. What is missing from the statement that A is better?

## Retaining a policy can have experimental value

An archived policy can be useful even when it is not selected for deployment. It can expose a weakness in newer policies. Removing it from active training may save computation, but removing its records destroys evidence about forgetting. Keep the immutable snapshot and its results even when its active sampling weight becomes zero.

Retention therefore has two decisions: what remains in the archive, and what receives current training probability. The supplied host retains history. You choose active opponents and weights. A fixed budget forces tradeoffs: spreading samples over more policies improves coverage but leaves fewer samples per matchup. Repeatedly sampling only the newest rival can produce fast local improvement and miss older failures.

Use your earlier sampler and admission rule. Compare the candidate against the same frozen evaluation pool used for its predecessor. If a new policy improves one family and harms another, preserve both facts. A defensible admission rule can retain the candidate for its complementary behavior while keeping the predecessor. It need not pretend that every accepted policy dominates all earlier ones.

**Apply it:** commit item `7.2-p2` about retaining a losing historical policy before revealing the answer.

**Practice 7.2-p2:** An old policy loses to most of the pool but exposes a reproducible weakness in the newest candidate. Give a defensible reason to retain it.

## A mixture has precise semantics

In this course, a mixture chooses one frozen policy at the start of each game and uses it throughout that game. The choice is private to that side. This produces a distribution over complete policies. Choosing a different policy at every move is a different strategy: moves that make sense as part of one plan may interact badly with another policy's continuation.

A matrix-distribution helper may suggest mixture weights. Inspect its reported restricted gap, numerical tolerance and iteration budget. An optimizer stopping is not a certificate of exact equilibrium. More importantly, even an exact solution of the measured policy matrix protects only against the strategies represented by that matrix. A new opponent can still expose a weakness.

Uniform weights are a useful baseline, not a universal solution. A nonuniform distribution is acceptable when you state what it optimizes and evaluate the actual resulting policy-selection procedure. Keep its random seed and weights with the deployment snapshot. Avoid choosing weights after seeing the final test results and then reporting those same results as independent confirmation.

**Transfer:** item `7.2-p3` compares per-game and per-move switching. Explain why the old matrix cannot automatically certify the new behavior.

**Practice 7.2-p3:** You evaluated a mixture that chooses one policy per game. You now choose a fresh policy each move using the same weights. Does the old payoff matrix certify the new policy?

## Your deliverable

Retain six distinct policy roles and state which ones receive training and deployment weight. Explain one inclusion and one exclusion or reduced weight using observed matchups. Compare your choice with uniform historical sampling under equal budgets. A negative or inconclusive comparison is allowed; the artifact must still contain a valid distribution, complete evaluation and honest interpretation.
