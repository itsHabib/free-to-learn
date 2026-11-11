# 7.3 Audit the evidence behind the headline

A report says the league has become harder to exploit, but its newer run used more search and omitted two failed games. Audit the evidence before accepting the headline.

## Start with the claim's subject

“This frozen policy scored higher on these sixteen scenarios” is a different claim from “this training method produces stronger policies.” The first concerns one set of code and parameters. The second concerns a distribution over training runs. Replaying many games from one trained policy does not create independent training runs.

Name the subject, comparison and domain. Include the game/rule version, opponent pool, scenario-generation process, training replicas, evaluation replicas and compute budget. The final report can be concise because those details live in linked manifests. It cannot omit them from the evidence entirely.

As a worked audit, consider a new checkpoint compared with an older checkpoint at the same rules and scenario roster. The new checkpoint receives twice as many simulation calls per decision. A higher score supports a comparison between those two deployed configurations. It does not isolate the contribution of training. To investigate learning, compare them at a matched budget or report the combined configuration change explicitly.

**Commit:** item `7.3-p1` asks you to rewrite an overbroad result into a claim the supplied evidence can support.

**Practice 7.3-p1:** One trained checkpoint beats its predecessor on a fixed roster, but used twice the search budget. Rewrite the claim without attributing the gain to learning alone.

## Check identity, coverage and independence

First verify identity. The policy source, parameter file and rule hashes in the report must match the executed records. Second verify coverage. Every expected game has one qualified result or a visible unresolved failure. Third inspect independence and selection. Did the reported final scenarios influence feature choice, training duration, opponent weights or checkpoint selection?

If they did, the run is useful exploratory evidence. It is no longer untouched confirmation of the final choice. Preserve it, label it and use a fresh confirmation set for a new confirmatory claim. Rewriting filenames or reseeding the same disclosed tiny roster does not necessarily create a genuinely new test.

The same care applies to intervals. Show the resampling unit and count. Correlated moves are not independent samples. A narrow interval produced by resampling thousands of moves from a few games can be very precise about the wrong experiment. Repeatedly checking an ordinary interval and stopping when it looks favorable also changes its interpretation.

**Apply it:** commit item `7.3-p2` about a final set used to choose between three model variants. Then compare your disposition with the feedback.

**Practice 7.3-p2:** You chose the best of three feature variants after looking at final-test scores. How should those scores now be labeled, and what would confirmation require?

## Search for a reason your interpretation could fail

An audit is stronger when it contains a counterexample. Inspect the policy's worst measured matchup, a failed or low-performing training run, and a scenario where the apparent improvement reverses. Ask whether the mechanism in your explanation predicts these cases too.

If you claim lower exploitability, identify the responder family and its search/training budget. A responder finding no profitable deviation does not prove that none exists. For a tiny game you can enumerate, exact best-response evidence can support an exact gap. For the larger league, your result normally remains empirical vulnerability to tested responders.

Include a valid alternative explanation. Perhaps a value model improved tactical ordering rather than its numerical accuracy. Perhaps a population helped because it retained a particular counter, not because more opponents are always better. An ablation can distinguish these explanations. If it was not run, record the uncertainty rather than inventing a mechanism from the outcome alone.

**Transfer:** item `7.3-p3` asks what to report when the counter-policy fails to find a win. The correct level of confidence depends on what was searched, not on the desired story.

**Practice 7.3-p3:** A responder searched for ten minutes and found no winning policy. Is the champion unexploitable? State a defensible conclusion.

## Evidence to retain

Keep your frozen plan, source and parameter identities, complete match roster, failures, interval configuration, first report and revised report. Link at least one replay supporting your diagnosis. Have another person or a fresh process rerun from those artifacts without relying on your working directory's unnamed current files.

Passing the audit means your claims match your evidence. It does not mean your policy must win, that your method is universally best, or that the course has proved a learning effect.
