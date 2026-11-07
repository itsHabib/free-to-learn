# Beacon Keep · Adaptive Decision Engine

Build a director for a twelve-round expedition. Observe recent play, choose legal encounters, calibrate evidence, evaluate whole episodes and recover after interruption. A well-supported decision to keep rules is a successful outcome.

## Start

Extract the ZIP, open a terminal in this folder, then run:

```
node lab.mjs serve
```

Open the printed http://127.0.0.1 address. Stop with Ctrl-C. The server selects an available port by default; use --port 4317 to keep a stable browser origin. Browser drafts are stored by origin, including port. Export before changing origins.

Qualified terminal environment: Node 26.5.1 on macOS arm64. Browser checks are reported separately; physical-device and screen-reader support are not inferred from terminal checks. No package install, account, GPU, provider or network access is required for the core course. Node 22 and other operating systems have not been qualified. Reading and the supplied game need a browser; sustained implementation benefits from a desktop editor.

## Terminal workspace

```
node lab.mjs start ./work
node lab.mjs check 01 ./work --help-used none --prediction 'Pressure is unknown initially'
node lab.mjs play ./work --mode rules --seed demo-01
node lab.mjs status ./work
node lab.mjs support 04 ./work ./assisted-04
node lab.mjs fingerprint ./work
node lab.mjs freeze ./work
node lab.mjs evaluate ./work --manifest evaluation/dev.json --mode fixture
node lab.mjs evaluate ./work --manifest ./work/project-plan.json --mode project
node lab.mjs evaluate ./work --manifest evaluation/evaluation.json --mode project
node lab.mjs checkpoint ./work --mode project --seed saved-expedition
node lab.mjs resume ./work
node lab.mjs export ./work ./my-beacon.zip
node generate-data.mjs ./work ./new-synthetic-data
```

Start refuses an existing directory. Check 01 initially fails with an intentional TODO. Edit the named files, then rerun. Use --variant 1 for a repeatable fresh public case. Work runs in a bounded worker with a ten-second deadline. Node code has ordinary local permissions; this is not a hostile-code sandbox.

`checkpoint` runs one complete episode with the selected rules or project policy and saves its terminal state, final policy memory, spent allowance, source/calibration identities and director mode. Use `--mode rules` for your rules policy or `--mode project` for your capstone; the default is rules. `resume` restores the saved result without another policy call. A browser checkpoint retains its selected encounter when exported. For a legacy checkpoint with no associated mode, choose explicitly with `node lab.mjs resume ./work --mode project` or `--mode rules`.

The short value from `fingerprint` belongs in project-plan.json. CLI checkpoints use separate SHA-256 source and calibration identities. Use the checkpoint writer above to create those bindings; a hand-built API record must use the same identities to be compatible with CLI resume. API.md §09 defines them.

Support creates a separate assisted directory, retains the original work and history, and supplies only earlier modules. Module 10 support never supplies project.mjs. The browser records support before replacing earlier layers in its current draft. Neither route counts supplied code as unaided work.

## Carry work between browser and terminal

Export my project ZIP includes current source, immutable attempt snapshots, result logs, optional checkpoint and session.json. Extract elsewhere and run the included lab.mjs with ./work. The exported work/.beacon/session.json preserves the same attempt trail as root session.json. The CLI also discovers root session.json when opening a legacy export at ./work. To make a separate named copy, import explicitly:

```
node lab.mjs import session.json ./imported-work
node lab.mjs check 03 ./imported-work --help-used imported
```

Import never merges histories heuristically. The browser keeps a backup before importing; the terminal requires a new target. A failed save refuses a new committed check. Results remain historical when source, question or course identity changes. A pending record after interruption is evidence of an incomplete run, not a pass. Checkpoints preserve the selected encounter as well as policy memory, so resume does not call the policy twice. A legacy checkpoint without that selection restores state only; choose a new encounter explicitly in the browser. The current checkpoint.json is authoritative over an older imported session copy.

## What is supplied

Game engine, authority, renderer, public checks, helpers, synthetic transport, event corpus, local HTTP transport and archive plumbing are supplied. You implement the director layers. Author controls, private review evidence and held-out assessments are excluded from the learner archive. Prior-layer support is explicitly labeled assistance.

See API.md for exact function and file contracts, RUBRIC.md for reasoning evidence, BRIDGE.md for prerequisites, and SOURCES.md for provenance. The course estimates 24–34.5 active hours plus an optional 60–90-minute bridge. Those are planning estimates; no human timing or learning gain is claimed.

## Optional provider status

The optional Node HTTP transport is mock-tested only. No live request was run during production. Use provider-config.example.json only after reviewing current documentation and costs. `node live.mjs provider-config.example.json ./work` is a dry run. Adding --arm explicitly enables a one-request smoke using LIQUID_API_KEY. The browser never reads it. A smoke is not a comparison, and strict monetary caps are refused without a verified billing bound. The required course is fully offline.

## Session storage and recovery

Saved/exported sessions use an exact source-text table. Format 2 shares repeated source and results-file snapshots; format 3 also references attempt results that exactly match the result inside a retained results-file snapshot. Restoration preserves the exact source text and every attempt's question, prediction, help, status and result. The current tools read formats 1, 2 and 3. Keep an original export before moving to newer course tools; older tools cannot read format 3. Use `node lab.mjs import session.json NEWDIR` to restore an exported session, then the usual check commands.

The limits remain bounded: at most 1,000 attempts and 20 MB of stored UTF-8 JSON evidence, with a 128 MB expanded-evidence bound. Legacy pretty-printed format-1 input is limited to 40 MB. Existing per-work-file limits still apply. Distinct large evaluations can still reach the stored limit. Export before reaching it; after a capacity refusal, preserve the complete existing workspace before starting another session. Export also applies these limits and is not a capacity bypass. No attempts are removed automatically. Browser local-storage quotas may be smaller; a browser save failure does not establish that an export or later check was saved.
