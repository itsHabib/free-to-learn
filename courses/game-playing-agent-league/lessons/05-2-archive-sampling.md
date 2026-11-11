# 5.2 Sample opponents from an archive

You want half your training games against a recent rival and the rest against older weaknesses. You will implement a reproducible discrete sampler whose actual choices match the declared archive weights.

## A distribution is part of the training objective

An archive entry has an immutable snapshot `id` and a nonnegative `weight`. Weights describe how often each opponent should be selected. The runtime contract requires probabilities summing to one; your implementation validates this representation and rejects an unnormalized roster. Do not silently include unknown IDs or a renamed duplicate as if it added a new strategy.

The learner function is `sampleOpponent(archive, rng)` in `learner/opponent-sampler.mjs`. It returns one existing snapshot ID. The supplied `rng()` returns a value in `[0,1)`. Using ambient randomness instead would break replay even if the long-run frequencies looked reasonable.

A worked sibling is a bag with one red ticket, two blue tickets and one green ticket. Their probabilities are one quarter, one half and one quarter. You can divide `[0,1)` into intervals of those lengths and select the interval containing a random value. Boundaries must be assigned consistently so that no value falls into two intervals or a gap. This illustrates the sampling operation; your archive may contain a different number of entries and zero weights.

**Commit 5.2-p1.** An archive has weights `[0,2/3,1/3]`. Explain which IDs may be returned, what their probabilities should be, and why an all-zero archive needs an explicit error rather than an arbitrary choice.

```sh
node cli.mjs attempt 5.2-p1 --answer 'your distribution and error policy'
node cli.mjs feedback 5.2-p1
```

## Test behavior at boundaries and over a sequence

Validate numbers before sampling: negative weights, NaN, infinity and an empty archive do not define the intended finite distribution. Duplicate IDs also need a declared policy; this exercise rejects ambiguous duplicate entries rather than accidentally doubling their probability. A zero-weight item must never be selected, including when the random value is exactly zero.

Two useful tests answer different questions. Repeating a fixed seed should reproduce the same sequence of choices. A sufficiently long sequence should have frequencies compatible with the probabilities, allowing sampling variation. It should not be forced to contain exactly the expected counts unless you intentionally implement a different balanced scheduling method and name it as such.

Run the practice checker on your sampler:

```sh
node cli.mjs check 5
```

If a boundary fails, retain the offending random value and archive in your attempt record. Repair the interval handling, then test a new archive shape. Hardcoding a special answer for the observed ID does not fix the sampling rule.

**Commit 5.2-p2.** A sampler reproduces its sequence for a fixed seed, but the last archive item is never chosen. Why does reproducibility alone not establish correctness? Describe a boundary test and a distribution test that would expose different causes.

```sh
node cli.mjs attempt 5.2-p2 --answer 'your two tests'
node cli.mjs feedback 5.2-p2
```

## Choose once per game

The league's population mixture selects one snapshot at the start of a game and keeps that opponent for the whole game. Selecting a new snapshot every move creates a different policy. It can combine moves that no archived program would make consistently, and it changes what the empirical matchup matrix means.

The opponent's chosen ID is not included in the acting policy's observation. A learner may infer tendencies from ordinary play, but a privileged roster label is not a legal board feature. The core policies are stateless apart from their seeded randomness and immutable parameters, so claims about unrestricted adaptation to a hidden opponent identity remain outside this response class.

**Commit 5.2-p3.** A supplied host calls your sampler at every turn instead of once at game start. Explain why correcting only the reported probabilities would not restore the original experiment. Identify which evidence must be regenerated after fixing the host.

```sh
node cli.mjs attempt 5.2-p3 --answer 'your mixture diagnosis'
node cli.mjs feedback 5.2-p3
```

Keep the distribution, archive IDs, seed and actual selections with the training run. Lesson 5.3 decides which snapshots should enter that archive without rewriting its history.
