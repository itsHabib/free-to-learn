# Telemetry author and integration notes

`runtime.mjs` wraps the existing engine without changing its v1 record/replay API. It is dependency-free browser-compatible JavaScript; its only import is `../engine.mjs`, which uses the existing pure admission and detector modules. Expose those modules through an explicit server allowlist if using browser playback.

Exports:

- `RUNTIME_RELEASE`: `courier-runtime-1`.
- `MAX_WINDOW_EVENTS`: `256`.
- `capture(world)` and `restore(checkpoint)`: detached causal state, strict schema validation, no old history or transport credentials. Unknown mutant selections are refused.
- `createReplayEngine()`: frozen `{release,restore,apply,canonical,equal}` facade. `apply` mutates the restored world, accepting only declared `join`, `input` and one-tick events; stale valid input remains causal evidence.
- `createRecordedEngine(seed,{capacity=128,mutant})`: `{world,join,admit,advance,window}`. `join()` returns the original actor; `admit(id,input)` preserves the engine's return value; `advance(n)` accepts 1–100 ticks and records each separately. All mutations must use the wrappers; `.world` remains available to existing snapshot/owner code. `window()` returns a detached complete window. Optional `mutant` forwards the existing owner-test-only selection; it is never recorded in a checkpoint. The replay facade uses normal rules, so altered behavior may fail its final-state comparison.

`startIndex` denotes the last operation before the window, so entries are `startIndex+1` through `endIndex`. On overflow, checkpoint capture happens before the next accepted operation and indices keep increasing. Rejected admissions, failed joins and invalid advance requests do not consume indices or replace the window. Safe-integer limits refuse counter overflow. The new window stores at most the configured capacity, while the unchanged engine still keeps its bounded 4096-event v1 history.

Checkpoints preserve intent, pending interactions, sequence, expiry, cooldown, last decision, all 20 detector buckets and at most 128 findings per actor. Validation checks shape, ranges, runtime constants, sequential actor identities and local consistency. It does not prove that a structurally valid checkpoint has an authentic producer or that every possible checkpoint was reached by a historical session. `final` is the existing public canonical gameplay state; strict checkpoint state and public canonical state have different purposes.

`policy.mjs` is the reference policy. `template.mjs`, `prompt.json`, `LEARNER.md` and `response-template.md` are the learner inputs. The shared runner should copy only the learner inputs, never `policy.mjs`, `fixtures.mjs`, `controls.mjs` or runtime implementation into the editable policy location as a solution.

`fixtures.mjs` exports async `assess(candidate)` returning `{passed,criteria:[{name,passed,error?}]}` and `cases()` for author inspection. `controls.mjs` exports `correctPolicies` (two independent implementations) and `wrongPolicies` (seven annotated behavioral controls). Criteria carry expected/observed results and teaching-section pointers; the fixtures never import the candidate by an arbitrary learner-controlled path.

Run from the project directory:

```sh
node --test tests/telemetry.test.mjs
```

The tests cover continuation after checkpoint/rollover, stale operation evidence, malformed/incompatible/incomplete history, final-state alteration, token exclusion, finite bounds, unchanged legacy replay and grader calibration. They do not establish network timing, authentication, browser visual quality, production capacity or learner outcomes. Browser rendering and the actual prepare/edit/check route are integration acceptance work.

Course-craft trace: the executable policy and stated requirements support `assessment-03`; independent correct/wrong controls support `assessment-09`; expected/observed feedback and section pointers support `feedback-07`; separate response predictions and appended revisions support preserving attempts. The transfer scenario is explicitly an ungraded review prompt (`assessment-02`, `assessment-15`), not evidence of learning.
