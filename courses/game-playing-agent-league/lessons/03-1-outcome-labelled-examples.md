# 3.1 Build outcome-labelled training examples

A search policy can play a complete game without knowing whether its position scores were useful. You will turn completed games into training examples whose labels mean the same thing from either player's seat.

## Decide what the prediction means

A value estimate predicts a future result from a particular player's perspective. In this course, a terminal win is +1 and a loss is -1. A training example contains a feature vector `x`, a `target`, an `episodeId`, and a `scenarioId`. Before fitting anything, write down which player the target belongs to. “Good position” is too ambiguous to debug.

Consider a completed game won by player 1. An observation represented from player 1's perspective receives target +1; the same observation represented for player 0 receives -1. The label does not change merely because the next row in your dataset represents a later move. Player identity and perspective determine the sign. This also works if a future game allows the same player to move twice.

The label describes what happened under the policies that generated the game. It is not a certificate of the position's optimal minimax value. A strong position may receive a losing label because the continuation contained a mistake. Several games and informative features help the learner discover a pattern, but cannot turn a finite sample into a proof.

**Commit 3.1-p1.** A game ends with returns `[-1,+1]`. Its stored observations have perspectives `[1,1,0]`. Give the three outcome labels and explain why alternating signs by row number would be wrong.

```sh
node cli.mjs attempt 3.1-p1 --answer 'your labels and reason'
node cli.mjs feedback 3.1-p1
```

## Keep information available at decision time

Features are measurements of the current observable state: material, advancement, threatened paths, or another quantity your policy can compute before the outcome. The supplied `features(state, player)` interface in `learner/value-model.mjs` makes the perspective explicit. It returns at most 32 finite numbers. A bias feature is a constant input that lets the model learn an offset.

## Separate board information from perspective

A representation has two different obligations. First, hold the requested player, actor and move count fixed and compare different boards. Some feature vectors must change when a relevant board fact changes. A vector containing only a bias, player ID or move count cannot distinguish those positions. Second, compare the requested players on feature-relevant positions: the representation must preserve whose outcome it describes. Passing one check does not establish the other.

There is no required author feature vector, bias term or sign convention. A material difference is a valid simple representation. It can remain unchanged after a quiet move because the pawn counts have not changed. It should distinguish appropriate boards with different material. Advancement-based features can notice a quiet forward move; arrangement-based features can notice a positional change with equal material. A pair of own/opponent counts is also valid, without expressing the pair as one signed difference.

Likewise, balanced material can produce the same material-difference vector for both players even on a visually asymmetric board. Check perspective on several relevant imbalanced positions instead of demanding different numbers on every position. Keep the vector's order and dimension fixed and its entries finite within `[-1,1]`. Extraction must be reproducible and leave the input unchanged.

The practice checker varies material, advancement and arrangement while holding actor and ply fixed. It requires a board distinction somewhere in that set for each requested player and a perspective distinction somewhere in the set. It does not demand sensitivity to every feature family. These are finite behavior checks, not proof that a representation is strategically useful: explain what each measurement means and inspect its effect on actual decisions.

**Commit 3.1-p4.** Feature A returns only a bias and the requested player's ID. Feature B returns a material difference and is unchanged after a non-capturing move. Explain why A is insufficient and why that one unchanged move does not invalidate B. Describe separate board and perspective comparisons that would provide relevant evidence.

```sh
node cli.mjs attempt 3.1-p4 --answer 'your board and perspective comparisons'
node cli.mjs feedback 3.1-p4
```

## Exclude information from the future

A completed episode record contains much more information than a decision observation. Its final winner, future captures, and final score are legitimate labels or analysis fields. They are not decision-time features. Including the winner in `x` can make validation look excellent while creating an impossible deployed policy.

The supplied transport produces candidate examples. You remain responsible for inspecting their labels and deciding which completed episodes belong in the fit. An interrupted episode has no terminal outcome. Do not manufacture a loss merely because its process stopped. Preserve and quarantine it, then repair the data source or use a separately justified partial-return method outside this exercise's default contract.

Generate actual behavior records with the supplied development configuration:

```sh
node cli.mjs league development-league.json --out ./work/behavior.json
```

This small development season is an inspectable data source, not the final league benchmark. Keep its policy identities and completed records for the fit in 3.2.

**Commit 3.1-p2.** A dataset column named `eventualWinner` reduces validation error nearly to zero. Another column is current pawn count. Explain which can enter `features`, which belongs elsewhere, and how you would detect this leakage in a code review.

```sh
node cli.mjs attempt 3.1-p2 --answer 'your feature audit'
node cli.mjs feedback 3.1-p2
```

## Split games, not adjacent rows

Suppose a 20-move game supplies 20 similar positions. Randomly assigning individual rows to training and validation can put neighboring states from that same game on both sides. Validation then tests familiar trajectories more than the intended change of situation.

Group by episode and declared scenario family before splitting. Keep reflected sibling starting positions together. Record the generator and behavior-policy versions so you can reproduce the partition. Different trajectories can naturally reach the same internal state; record such overlap instead of claiming that every validation state is entirely novel.

Your retained artifact is an example audit: two correctly labelled seats, the feature definition and version, rejected/incomplete episodes, and the train/validation groups. This prepares the fitting exercise in 3.2. No model performance claim is needed yet.

**Commit 3.1-p3.** A new dataset contains ten random continuations from each of four starting positions. Propose a split that tests transfer beyond a known starting position, and identify one limitation that remains even after grouping correctly.

```sh
node cli.mjs attempt 3.1-p3 --answer 'your split and remaining limitation'
node cli.mjs feedback 3.1-p3
```

After feedback, revise the audit without replacing your first response. In module 5 you will revisit this provenance when an apparently better self-play generation encounters an old opponent.
