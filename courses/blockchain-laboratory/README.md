# Build a Blockchain Laboratory

Build a local node that rejects invalid transactions, authenticates state, follows a declared fork rule, and recovers from conflicting histories. The final artifact is an executable incident report for an unfamiliar partition and reorganization.

This is an isolated course candidate, not a completed or published Free to Learn course. All balances are valueless counters. Keys are generated in memory and discarded after each process. No wallet, live chain, mining, token launch, external target, paid service, or production security claim is involved.

## Start

Use an already installed Node.js runtime. The authoring environment has Node **26.5.1**; other versions are not yet qualified. No dependencies or installation are required.

```sh
node lab.mjs start
node lab.mjs lesson 01
node lab.mjs check 01
```

The first check should fail with `NOT_IMPLEMENTED`. Edit `work/protocol.mjs`, then repeat the check. Each later module builds on the same file. `start` refuses to overwrite it. Checks preserve source and first/revised results in `work/attempts/` before printing feedback. Local receipts are editable evidence, not credentials.

Declare assistance in each terminal receipt with `LAB_ASSISTANCE`. For example, replace the quoted text with the help you actually used:

```sh
LAB_ASSISTANCE="AI help with implementation; my own review" node lab.mjs check 01
```

Use the same prefix for `practice`, `simulate`, `replay`, and optional `node restart.mjs` commands. Set `LAB_ASSISTANCE=none` when you used no assistance. If omitted, receipts say `not declared`; that value does not establish independent authorship. Earlier receipts keep their original declarations.


```sh
node lab.mjs check all
node lab.mjs simulate partition
node lab.mjs simulate transfer
node lab.mjs replay work/attempts/YOUR-SIMULATION-ID/result.json
node lab.mjs status
node build.mjs
```

`build.mjs` creates a static reader and a positive-allowlist learner package under `dist/`. It does not start a server. The reader is optional; terminal lessons and exercises are the first supported route. Open `index.html` directly in your installed browser for practice. Committed choices and their feedback return when you reopen the same file; use Export practice history to keep a separate copy. Browser practice is separate from `work/protocol.mjs`. Full accessibility, human learning, live network behavior and Free to Learn integration are not established by this local workflow.

Simulation receipts contain the public keys, signed fixture messages and delivery inputs needed for exact replay. They contain no private keys. A fresh simulation generates different ephemeral keys and may change equal-height tie details; replay uses the saved evidence exactly. Only run your own trusted local protocol code: this CLI is an offline teaching runner, not a security sandbox for arbitrary submissions.

## Back up and restore terminal work

The terminal CLI has no learner-project export command. The optional reader's export contains practice choices only. To preserve your protocol, report, first and revised attempts, and optional vote-guard work, make a manual archive of the entire course directory, including `work/`.

Stop editing while the copy runs. From this course directory, choose a new archive name outside it:

```sh
( set -C; tar -cf - . > ../blockchain-backup-01.tar )
```

The subshell refuses to replace an existing archive. If the command fails, keep the original course and choose another new archive name. The archive contains your private learner code and receipts; keep it separate from the public course package.

To recover, create a new destination outside the original course and extract your own trusted archive there:

```sh
mkdir ../blockchain-restored-01 && tar -xf ../blockchain-backup-01.tar -C ../blockchain-restored-01
cd ../blockchain-restored-01
node lab.mjs status
node lab.mjs check all
```

`mkdir` refuses an existing destination, so the extraction does not overwrite an earlier recovery. Keep both the original and backup. `check all` creates a new attempt; it does not replace earlier results and still reports unfinished modules if you are in progress. You can instead rerun your current unit with `node lab.mjs check 01` through `08`. If you created the optional `work/vote-guard.mjs`, also run `node restart.mjs check`. Continue editing in the recovered directory; first and revised receipts remain in `work/attempts/` and `work/restart-attempts/`.

This preserves local files. It does not resume an in-memory simulation, retain fixture private keys, or establish physical power-loss durability. Replay a saved simulation with the existing `node lab.mjs replay RECEIPT.json` command when you need its exact public inputs.

## Course map

| Module | Learner-owned mechanism | End-of-module evidence |
| --- | --- | --- |
| 01 One message, one meaning | Exact envelope validation and canonical signature verification | Tampering/replay-domain cases rejected; reordered properties accepted |
| 02 Apply it once | Atomic, deterministic state transition | Nonce, overspend, self-transfer and no-mutation controls |
| 03 Prove a state claim | Merkle root and membership verification | Tampered value, path, position and root rejected |
| 04 Pending is not accepted | Dependency-aware bounded mempool selection | Future nonce, competing spends and later-valid dependency behavior |
| 05 A block is a claim | Parent-linked block validation and state-root checking | Fabricated root and invalid descendant excluded |
| 06 Two honest histories | Deterministic fork choice over validated records | Arrival-order independence and explicit lack of finality |
| 07 What can a quorum promise? | Distinct authenticated vote certificates | Duplicate/foreign votes rejected; partition safety/liveness argument |
| 08 Recover without inventing history | Reorganization and orphan transaction revalidation | Unfamiliar partition incident, stale proof and dependency recovery |
| 09 Remember your vote after a crash (optional) | Vote journal planner with persistence before sending | Crash-cut exploration, conflicting-certificate trace and rollback counterexample |

## Optional restart project

After module 07, build a separate vote guard without replacing your existing protocol file:

```sh
node lab.mjs lesson 09
node restart.mjs start
node restart.mjs check
node restart.mjs simulate crash
node restart.mjs simulate rollback
```

Edit `work/vote-guard.mjs`; the first check intentionally fails. The experiment connects a forgotten vote to two authentic but conflicting certificates, then tests the limit of crash recovery when committed history is rolled back. These are in-memory fault simulations, not actual machine restarts or durable disk storage. `check all` continues to check modules 01–08; run `restart.mjs check` for the optional project. Its source snapshots and results are separate in `work/restart-attempts/`. Both source files must be your own trusted local code.

Read [COURSE.md](COURSE.md) for prerequisites, the assessment contract and scope. [CONTRACT.md](CONTRACT.md) specifies every interface. [SOURCES.md](SOURCES.md) records primary references and where the model deliberately differs. Instructor references and checker calibration live only in `instructor/` and are excluded from the learner build.
