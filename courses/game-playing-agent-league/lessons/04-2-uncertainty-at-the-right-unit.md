# 4.2 Quantify uncertainty at the right unit

A report claims certainty because it contains thousands of moves, although those moves came from eight starting scenarios. You will choose a sampling unit that matches the question and interpret an interval without overstating what it measures.

## Count independent variation, not rows

Moves inside one game are linked. The same initial scenario also links its seat-swapped games and randomness replicates. Treating every move as an independent observation creates a large apparent sample while adding little independent information about different situations.

For this course's scenario-distribution claim, a block is one scenario with all of its planned seats and replicates. Compute one mean utility for each block, then analyze variation across blocks. If you compare two methods, keep their paired results together. Destroying pairing can either increase or decrease the apparent uncertainty; it changes the sampling experiment.

Suppose six scenarios each produce four games. There are 24 scored games but six scenario blocks. The report should show both numbers. If all four games on one scenario are duplicates in effect, repeating them 100 times still does not provide 100 new scenarios.

**Commit 4.2-p1.** A report has 16 scenarios, two seats and two randomness replicates per scenario. It resamples its 64 games independently. Identify the sampling unit the planned scenario-distribution claim requires and explain what structure the resampling must preserve.

```sh
node cli.mjs attempt 4.2-p1 --answer 'your sampling unit and repair'
node cli.mjs feedback 4.2-p1
```

## Build and label a block bootstrap

A bootstrap constructs new samples by sampling observed units with replacement. For each resample, draw as many scenario blocks as the original report contains, allowing a block to appear more than once. Compute the statistic again. The distribution of those resampled statistics approximates sampling variation under the procedure's assumptions.

The supplied `blockBootstrap` utility uses the declared seed and interval settings. The course default is a nominal 95% percentile interval from 2,000 resamples. The paired reducer in your report must create complete blocks before calling it. More bootstrap resamples make the numerical approximation smoother; they do not create new game evidence.

A 95% confidence procedure aims to cover the underlying quantity in about 95% of repeated experiments under its assumptions. It does not assign a 95% probability that this particular fixed interval contains a fixed parameter. With few scenarios or strongly discrete outcomes, nominal coverage can be poor. Show counts, method and limits, and be willing to say the evidence is inconclusive.

**Commit 4.2-p2.** Your interval crosses zero. A teammate writes “the policies are equally strong.” Explain what is missing from that conclusion. Then explain why raising bootstrap resamples from 2,000 to 20,000 does not by itself solve the evidence problem.

```sh
node cli.mjs attempt 4.2-p2 --answer 'your corrected interpretation'
node cli.mjs feedback 4.2-p2
```

## Separate a checkpoint from a training algorithm

One fitted policy can play thousands of games. Those games characterize that frozen checkpoint under the declared evaluation distribution. They do not reveal how much the training algorithm varies across independently trained models.

To compare training methods, retain multiple independent training seeds. The course uses five as a bounded starting target, not a theorem of adequacy. Evaluate each trained model on a matched scenario plan. Training run is the upper level of variation; scenario blocks sit within it. Keep failed and weak training runs, rather than selecting the lucky one before computing the method's mean.

There is also a simpler legitimate claim: the exact average over this fixed finite roster. That average is an observed fact once all results are valid. An interval is useful only when you identify the broader sampling target; it does not automatically generalize the roster to every opponent or rule.

**Commit 4.2-p3.** You have one trained checkpoint, 1,000 evaluation games and no other training runs. Write one supported claim and one unsupported algorithm-level claim. Describe the additional evidence needed for the latter.

```sh
node cli.mjs attempt 4.2-p3 --answer 'your claims and evidence plan'
node cli.mjs feedback 4.2-p3
```

Save the interval method, sample unit and interpretation beside your report. Module 6 will apply the same discipline to claims about counter-strategies.
