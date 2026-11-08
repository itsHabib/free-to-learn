# M7: Evaluate what your signals can support

Implementation reference for **M7: evaluation**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

A courier can press pickup too early, retry a request, or use automation that sends only legal commands. Build an advisory classifier and a case-level evaluation that makes those differences and its blind spots visible.

This module uses the server authority from M1–M4 and complete replay windows from M6. A **case** is one scripted run for one actor. A **signal** is a denied interaction reconstructed from authoritative replay state, rather than a claim sent by the client. The supplied corpus contains fourteen synthetic cases; it contains no observations of human participants.

From the reference project run `npm run core:prepare -- evaluation`. In the printed workspace, fill the required answers or explicit skip reasons in `predictions.json`, edit `evaluation/policy.mjs`, keep explanations in `response.md`, and run `npm run core:check -- --assistance "none"`, replacing `none` with the help you used. The checker saves your exact source and response for each attempt. Reference solutions and calibration controls are author material; record consulting them as assistance.

## The contract

Export two functions. `classify(signals, settings)` returns a Boolean. `evaluate(cases, settings)` returns exactly `{decisions,metrics}`. Keep both functions independent of file, clock and network operations. Inputs are already validated; your job is the policy and arithmetic. Do not mutate them.

Each signal is `{tick,reason,distanceSquared}`. Ticks are nonnegative integers in nondecreasing order; equal ticks are allowed. Reasons are `range` or `cooldown`, and squared distances are finite and nonnegative. Settings are `{threshold,windowTicks,minDistanceMm}`: positive integer threshold and window, and a finite nonnegative minimum distance. A larger threshold requires more eligible observations; it does not change which observations are eligible.

Each case is `{id,label,signals}` with a unique ID and a Boolean label. The returned decisions preserve that order as `{id,flagged}`. Metrics have exactly these fields: `{total,tp,fp,tn,fn,precision,recall,falsePositiveRate}`. A flag is a request for further review, never an instruction to ban a player.

Before editing, save your explanations of the function inputs and output shapes in `response.md`. Then use the first checker result to identify a specific mismatch, rather than replacing your original explanation.

## Eligible observations

A signal counts only if `reason === 'range'` and `distanceSquared > minDistanceMm ** 2`. The strict comparison matters: with a 500 mm minimum, a denial at exactly 500 mm is ineligible. A denial at 750 mm is eligible because `750² > 500²`. Do not compare a squared distance directly with a distance in millimetres.

Cooldown means an interaction was attempted too soon after a successful action. Re-pressing pickup may produce cooldown denials while the courier is far from its next target. Distance alone does not turn those into eligible range denials. The extractor supplies both kinds so your policy must make this distinction.

Practice before your first check: for a 600 mm minimum, consider a range denial with squared distance 360,000, a cooldown denial with squared distance 1,000,000, and a range denial with squared distance 490,000. Record which can count and why. After checking your code, compare your saved prediction with the released answers and reasons. Use the criterion feedback to repair your comparison or reason filter, then answer the fresh variant without replacing your first prediction.

## Window boundaries

For each possible latest tick, the interval is `(latest-windowTicks, latest]`. The left edge is excluded; the right edge is included. With a four-tick window ending at tick 9, ticks 6, 7, 8 and 9 can count. Tick 5 cannot. If eligible observations occur at ticks 6 and 9 and the threshold is two, that interval flags.

You are asking whether **any** interval qualifies. A burst that qualified earlier still makes `classify` return true when later signals are quiet or ineligible. One implementation can retain eligible ticks, remove every tick at or before the current left edge, and check the remaining count. Another can count each candidate window directly. The engine normally consumes one interaction per actor per tick; the policy contract still counts each supplied observation, including equal-tick entries.

Practice: with threshold two and a seven-tick window, predict the result for eligible ticks 12 and 19, then for 13 and 19. Add an ineligible cooldown at tick 80 to the second case. Explain whether that changes the answer. Save those predictions before the checker. Compare them with the post-check answers, then use its boundary feedback to explain any repair and answer the fresh variant.

## Labels are not features

A **synthetic label** is the author's description of the behavior being evaluated. Here, true denotes the repeated-distant-invalid script. False denotes a script without that repeated-invalid behavior, including legal automation. A separate `declaredAutomation` field describes how the author wrote the script. That metadata is not a violation label and never reaches the policy. None of these names establish that recorded behavior came from a human.

`classify` receives only signals and settings. First generate predictions for all cases. Then compare predictions with labels to score them. Do not infer a prediction from the label, case ID, family name, record, or split. Otherwise you evaluate access to the answer instead of the signal rule.

The honest-delivery and valid-automation twins execute identical legal commands. Their records and signals match; both have a negative violation label, while their `declaredAutomation` metadata differs. Any deterministic function of these signals and the same settings must give both the same prediction. Calling both legal is correct for this violation detector, but it cannot establish which used automation. The report shows this separately as `indistinguishablePair`, rather than counting legal automation as a missed violation. The lack of a denial is not proof of unmodified client execution.

Practice: write one additional observation you would need to distinguish intent, and explain whether it could actually establish intent or would introduce another uncertain proxy. Do not add collection of device identifiers or third-party data to this local exercise.

## One case one vote

The **confusion matrix** counts predictions against labels:

| | Positive label (`true`) | Negative label (`false`) |
| --- | --- | --- |
| Flagged | True positive (`tp`) | False positive (`fp`) |
| Not flagged | False negative (`fn`) | True negative (`tn`) |

A case with ten eligible denials is still one case. It contributes one vote in one cell, just like a case with three denials. `total` equals the number of cases and also equals `tp + fp + tn + fn`. Counting each denial would let a noisy script dominate the report and change the unit being measured.

Practice: three cases produce flagged-positive, flagged-negative and unflagged-negative outcomes. The first contains twelve denials and the others contain three and zero. Record the four cell counts and total before checking. Explain why twelve cannot appear in the matrix; after checking, compare your counts with the released answer and try its fresh variant.

## Counts and rates

Report raw counts alongside these rates, without an aggregate accuracy score:

| Rate | Formula | Question answered within this corpus |
| --- | --- | --- |
| Precision | `tp / (tp + fp)` | Of flagged cases, how many have positive labels? |
| Recall | `tp / (tp + fn)` | Of positive cases, how many were flagged? |
| False-positive rate | `fp / (fp + tn)` | Of negative cases, how many were flagged? |

For example, counts `tp=2, fp=1, tn=3, fn=2` yield precision `2/3`, recall `1/2`, and false-positive rate `1/4`. These have different denominators because they ask different questions.

Return `null` when a denominator is zero. With no flagged cases, precision is undefined, not evidence of perfect or terrible precision. With no positive labels, recall is undefined. With no negative labels, false-positive rate is undefined. An empty case list has zero counts and three null rates.

Practice: use one negative quiet case with no signals. Predict every count and rate, including where `null` belongs. Then change only its label to positive and recompute. The post-check answers explain both cases and their denominators; the executable checker also tests those arithmetic rules.

## Exploration and evaluation

Check the classifier and arithmetic before using a report to compare settings.

## Build in four checked milestones

| Milestone | Evidence to inspect |
| --- | --- |
| Eligibility | Work the three-observation example above, retaining only eligible ticks. Keep millimetres and squared millimetres distinct. |
| Any qualifying window | Check a pair exactly on the excluded edge, a pair just inside, and an earlier qualifying burst followed by a late quiet observation. |
| Case decisions and counts | Produce one Boolean per case, preserve case order, then put each case in exactly one matrix cell. |
| Rates and frozen run | Complete the missing denominator exercise below, check zero-denominator cases, then commit settings and source before evaluation. |

Completion: a sibling report has `tp=3, fp=1, tn=4, fn=2`. Fill the three denominators before dividing; identify which denominator contains all negative cases. Then construct a new four-case report of your own without copying those counts. Compare your source's results with its stated labels, while keeping classification independent of labels.

<details><summary>Hint 1 — keep one unit of counting</summary>

The classifier counts eligible observations inside a window; the evaluation counts whole cases. Mixing these units makes a noisy case contribute more than one vote.

</details>

<details><summary>Hint 2 — name each denominator in words</summary>

Precision uses flagged cases, recall uses positive-labeled cases, and false-positive rate uses negative-labeled cases. If the named group is empty, the rate has no denominator and must be `null`.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

For the earlier counts `tp=2, fp=1, tn=3, fn=2`, there are three flagged cases, four positive cases and four negative cases. The rates are therefore 2/3, 2/4 and 1/4. Record this as assistance and finish the different completion counts yourself.

</details>

## Freeze and interpret the evaluation

The corpus assigns seven stable IDs to `exploration` and seven to `evaluation` before settings are selected. Each split has six negative and one positive synthetic violation label. Use exploration to compare thresholds and window sizes. Include threshold three at windows eight and twenty: the exploration burst fits both, while a differently spaced evaluation burst need not. Commit a prediction before viewing that evaluation comparison. Write your final settings and reason into `response.md` before running evaluation; the report also pins settings, candidate source and corpus SHA-256 hashes. A hash identifies the bytes used; it does not certify the source or the author's labels.

Keep exploration and evaluation counts in separate report sections. If evaluation makes you change settings, preserve that result and call the next run a revision. Repeatedly tuning on evaluation makes it part of exploration; changing a report title does not restore independence. This small shipped corpus is inspectable and is not a secret held-out assessment.

The raw counts measure this chosen mix of scripts. They cannot estimate production prevalence or the probability that a real person will be flagged. In particular, precision changes with the proportion of positive cases, and these author-selected proportions are not a population sample. The report includes a separate no-positive/no-prediction diagnostic so undefined rates remain visible.

Before your evaluation run, record one expected tradeoff and the settings commitment. Afterward, compare it with the report and explain what the twin diagnostic cannot determine. A difference between splits is evidence about these scripts, not proof that one setting will generalize to people. Append repairs and assistance. The repair-station scenario in the response template asks you to apply this reasoning to a different decision; it is reviewed separately and is not an automatically scored learning claim.

## Run your own exploration and committed evaluation

Keep the prepared workspace open. In a second terminal at the original reference project, substitute its absolute workspace path below. These commands execute your self-contained JavaScript locally; they are not a security sandbox. The owner-side session keeps numbered exploration, plan and report records.

```sh
npm run evaluation:explore -- /absolute/evaluation-workspace 3 8 500
npm run evaluation:explore -- /absolute/evaluation-workspace 3 20 500
# Predict whether the unseen burst can differ, then commit your choice:
npm run evaluation:plan -- /absolute/evaluation-workspace 3 20 500
npm run evaluation:run -- /absolute/evaluation-workspace <printed-plan-id>
```

Each exploration command returns only the exploration result and records the settings tried. The plan command captures source, settings and corpus before evaluation. The run command uses those captured bytes and saves a report with separate split sections. It also records that evaluation feedback was exposed. On the next `core:check`, the saved submission links the session's evaluation records.

For a later plan, add `--revision "reason for the new plan"` to the plan command. Preserve the first report and describe which earlier feedback you saw. Changing source or settings after seeing evaluation does not create a fresh independent evaluation.

If an evaluation record was interrupted during creation, its directory and any partial bytes remain in the session history as `interrupted`. It is not a runnable plan. Later exploration, new plans and core submissions can continue without deleting that evidence.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
