# Build a recoverable single-writer store

Build a local string store with framed records, an append log, an index, atomic batches, truncated-write recovery and safe compaction. You own storage logic. The supplied disk adapter gives you local file operations and a deterministic process-interruption model.


## Entry skills and boundaries

This course is for a programmer comfortable editing/running JavaScript ES modules, writing functions and classes, using objects/arrays/Map, reading exceptions and passing quoted arguments in a terminal. The storage course additionally assumes basic Node Buffer use, unsigned big-endian integers, UTF-8 byte lengths and filesystem calls; lesson01 works through cursor placement before production. This is not a first programming course. If these prerequisites are unfamiliar, use the reduced examples and completion cases, then decide whether to review JavaScript first. No extra runtime or paid account is required.

## Start offline

Use Node.js. Construction testing uses **v26.5.1 on macOS**; other Node versions and operating systems are unqualified. No npm install, account, network, paid database or API key is needed.

1. Open index.html for the reader, or read lessons/01.md.
2. Run `node lab.mjs start project` in this extracted directory once.
3. Read contracts.md. Implement project/solution.mjs, beginning with the codec.
4. Run `node lab.mjs check project 01 --help-used none`. The untouched starter should fail with named unfinished functions.
5. Continue through lessons 01–07 and their cumulative checks.

The course builds one engine. You retain earlier work between milestones. These are cumulative builds. The explicit start-for route below supplies prior layers when you need to attempt a later unit independently. Navigation is unrestricted and every public case is readable.

## A useful final artifact

After implementing openStore, try `node store.mjs project/solution.mjs my-data put note hello`, then `node store.mjs project/solution.mjs my-data get note`. Each invocation reopens the log. The CLI also provides list, delete, batch and compact. Use a new data directory for experiments. capstone.md asks you to build a small client and a recovery report around data you own.

Run `node lab.mjs question 01a` to see a prediction and `node lab.mjs predict project 01a ANSWER --help-used none` to commit before feedback. Then try changed case 01b. Checks save your exact source, report, question/version, assistance and actual results before execution. First attempts remain historical after revisions. These local records are editable and are not authenticated certificates.

`node lab.mjs export project NEW_EXPORT_DIRECTORY` preserves the whole project and attempt history at `NEW_EXPORT_DIRECTORY/project/`. Keep this course package and run store.mjs against that nested solution and a separate data directory. For example, from this course directory after completing your project:

```sh
node lab.mjs export project ./my-store-export
node lab.mjs check ./my-store-export/project 07 --help-used "export replay"
node store.mjs ./my-store-export/project/solution.mjs ./recovered-data put note hello
node store.mjs ./my-store-export/project/solution.mjs ./recovered-data get note
```

Use the help description that matches your actual assistance. No restore/import operation promotes historical passes.

## Persistence claims and limits

Read contracts.md before interpreting a pass. There is one writer. The fault model covers process interruption, positive short writes, selected torn append prefixes and atomic whole-file replacement. FileDisk calls file/directory fsync, but no power-removal experiment or universal filesystem guarantee is claimed. Complete corruption fails closed; a torn suffix is repaired to the last commit.

own-llm.md is optional critique using your own account. No work is transmitted automatically and no staff reply is required. Independent review, human learning/time trials, rendered desktop/mobile inspection and actual browser ZIP receipt remain pending. This local candidate is unpublished. Node runs the full toolchain; checker.html supplies the bounded offline fallback below, with actual browser acceptance pending.

The runner executes your trusted local JavaScript with your normal process permissions. It is not a security sandbox; run code you understand.

## Earlier-layer assistance

To attempt a unit independently, run `node lab.mjs start-for NEW_DIRECTORY NN --use-prior`. This creates a new project with completed earlier layers and unfinished current logic. It refuses existing destinations and records exactly which layers were supplied in PROJECT.json and every check receipt. support.json intentionally contains readable earlier-layer worked source; it is assistance, not hidden assessment material or a submission you can claim to have implemented. Stage07 provides a practice tool/engine, not a learner-owned full implementation or capstone report. Keep and repair your cumulative project if you want your own complete artifact. No staff or model reply is required.

Human effectiveness and difficulty are unverified. The launch route uses learner-run checks and optional critique from the learner's own account; it introduces no staffed/human-trial requirement. Independent engineering, packaging/download and actual platform acceptance remain separate.

## Browser fallback and its limits

Open checker.html for an offline code editor and on-demand worker checks using the same public criteria. It preserves all submitted code/help/results and can export source plus the complete local history. The earlier-layer button creates a separate assisted draft. It requires a browser supporting module workers, data-module imports, crypto.subtle and localStorage; actual browser route/download acceptance is still pending. The storage fallback uses MemoryDisk and a bounded Buffer adapter, so use Node for real FileDisk/CLI operations or other imports/Buffer APIs. Unsupported execution is an error, not a failed storage/debugger requirement. No staffed reply or paid model is involved.

## Run the browser checker offline

In this extracted course directory, run `node serve.mjs`, then open `http://127.0.0.1:8129/checker.html`. Keep the terminal open; Ctrl+C stops it. The helper uses the same tested Node runtime as the CLI. It binds only 127.0.0.1 and serves an explicit read-only reader/checker/SVG list, never projects, directory listings or author files. No package install or internet connection is needed. If the port is already used, run `node serve.mjs --port 0` and open the exact URL it prints. The default port stays fixed so the same browser origin can retain local attempts across restarts.

Directly opening checker.html as a file displays the local-preview command and refuses check execution; editing and source/history downloads remain available. Export any existing file-page work before switching origin. Browser state is per origin: the loopback page does not automatically import or reinterpret file-page attempts. Keep the old JSON export, start a new draft at the local URL, paste your own downloaded source and declare help. All prior records retain their saved source, assessment and verdict. The Node CLI route needs no preview server.
