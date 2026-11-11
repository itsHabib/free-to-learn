# Game-Playing Agent League — local course candidate

**Build a champion. Then build the agent that breaks it.** Construct search and learned policies, train against a population, and defend a league result with reproducible evidence. The final challenge changes an assumption after you freeze your prediction.

This is an original local course candidate, not a published or accepted Free to Learn course. Its eight-module sequence is described below. Read [VERIFY.md](VERIFY.md) for the exact checks completed in this run. No human learner study or rendered browser verification is claimed.

## Start

Use **Node.js 22 or later** and a text editor. Development checks in this run use Node 26.5.1 on macOS arm64; other Node versions and platforms are not yet verified. No package installation, model download, GPU, API key, account, network connection or server is needed.

```sh
node cli.mjs doctor
node cli.mjs list
node cli.mjs lesson 1.1
```

Open `index.html` directly to read the lesson viewer and inspect saved games. The command line is the authoritative place to commit responses and execute your code. The viewer reads only files you choose; it makes no external requests. The rendered page still needs browser and accessibility verification.

Prerequisites: arrays, functions, recursion, basic algorithmic complexity, probability, averages and variance. For the learned value model, you should be comfortable with vectors, a weighted sum, a loss and a gradient update. No machine-learning framework is assumed. Plan roughly 30–40 hours across multiple sessions; that estimate awaits learner trials.

The supplied game is a 5×5 version of Breakthrough. Each player starts with five pawns and advances toward the other edge. Straight moves require an empty destination; diagonal moves may enter empty space or capture. Reaching the far edge, removing every opposing pawn, or leaving the next player without a legal move wins. Terminal utilities are +1 and -1. Small, deterministic rules let you inspect the actual decisions behind a result.

## What you build

| Module | Your cumulative work | Supplied support |
| --- | --- | --- |
| 1. Establish a fair game | `chooseAction` in `learner/baseline.mjs`: legal, reproducible decisions | Rules, legal moves, observations, seeded randomness, record formats |
| 2. Search adversarial replies | `evaluate` and `search`: player-aware values and bounded planning | Counted simulation oracle, transparent practice trees, game adapter |
| 3. Learn a value model | `features` and `fit`: state features and a fitted linear value | Outcome-labelled episodes, group split, metrics, learned-policy adapter |
| 4. Run an honest tournament | `summarize`: complete denominators, payoff matrix, block uncertainty | Frozen schedule, seat pairing, raw records, bootstrap utility |
| 5. Train against a population | `sampleOpponent`: sampling from a weighted immutable archive | Bounded self-play loop, model snapshots and lineage |
| 6. Find counterstrategies | `responsePolicy` and `nashGap`: a modeled response and exact finite-game gap | Declared opponent model, tiny exact oracle and comparison fixtures |
| 7. Run and defend your league | Frozen six-role population, replayable season and defensible report | Configuration assembly, export, source bundles and replay verification |
| 8. Adapt to a rule change | Prediction, first transfer attempt, repair and limited claims | Separately administered challenge, kept outside the learner package |

Module 3 checks board information separately from requested-player perspective. Material-only, advancement, relative-count and other meaningful representations are supported; not every move or balanced position must change a vector. Bias, player ID or ply alone cannot replace a board measurement.

The starter functions are intentionally incomplete. They should fail their first code checks. You implement the named target logic; you do not need to build a web app, game engine, database or file format.

`learner/league-policy.mjs`, `learner/learned-policy.mjs` and `learner/counter-policy.mjs` are supplied glue. The counterpolicy adapter exposes a declared greedy or uniform opponent model; it does not reveal the opponent's future randomness. Public checks and feedback are practice material. Private qualification controls and reference implementations are excluded from this learner package.

## Commit, inspect feedback, repair

Each lesson supplies exact item IDs:

```sh
node cli.mjs attempt 1.1-p1 --answer 'my reasoning' --confidence medium
node cli.mjs feedback 1.1-p1
node cli.mjs hint 1.1-p1 --level 1
node cli.mjs history
```

Feedback is released after a response is saved. It shows a reasoned answer and self-check criteria; it does not automatically grade arbitrary prose. Original questions, first answers, confidence, assistance and revisions remain in `work/attempts.json`. A later revision does not replace the first response. Navigation is always open.

Run the code check for the module you are working on:

```sh
node cli.mjs check 1
node cli.mjs check 2
node cli.mjs check 3
node cli.mjs check 4
node cli.mjs check 5
node cli.mjs check 6
```

`check evaluation` and `check search` isolate the two parts of module 2. Each code attempt captures learner, runtime and public-checker source before execution, then saves the actual feedback. Changes during execution invalidate the result. An eight-second worker limit catches runaway practice checks. Passing a finite practice check is not a proof of correctness on arbitrary inputs or a full-course pass.

## Run real games, fit, train and report

Begin with the supplied policies. These commands demonstrate the scaffold, not learner accomplishment:

```sh
node cli.mjs demo --seed 7 --out ./work/demo-7.json
node cli.mjs verify ./work/demo-7.json
node cli.mjs league development-league.json --out ./work/behavior.json
node cli.mjs verify ./work/behavior.json --configuration development-league.json
```

The development league has two policies, three starting scenarios and both seats: six real games. `verify` checks recorded action trajectories. Adding `--configuration` reruns the exact policy snapshots and compares their decisions and simulation credits. Both checks are useful; they establish different things.

After implementing module 3, fit your value model using those games:

```sh
node cli.mjs fit ./work/behavior.json --out ./work/value-model.json
node cli.mjs roster ./work/value-model.json --out ./work/value-league.json
node cli.mjs league ./work/value-league.json --out ./work/value-season.json
```

`fit` uses your features and fitting code. `roster` supplies the JSON assembly for random, greedy, hand-evaluated search and learned-value search. The default fit uses seed 41, 400 epochs and learning rate 0.05, with a scenario-group training/validation split. Its small dataset is a learning exercise, not persuasive evidence of playing strength.

After implementing the population sampler, run a bounded training experiment:

```sh
node cli.mjs train development-training.json --out ./work/training.json
node cli.mjs roster ./work/training.json --out ./work/population-league.json
```

The training configuration declares three generations, twelve games per generation, a 64-credit decision budget and its fitting recipe. Every learned snapshot and its lineage are retained. The six-role roster also needs your module-6 counterpolicy before it can play successfully.

After modules 4 and 6, run and interpret that population:

```sh
node cli.mjs league ./work/population-league.json --out ./work/population-season.json
node cli.mjs verify ./work/population-season.json --configuration ./work/population-league.json
node cli.mjs report ./work/population-season.json --out ./work/population-report.json
```

`report` executes your summarizer against the actual records. A valid replay does not automatically make its statistical interpretation correct. Inspect the declared uncertainty unit and denominators. Use the report practice checker and an independent evidence review.

Existing output files are never overwritten. Choose a new name for a new run. League/training work is interrupted after 60 seconds; interrupted work is marked incomplete, not scored as a loss. Reduce the development configuration if needed. A completed final season requires its entire declared roster.

Read [CAPSTONE.md](CAPSTONE.md) before freezing final evaluation. A final course roster has six named roles, sixteen independent scenario groups, both seats, two policy-randomness seeds and a common 256-credit budget. Role labels do not establish correct implementations; source and evidence review remain necessary.

## Keep your work

```sh
node cli.mjs export ./my-attempts.json
node cli.mjs import ./my-attempts.json
```

Exports refuse to overwrite existing files. Imports validate versions and hashes, retain imported provenance, and reject conflicting versions of the same record. Unsupported or corrupt data is preserved for recovery rather than reinterpreted. `--journal /path/to/another.json` selects a separate history. The 16 MiB journal limit refuses further appends rather than dropping old attempts.

If saving fails, the command stops before releasing new feedback. If a process is interrupted while holding a journal lock, inspect the journal and its `.lock` file before manually clearing a stale lock. The tool does not delete your work automatically. Keep the original readable/exportable bytes when investigating a problem. Hashes detect accidental changes; they are not authenticated credentials or proof that work was independent.

## Experimental and runtime boundaries

Run only your own trusted local code. Node workers provide cancellation, not security containment for submissions from strangers. All hypothetical game transitions must use the supplied counted oracle. Direct engine calls would evade that accounting and invalidate the comparison.

Worker JavaScript heaps are capped at 192 MiB old generation and 32 MiB young generation, with a 4 MiB stack. These are reliability limits, not a 256 MiB process-memory guarantee: native allocations, buffers and host overhead are outside those caps. A worker error or allocation failure produces an incomplete operation, not a fabricated match result.

Policy entry modules must be direct `.mjs` files in `lib/` or `learner/`. Keep dependencies inside the captured package and use the supplied seeded randomness. External or dynamically loaded dependencies, wall-clock decisions and uncaptured data are outside this course's reproducibility contract. Restoring an exact source bundle is distinct from proving that its experimental design is sound.

A low validation loss need not improve play. Beating one bot need not improve population performance. A bounded counterstrategy is empirical evidence about its target and budget, not a universal exploitability proof. The independent transfer challenge is not included here; after it is revealed it becomes revision material. Live Free to Learn delivery, rendered interaction checks and a fresh learner flow remain separate acceptance requirements.
