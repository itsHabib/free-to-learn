# Shared core submission runner

From the reference project, after reviewing the final runtime, module and runner
bytes, run `node lab/core/seal.mjs`. Commit `lab/core/reference.json` with those
bytes. The seal independently lists every regular `.mjs`, `.cjs`, `.js`, `.json`
and `.md` file in the project. It includes actual runtime, public, fixture,
template and runner sources. It excludes `artifacts`, `node_modules`, hidden
directories and generated `lab/**/reference.json` files. Excluding all generated
lab manifests avoids cyclic hashes; the old spatial/order seals are neither
changed nor relied upon. A new file or changed file requires a reviewed reseal.

The registry supports `integrity`, `telemetry`, `evaluation`, `retention`, `timing`, `recovery` and `capstone`. Each module supplies
`policy.mjs`, `template.mjs`, `fixtures.mjs`, `prompt.json`, `LEARNER.md` and
`response-template.md`. The prompt declares its `id` and `version`. Fixtures
export `async assess(candidate)` and return
`{ passed, criteria: [{ name, passed, error? }] }`. `candidate` is the imported
learner module. Criteria must be nonempty, uniquely named and agree with the
summary. An error can preserve `message`, `expected`, `actual`, `operator`,
`stack`, `code` and `source` (for a learner-guide feedback pointer). Fixtures catch expected behavioral/assertion failures into
criteria; an uncaught exception is a runner failure.

The parent package supplies these scripts:

```json
{
  "core:prepare": "node lab/core/prepare.mjs",
  "core:check": "node lab/core/check.mjs"
}
```

Run `npm run core:prepare -- integrity` (or `telemetry`) once. This creates
`artifacts/core/<id>-workspace` and refuses to overwrite it. Its minimal package
contains only a usable `core:check` script. It has no author policy, fixtures,
reference runtime or missing test commands. Preparation atomically publishes
the sealed bundle and its exact manifest once at
`artifacts/core/references/<manifestHash>`. Concurrent preparations reuse only a
verified identical snapshot; partial staging directories never become a
reference. Symlinked snapshot directories or files are refused. Run
`npm run core:check -- --assistance "none"` inside the prepared workspace, or
describe the help used. The same commands work directly with Node.

Each prepared session pins that snapshot as its reference root. Later module,
runtime or runner updates and reseals in the original project do not change an
existing workspace's reference. A new preparation uses the current seal. Never
edit a published snapshot: changed snapshot bytes refuse checks and preparation
instead of silently replacing the snapshot or old evidence.

The runner captures all regular workspace files except generated `artifacts`,
`node_modules` and `.git`, including learner helper modules. Required policy,
response, exact prompt, exact guide, session and help metadata must be present.
Help has a `consulted` array of strings and an optional `note`. Double reads and
inventory checks refuse changing submissions. Symlinks and excessive file sizes
are refused. Reference bytes and their inventory are verified before checking.

Authoritative sessions, immutable first/revised submissions, self-reported help,
prompt/version/hash, source hashes, prior feedback exposure and raw results live
under the pinned snapshot's `artifacts/core/{sessions,attempts}`. Each attempt
has `submitted/`, `submission.json`, `assistance.json`, `feedback-started.json`,
`result.json` and `output.txt`. UUIDs, exclusive writes and a session lock keep
earlier attempts intact. Lock metadata records the checker PID and a unique
check ID. Live owners are never displaced. A later checker archives a dead
owner's lock, appends `interrupted.json` to its unfinished attempt, and preserves
its first/revision classification and feedback exposure. Incomplete lock or
recovery metadata refuses clearly without deleting work; retry after an active
initializer finishes. A preparation/capture refusal creates no attempt;
import failures, crashes, timeouts and output overruns preserve an attempt with
`kind: "runner-failure"`. Failed behavioral criteria use
`kind: "behavior-failure"`. CLI exit codes are 0 for pass, 1 for behavior failure,
and 2 for refusal or runner failure. Written explanations are preserved, ungraded.

For an old empty lock, incomplete metadata, or a crashed recovery process, first
stop all checks for the workspace. From the reference project run:

```sh
node lab/core/recover.mjs "/absolute/path/to/the/workspace" --stopped
```

The parent package can expose this as `core:recover`. `--stopped` explicitly
confirms that no check or recovery is starting; ambiguous locks are never
automatically removed. The command validates the prepared session and pinned
reference, refuses any known live check or recovery PID, and renames only the
`checking` directory into a unique `checking-recovered-manual-...` sibling.
Partial metadata and other lock bytes stay in that archive; attempts, feedback
and snapshots are unchanged. Retry the checker afterward. A changed reference
or mismatched session still refuses recovery.

Execution copies live under reference `artifacts/core/executions`, outside the
learner workspace. `trusted/` contains the pinned reference bundle; `candidate/`
contains only captured submission bytes. Fixtures import their runtime relative
to `trusted/`; learner policy is imported from `candidate/`. Workspace files
named like fixtures or runtime cannot replace trusted sources. Before/after
execution hashes detect writes to either execution tree. Workers default to
10 seconds and 1 MiB of stdout/stderr; their result is limited to 512 KiB. The owner reaps the worker process group after normal completion as well as failure. A descendant that deliberately creates a new session is outside this boundary.

This is a local teaching harness, not an OS sandbox or authentication system.
A machine owner can change the launcher, evidence or both sides of a comparison.
Keep sensitive inputs out of it. Reading author/reference material counts as
assistance. These boundaries preserve reproducible learning evidence
(`assessment-09`, `assessment-13`, `practice-10`, `feedback-01`); they do not prove
independent learning or unmodified client execution.


Evaluation exploration and plans use the prepared workspace identity. The owner stores exact source, corpus, settings, revision reasons, exposure and results under `artifacts/core/sessions/<id>/evaluation/`. Each plan runs once. Later plans require an explicit revision reason. A new core submission records links and hashes to this history; no prior submission is rewritten. Evaluation and retention release `prediction-feedback.json` only after capturing the learner response. Fresh variant answers and transfer rubrics stay in author-only modules.
