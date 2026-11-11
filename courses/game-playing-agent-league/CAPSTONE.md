# Build a league you can defend

Your final product is a small population of game-playing policies and an evidence packet that lets another person reproduce the comparison. A policy that loses honestly can satisfy a learning objective. An impressive win rate from an invalid comparison cannot.

The game, seeded runtime, immutable snapshots, replay records, worker cancellation, file formats and reader are supplied. You build the baseline decision, position evaluation, bounded search, learned features and fitting, report, opponent sampler, counterpolicy and finite-game gap calculation. You also make the experimental decisions and explain what the results support.

## The population

Keep six named roles: supplied random baseline, supplied greedy baseline, your hand-evaluated search, your learned-value search, an earlier learned snapshot, and your counterpolicy. Up to two additional policies are allowed. A new display name alone does not make a different policy. Explain the actual behavioral difference and preserve the source, parameters and lineage of each snapshot.

The supplied counterpolicy adapter can model either the known greedy policy or uniform legal-action choice. Your `responsePolicy` performs the search against that declared distribution. It does not receive secret access to an opponent's source or future random draws. Evaluate the response against its intended target, then show what happens against other members of the population. A specialized response may expose a weakness and still be a poor general competitor.

Use the earlier modules to build this population cumulatively. `roster` supplies the configuration plumbing; it does not establish that the roles were implemented correctly or that two parameter vectors produce different decisions.

## Separate development, selection and final evaluation

Start with the small development files. Run checks, inspect failures and change policies freely there. Save the first broken implementation and the repair; the local journal does this for code checks and practice responses.

Before your final season, write a short plan containing:

- the policy identities and parameter settings;
- your intended opponent distribution and the question being answered;
- the scenario-generation procedure, seeds and grouping rule;
- which scenarios and outcomes have already influenced development or selection;
- the common decision budget and the recorded total training computation;
- the paired-seat and policy-randomness schedule;
- the summary, uncertainty procedure and decision rule you intend to use;
- what result would change your current belief.

For the bounded course final, use 16 distinct scenario groups, both seat assignments and two declared policy-randomness seeds for every unordered policy pair. The decision budget is 256 hypothetical transitions per move. Six policies produce `15 × 16 × 2 × 2 = 960` scheduled games; eight produce 1,792. All planned slots must be accounted for. Host interruption is an incomplete experiment. A recorded policy forfeit is reported as such, alongside game outcomes.

The loader rejects repeated or horizontally reflected starting positions within a roster. You must also compare groups across training, development, selection and final rosters. Different seed numbers alone do not prove that the resulting starting positions are different. Internal positions can still recur; state the actual separation you established rather than calling every transition unseen.

Once final results have influenced your choices, that roster is selection evidence. Preserve it and collect fresh final evidence if you want a new confirmatory comparison. Do not relabel the old run.

## Build the report from the records

Your report must show the payoff matrix, declared denominators, failures, actual simulation credits and uncertainty based on scenario blocks. The two seat assignments and repeated policy seeds belonging to one starting scenario stay together when resampled. Show the number of independent groups; a larger number of bootstrap resamples is not a larger experiment.

The course uses an approximate 95% paired scenario-block percentile interval with a stated resampling seed and 2,000 resamples. Its interpretation depends on the sampling model and independence of groups. If the small sample or scenario construction does not justify a strong population claim, say so. Avoid presenting a conditional checkpoint comparison as evidence about all possible training runs.

If you claim one training method is better than another, repeat each method with at least five independently declared training seeds under matched resources. Treat those runs as training replicates, separate from scenario blocks. A single trained checkpoint can support a narrower statement about that checkpoint. It cannot estimate variability across training.

Describe at least one cross-play relationship that a single scalar ranking hides. You do not need to manufacture a cycle in the real game. If the tested population is transitive, report that observation and use the separate finite matrix exercise to demonstrate that you understand nontransitivity.

For exploitability, keep two kinds of evidence separate. The tiny supplied finite game can support an exact gap calculation within its complete matrix/tree. A bounded response search in the main game only measures the vulnerability discovered by that search and budget. Failure to find a response is not a proof that none exists.

## Explain one result in detail

Choose a position where two policies make different decisions. Include the exact starting state, actor, legal actions, source identities, depth/budget and relevant replay. Explain how a backed-up value or opponent model changes the selected move. Show one failure or limitation as well as any improvement.

This explanation should be checkable against the trace. “The model learned a better strategy” is not enough by itself. Name the feature or estimate, the reply it changes, and the observed consequence. If the learned model is weaker, explain the evidence without rewriting the question after seeing the outcome.

## Submit a reproducible packet

Include your frozen learner source, configuration files, fitted model/training artifacts, raw season, learner report, journal export and written interpretation. Preserve all hashes recorded in those artifacts. State the Node version and platform used. Record commands in the order a reviewer can actually run them from the extracted package.

Use `verify` for trajectory replay and `verify --configuration` for re-execution of the declared policies. A successful trajectory check alone does not prove that the recorded policy chose those actions. A source change after a successful check invalidates the claim that the current source was checked; rerun and retain the earlier result as history.

The package supports direct `.mjs` policy files in `lib/` and `learner/`. Keep policy dependencies inside the captured package and use the supplied randomness and simulation oracle. Outside files, dynamic external imports, wall-clock decisions, network calls and direct engine transitions are outside this experiment's reproducibility contract. The local worker is a cancellation mechanism, not a hostile-code service.

## The independent transfer stage

Before receiving the administered challenge, freeze your source and write a falsifiable prediction about which parts of your policy and evaluation would survive an unfamiliar rule or information change. Retain that prediction even if it is wrong.

The instructor supplies the separate challenge after this freeze. Its contract and private control set are not in the learner delivery. Apply the same resource limits, preserve the first attempt, and distinguish assistance from independent repair. Explain which assumption failed and why your repair is general within the new contract. If no code change is needed, establish that with evidence; cosmetic edits earn no credit.

After the challenge is revealed, it is revision material. A second independent transfer assessment requires a fresh challenge. The journal is a useful local history, not an authenticated credential or proof of independent work.

## Review boundaries

Software checks establish finite behavior: legal actions, accounting, data identities, numerical fixtures and tested repairs. A separate reviewer evaluates your experimental reasoning and the match between claims and evidence. A fresh learner attempt evaluates whether the course actually teaches these skills. Publication and a verified live learner flow are separate course-release requirements; this local package does not claim them.
