# Timing module integration

`policy.mjs` is the standalone author solution; copy only `template.mjs` to the
learner's `timing/policy.mjs`. The remaining standard descriptor files are
`fixtures.mjs`, `prompt.json`, `LEARNER.md`, and `response-template.md`.
`controls.mjs` contains two correct predictors and eleven isolated wrong ones.
No author solution or control belongs in a prepared learner workspace.

`runtime.mjs` exports `validateInvestigation(record)`, `runInvestigation(record)`
and `investigations()`. A record is `{schema:1,startMs,actions}`. `actions` use
the labelled join/input/sample/disconnect/resume contract in the exact prompt.
`runInvestigation` returns `{record,observed:{ok:true,checkpoints},receipts}`.
It uses the existing `clock.mjs` and `engine.mjs`, including `join`, `admit` and
`advance`; it does not implement a second game engine. Scripts are finite and
must remain on unobstructed floor. Record export contains connection labels and
actor IDs, never bearer tokens. A disconnect is an explicit delivery gate in
this harness, not a TCP emulator. Existing engine actors remain in the world.

The pure learner API is `predictTiming(record) -> {ok:true,checkpoints}`.
Each checkpoint is
`{label,tick,actors:[{id,connection,connected,lastSeq,expiresAt,x}],receipt,clock}`.
`receipt` is null except for input actions, where it is `{status,tick,seq}`.
`clock` is null except for samples, where it is
`{ticks,dropped,overruns,remainder}`. Fixture failures preserve the first
different checkpoint, expected/actual values and a learner-guide source link.

Parent integration: add `timing` to the core registry using the same descriptor
shape as integrity/telemetry; show the module in course navigation and connect
its prepare/check commands. The guide assumes
`npm run core:prepare -- timing`, then `npm run core:check -- --assistance "..."`
inside the prepared workspace. Parent must reseal after all changes. No shared
file is modified by this slice.

Validation: `node --test tests/timing.test.mjs`. This checks source-level
prediction against real engine/clock observations, not a rendered lesson or
human learning. Parent still owns desktop/mobile rendering, cold-reader runs
and the complete-course completion map.
