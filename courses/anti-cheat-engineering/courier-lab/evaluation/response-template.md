# Evaluation reasoning

Assistance used (including reference code, hints, AI help and prior feedback):

## Before the first code check

1. State what each function receives and returns. Which fields may affect a prediction, and when may labels be read?
2. At a 600 mm minimum, decide which count: range/360,000; cooldown/1,000,000; range/490,000. Explain the units and boundary.
3. Threshold two, window seven: predict eligible ticks [12,19] and [13,19]. Then add a cooldown at tick 80 to the second case. Explain your results.
4. Three cases are flagged-positive, flagged-negative and unflagged-negative, containing twelve, three and zero denials. Compute total, tp, fp, tn and fn.
5. Compute every count and rate for one negative case with no signals. Change only its label to positive and recompute. Explain each null.
6. The honest-delivery and valid-automation twins have identical signals and both have negative violation labels, but different declaredAutomation metadata. Explain why this classifier cannot distinguish their automation status, and why accepting both is not a false negative of the violation detector. Propose an additional observation and state what uncertainty remains.

## First checker result and repair

- Original result and criterion:
- Failing input, expected result and actual result:
- Teaching section and the condition I changed, or why no repair was needed:
- My saved prediction beside each post-check answer and reason (do not erase either):
- A fresh boundary or denominator variant and my answer before checking it:

## Exploration record

- Corpus version/hash:
- Candidate source hash:
- Exploration settings tried, counts and rates (keep the runs separately; include threshold 3, minimum 500 mm, windows 8 and 20):
- Before viewing evaluation, could its differently spaced burst change either result? Why?
- Why I chose the final threshold, window and minimum distance:

## Settings commitment before evaluation

Record this before viewing evaluation results. Keep the saved plan with the attempt.

- threshold:
- windowTicks:
- minDistanceMm:
- Settings/source/corpus SHA-256 hashes from the plan:
- Expected tradeoff:

## Evaluation result

- Report path and evaluation case IDs:
- total / tp / fp / tn / fn:
- Precision / recall / false-positive rate, with denominators:
- No-positive/no-prediction diagnostic and its null rates:
- Indistinguishable-pair diagnostic: decisions, separate declaredAutomation metadata, and why this is not a missed violation:
- What these synthetic controls establish and what they cannot estimate about humans or production:

## Revision log

Append corrections, later settings, results and assistance. Preserve the first attempt, settings commitment and evaluation result. A revision after inspecting evaluation is not a fresh independent evaluation.

## Transfer for review (not automatically graded)

A repair station denies requests when its shared repair resource is empty, during a six-tick cooldown, or when an actor is beyond 400 mm. Two legal scripts have identical request timings: one is manual-shaped and one is declared automated. Design eligible observations and a case-level evaluation for repeated remote requests. Explain which denials cannot support that classification, what the twins imply, how a rare positive population could change precision, and which counts become unknowable if you retain only the most recent five ticks for a twelve-tick detector. Keep your first answer and append any correction. A reviewer uses the separate author rubric; this written answer is not automatically scored by core:check.
