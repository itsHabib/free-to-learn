# Verification and limits of this candidate

This is a local learner package, not a certificate of learning or a live Free to Learn release.

On November 4, 2026, the author-side suite passed 84 tests on Node 26.5.1, macOS arm64. The tests covered rule invariants and actual replay, seeded policies, budget and forfeit handling, wrong and valid alternative implementations, grouped statistics, fitting, sampling, exact finite-game gaps, transfer tactics, and attempt/import preservation. Node 22 is the intended minimum; it was not available for a separate test in this run.

An end-to-end engineering run used private reference implementations through the same learner CLI. It passed all six code-check groups, fit a model from recorded games, trained three generations over 36 games, ran a 90-game six-policy development league, and ran a 960-game final-shaped roster. Both trajectory and exact-policy replay passed, and the learner report function consumed the actual records. Export/import and first-answer/revision records were exercised. Those reference solutions and their raw source bundles are deliberately absent from this package.

The private rule-change instrument accepted two different correct search implementations and rejected turn-alternation assumptions, a wrong evaluation perspective, weak action selection and budget overruns. Automated success leaves manual transfer review pending. The challenge is separately released by an administrator after the base submission is frozen; its private grading cases are never included here.

Version 0.1.1 separately checks board sensitivity at a fixed player/actor/ply and requested-player perspective across diverse positions. Independent material-only, relative-count, advancement and positional representations pass; player-only, ply-only and constant representations fail. A quiet move may leave a material feature unchanged. These finite checks do not prove strategic usefulness.

The starter files in this package still contain unfinished learner functions. Their initial checks should fail. This is expected and helps establish that the package has not substituted a finished reference solution for your work.

Not run: rendered browser interaction, accessibility audit, mobile-device verification, a fresh human learner trial, live deployment, or live Free to Learn flow. The reader and replay viewer received static structure/JavaScript checks only. The course therefore remains a candidate with these release gates open.

Practice feedback is self-assessed; a local file cannot keep its answer material secret. Hashes preserve source/version identity and detect accidental change, not independent authorship or authenticity. A full course assessment also requires examining the learner's reasoning, assistance, experimental choices and unfamiliar transfer work.
