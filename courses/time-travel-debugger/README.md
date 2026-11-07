# Build a time-travel debugger

Build a debugger for a small deterministic virtual machine, then diagnose an unfamiliar program. You own control, inspection, stopping rules, tracing, replay and reverse state search. The supplied VM is original teaching infrastructure. It has no access to native processes.


## Entry skills and boundaries

This course is for a programmer comfortable editing/running JavaScript ES modules, writing functions and classes, using objects/arrays/Map, reading exceptions and passing quoted arguments in a terminal. The debugger assumes you can follow nested object mutation; the supplied VM defines its own instruction set. This is not a first programming course. If these prerequisites are unfamiliar, use the reduced examples and completion cases, then decide whether to review JavaScript first. No extra runtime or paid account is required.

## Start offline

Use Node.js. The local construction run uses **v26.5.1 on macOS**; other Node versions and operating systems are unqualified. No npm install, API key, paid service or internet connection is needed.

1. Open index.html for the complete reader, or read lessons/01.md.
2. In this extracted directory, run `node lab.mjs start project` once.
3. Read contracts.md and lesson 01. Edit only project/solution.mjs for target logic.
4. Run `node lab.mjs check project 01 --help-used none`. The untouched starter is expected to fail with named unfinished methods.
5. Work through lessons 01–07 and the matching checks. Run your debugger with `node debug.mjs project/solution.mjs programs/counter.json`.

Navigation stays open. The chapters are one cumulative tool, not seven unrelated projects. You may implement and check any milestone directly; tests run cumulatively to preserve earlier behavior. Earlier learner code is reused by design within this one project. The explicit start-for route below supplies prior layers for an independent unit attempt; the cumulative route still builds your own complete tool.

## Builds you keep

01 inspector; 02 conditional loop runner; 03 memory-change investigator; 04 trace recorder; 05 replay viewer; 06 reverse state search; 07 diagnosis tool and report. Read capstone.md for the less-guided final investigation and learner-owned extension. Timings are estimates until tried by people.

`node lab.mjs question 01a` shows a prediction. `node lab.mjs predict project 01a ANSWER --help-used none` commits it before feedback; 01b is a changed case. Each coding check saves source, report, question/version, assistance and actual results in project/attempts before execution. Editing code does not revise earlier attempts. Local receipts are editable records, not credentials.

`node lab.mjs export project NEW_EXPORT_DIRECTORY` copies your code, report and attempts without overwriting an existing destination. Your project is nested at `NEW_EXPORT_DIRECTORY/project/`. Keep this course package and invoke the exported solution by its full path. For example, from this course directory after completing your project:

```sh
node lab.mjs export project ./my-debugger-export
node lab.mjs check ./my-debugger-export/project 07 --help-used "export replay"
node debug.mjs ./my-debugger-export/project/solution.mjs programs/counter.json
```

Use the help description that matches your actual assistance. No restore/import path is provided and no old receipt is promoted to current.

## Optional help and acceptance limits

own-llm.md contains a copyable critique prompt for your own account. Nothing sends your work automatically. Deterministic checks cover their named cases; diagnosis reasoning uses a rubric. Author controls are outside this package. The Node terminal course is publicly available. Independent AI learner runs are separate evidence, not a human mastery claim. Human difficulty/time trials, rendered desktop/mobile inspection and actual browser ZIP receipt remain unqualified. Node runs the full toolchain; checker.html supplies the bounded offline fallback described below, with actual browser acceptance pending.

The runner executes your trusted local JavaScript with your normal process permissions. It is not a security sandbox; run code you understand.

## Earlier-layer assistance

To attempt a unit independently, run `node lab.mjs start-for NEW_DIRECTORY NN --use-prior`. This creates a new project with completed earlier layers and unfinished current logic. It refuses existing destinations and records exactly which layers were supplied in PROJECT.json and every check receipt. support.json intentionally contains readable earlier-layer worked source; it is assistance, not hidden assessment material or a submission you can claim to have implemented. Stage07 provides a practice tool/engine, not a learner-owned full implementation or capstone report. Keep and repair your cumulative project if you want your own complete artifact. No staff or model reply is required.

Human effectiveness and difficulty are unverified. The launch route uses learner-run checks and optional critique from the learner's own account; it introduces no staffed/human-trial requirement. Independent engineering, packaging/download and actual platform acceptance remain separate.

## Browser fallback and its limits

Open checker.html for an offline code editor and on-demand worker checks using the same public criteria. It preserves all submitted code/help/results and can export source plus the complete local history. The earlier-layer button creates a separate assisted draft. It requires a browser supporting module workers, data-module imports, crypto.subtle and localStorage; actual browser route/download acceptance is still pending. This debugger fallback accepts the supplied ./vm.mjs import. Use Node for custom modules, Node-only APIs and CLI export/replay. Unsupported browser execution is an execution error, not evidence that a Node-valid debugger violates the course contract. No staffed reply or paid model is involved.

## Run the browser checker offline

In this extracted course directory, run `node serve.mjs`, then open `http://127.0.0.1:8128/checker.html`. Keep the terminal open; Ctrl+C stops it. The helper uses the same tested Node runtime as the CLI. It binds only 127.0.0.1 and serves an explicit read-only reader/checker/SVG list, never projects, directory listings or author files. No package install or internet connection is needed. If the port is already used, run `node serve.mjs --port 0` and open the exact URL it prints. The default port stays fixed so the same browser origin can retain local attempts across restarts.

Directly opening checker.html as a file displays the local-preview command and refuses check execution; editing and source/history downloads remain available. Export any existing file-page work before switching origin. Browser state is per origin: the loopback page does not automatically import or reinterpret file-page attempts. Keep the old JSON export, start a new draft at the local URL, paste your own downloaded source and declare help. All prior records retain their saved source, assessment and verdict. The Node CLI route needs no preview server.
