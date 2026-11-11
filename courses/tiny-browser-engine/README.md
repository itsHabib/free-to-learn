# Tiny Browser Engine — local course candidate

Build a small browser for interactive reference pages. Follow the same document through an owned DOM, cascade, layout, fixed-font text, paint commands, geometric targeting, event dispatch and incremental updates. The result is a useful constrained renderer whose decisions can be inspected and replayed.

This learner edition supports the eight-module terminal route below. Browser UI, accessibility and human learning remain separately unqualified; the terminal route needs no browser or server.

The M6 stage inspector passes the current viewport when rebuilding after dispatch. Earlier archives remain historical; use the matching current package for terminal recovery. This correction does not establish browser execution.

## Complete terminal route

See [TERMINAL.md](TERMINAL.md) for all eight lessons and conceptual practices, own packet files, cumulative stage/render work, and versioned session export/restore/resume. The browser route remains optional and unqualified here.

## Start as a learner

Use an already installed recent Node with ES modules, `structuredClone` and Web Crypto. Author checks here ran on **Node v26.5.1**; other versions have not been qualified. There is no package installation step and no third-party runtime dependency.

1. Copy `public/starter.body.js` to a file such as `my-engine.body.js`. Keep the eight method names. Implement the current module and leave later methods as explicit stubs.
2. Run `node tools/check.mjs my-engine.body.js M1`. A blank starter is expected to fail. The report names each requirement, its input, expected observation and actual observation.
3. Read `node tools/lesson.mjs M1`, then M2 through M8, for the lessons, conceptual practices and cumulative project prompts. Record answers before requesting `--answers` feedback. The lesson-data source includes answer metadata, so use this CLI for a fresh attempt. The browser workbench is optional when a local server/browser session is available.
4. Run `node tools/stage.mjs my-engine.body.js M1 stage.json` to inspect your own current stage. M3 uses an empty-box fixture so text is not a hidden prerequisite.
5. Once the whole engine is implemented, run `node tools/render.mjs my-engine.body.js board board.png`, then `node tools/render.mjs my-engine.body.js board after.png click`.

These CLIs execute your local JavaScript. Use locally authored, trusted source; they are not a hostile-code sandbox. Each checking/stage job has a five-second worker deadline. Rendering is a direct trusted-source command.

## Browser workbench

`node tools/build.mjs` creates `build/` from an explicit learner allowlist. To use it later, start `node tools/serve.mjs` and open the printed **127.0.0.1** URL. An optional port may follow the command. The server serves only the build manifest's learner files and applies a worker response policy; it does not serve this directory or `private/`. Stop it with Ctrl-C.

The local server and browser **were not started during this construction pass** because a shared resource slot was not granted. The emitted worker was syntax-checked and its request protocol was exercised under Node VM. That is not browser/CSP validation. Opening `index.html` as a `file:` URL is not supported because modules, worker fetches and storage need an origin.

The workbench includes eight readable lessons, 24 short conceptual practices, explicit cumulative build tasks, a source editor, public checks, stage inspection, full page rendering, click/keyboard activation, mutation/viewport controls, per-node provenance, frame-change reports, and source/notebook/frame/PNG exports. A prerecorded author demonstration is separate and prediction-gated. It never replaces learner code.

## The eight cumulative modules

| Module | Learner-owned deliverable |
|---|---|
| M1 Own the document | Strict tree construction and atomic identity-preserving mutations |
| M2 Resolve the cascade | Selector matching, declaration priority, inheritance and provenance |
| M3 Lay out blocks | Content/border geometry and dependent sibling positioning |
| M4 Turn text into fragments | Cross-node whitespace, wrapping, line height and source-owned glyphs |
| M5 Paint what layout means | Display commands, clipping and geometric hit selection; P1 renderer |
| M6 Route input into change | Frozen-path event dispatch and controlled page updates |
| M7 Recompute only what changed | Observable stage reuse with clean-render consistency; P2 interactive engine |
| M8 Render and diagnose an unfamiliar page | General repair on a new reference system; P3 transfer evidence |

Read `public/CONTRACT.md` for exact data shapes and `public/SOURCES.md` for primary references. Data structures, parsing basics and elementary graphics are prerequisites. The supplied code handles intake, UI, fixed original glyphs, rasterization, file I/O and actions. Those are intentionally not additional learner implementation assignments.

## Evidence and recovery

Commit records preserve source bytes and SHA-256, the packet and its hash, assistance labels and separate results. Repair attempts append history. Interactions link to the exact render submission. Notebook imports validate structure and source/packet hashes before merging; imported outcomes remain unauthenticated local claims. Repeated quiz answers are labeled revisits after feedback, not fresh mastery evidence.

The notebook is limited to 160 events / approximately 4 MB, source to 128 KiB, a packet to 256 KiB and one live trace response to 16 MiB. Export before those limits. The UI falls back to memory-only use when persistent storage is unavailable or another tab changed the stored value. Unreadable stored data is preserved for export. Frame traces are exported separately from the compact notebook.

`node tools/replay.mjs notebook.json replay-report.json` validates hashes and re-executes retained source/packet/interaction attempts in a bounded worker. Replay does not authenticate a grade or establish who wrote the source.

## Practice and transfer

Instructor implementations and private transfer instruments are not included. The visible field page is transfer rehearsal. Preserve your first engine, packet, predictions and notebook before attempting a new page; retain failures and explain each general repair. Finite checks and clean-vs-incremental agreement do not establish arbitrary web compatibility or human mastery.

## Limits of this candidate

TBE-1 accepts strict `main/div/p/span/button`, quoted ID/class, printable ASCII, a declared subset of normal CSS rules, block/inline/none, integer dimensions, uniform borders, fixed 8×16 glyph cells, simple whitespace/wrapping, scoped clipping and a small supplied action vocabulary. Unsupported input receives a diagnostic. No arbitrary page JS, network content, flex/grid/tables, Unicode shaping, native forms or full browser parsing is promised.

Remaining quality work includes browser/CSP/keyboard/storage qualification, independent source and curriculum review, broader boundary controls, richer inline ancestor fragment geometry, stream/chunk handling for large traces, authentic learner transfer observation and authorized integration/release. Do not describe this local package as a completed live course.
