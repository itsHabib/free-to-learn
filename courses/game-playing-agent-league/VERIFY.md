# Verification and limits of this candidate

This learner package is available in the public GitHub source. Availability is separate from a certificate of learning, full-course acceptance or verified live Free to Learn delivery. Follow README.md to clone it, locate the course and record your checkout revision.

## Public opening-lesson verification — November 16, 2026

On Node 26.5.1, macOS arm64, the public-source revision was checked locally without installs or network access:

- `node cli.mjs doctor`, `list`, and `lesson 1.1` / `lesson 1.2` succeeded from the documented course directory. The GitHub clone itself was not rerun; the clone URL matches this checkout's public origin.
- `node examples/decision-contract.mjs contract` showed legal moves from cell 7 to cells 11 and 12, a nonterminal capture, an unchanged input and one simulation credit. A scratch variant moving to 12 stayed nonterminal; moving to friendly-occupied 13 exited with `ILLEGAL_ACTION`.
- `node examples/decision-contract.mjs randomness` repeated seed 7's action 31. Seed 8 drew a different value but also chose action 31; one extra seed-7 draw chose action 108. A scratch logging repair restored the original choice without consuming another random value.
- All public `.mjs` files passed `node --check`. The embedded viewer script also passed syntax checking. The viewer articles outside lessons 1.1 and 1.2, the learner baseline, public checks, question catalogs, feedback and Module 8 lesson files remained byte-for-byte unchanged.
- `node cli.mjs check 1 --journal <temporary-journal>` exited 1 as expected: B01–B04 each reported the untouched `LEARNER_TODO`. Its code snapshot and failed feedback were saved. Synthetic first-response, feedback and revision records retained both responses and the same question hash through export/import in temporary journals. No learner history was edited.
- `node cli.mjs demo --seed 7 --out <temporary-replay>` and `node cli.mjs verify <temporary-replay> --journal <temporary-journal>` succeeded. This is a supplied-policy trajectory replay; it did not rerun learner policies or qualify their strength.

These are opening-lesson and setup checks, not a new full-course acceptance run. No private reference solution or private transfer instrument was accessed. GitHub fetching, rendered browser behavior, accessibility, fresh learner experience and human transfer review remain unverified here. Shared public inventories and release archives require coordinator integration after review.

## Historical author-side evidence

On November 4, 2026, the author-side suite passed 84 tests on Node 26.5.1, macOS arm64. The tests covered rule invariants and actual replay, seeded policies, budget and forfeit handling, wrong and valid alternative implementations, grouped statistics, fitting, sampling, exact finite-game gaps, transfer tactics, and attempt/import preservation. Node 22 is the intended minimum; it was not available for a separate test in this run.

An end-to-end engineering run used private reference implementations through the same learner CLI. It passed all six code-check groups, fit a model from recorded games, trained three generations over 36 games, ran a 90-game six-policy development league, and ran a 960-game final-shaped roster. Both trajectory and exact-policy replay passed, and the learner report function consumed the actual records. Export/import and first-answer/revision records were exercised. Those reference solutions and their raw source bundles are deliberately absent from this package.

The private rule-change instrument accepted two different correct search implementations and rejected turn-alternation assumptions, a wrong evaluation perspective, weak action selection and budget overruns. Automated success leaves manual transfer review pending. The challenge is separately released by an administrator after the base submission is frozen; its private grading cases are never included here.

Version 0.1.1 separately checks board sensitivity at a fixed player/actor/ply and requested-player perspective across diverse positions. Independent material-only, relative-count, advancement and positional representations pass; player-only, ply-only and constant representations fail. A quiet move may leave a material feature unchanged. These finite checks do not prove strategic usefulness.

The starter files in this package still contain unfinished learner functions. Their initial checks should fail. This is expected and helps establish that the package has not substituted a finished reference solution for your work.

Not run: rendered browser interaction, accessibility audit, mobile-device verification, a fresh human learner trial, live deployment, or live Free to Learn flow. The reader and replay viewer received static structure/JavaScript checks only. The course therefore remains a candidate with these release gates open.

Practice feedback is self-assessed; a local file cannot keep its answer material secret. Hashes preserve source/version identity and detect accidental change, not independent authorship or authenticity. A full course assessment also requires examining the learner's reasoning, assistance, experimental choices and unfamiliar transfer work.
