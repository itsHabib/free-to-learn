# Advanced Storage: concurrent snapshots

Build eight database policies on a supplied durable store: version visibility, atomic commit ordering, write conflicts, predicate conflicts, historical index membership, safe version retention, snapshot statistics and costed plan selection.

**This is a local nine-unit course prototype.** Seven cumulative code milestones lead to an adversarial investigation and an unfamiliar archive-export transfer. The reference and controls have source-aware engineering evidence. Local terminal and reader journeys have bounded checks; a blind learner trial, human learning and comprehensive accessibility remain unverified. No live Free to Learn course is claimed.

## Start

Use Node **26.5.1**. That is the tested runtime; other versions/platforms are unqualified. No npm install, account, network call or paid service is needed.

```sh
node lab.mjs doctor
node lab.mjs start work
node lab.mjs question 01a
node lab.mjs check work 01 --help-used none
```

The last command should report unfinished visibility code in the untouched starter. To commit a question response, run `node lab.mjs answer work 01a RESPONSE_JSON --help-used none`, replacing `RESPONSE_JSON` with your JSON answer; quote strings and arrays for your shell. Read [the contract](CONTRACTS.md) and [unit 01](lessons/01.md), edit `work/engine.mjs`, then check again. Continue through [02](lessons/02.md), [03](lessons/03.md), [04](lessons/04.md), [05](lessons/05.md), [06](lessons/06.md), [07](lessons/07.md), [08](lessons/08.md) and [09](lessons/09.md). Checks are cumulative. You can read every lesson without passing a check.

Each check saves your exact source, assistance declaration and result in a new attempt directory. Each answer is committed before its feedback is printed. Prior attempts remain intact. Public questions/checks are readable; these local records are neither secret tests nor authenticated authorship certificates. If you use hints, a model, another person or supplied code, describe that in `--help-used`.

You need JavaScript ES modules, arrays/Map, exceptions, basic concurrency traces and the previous recoverable-storage course or equivalent. The supplied foundation owns framing, WAL, short writes, recovery and compaction. You do not rebuild those. The shell also supplies schema checking, disk transport, private-write storage, query handles and trace recording; your eight policy methods make the database decisions.

## Preserve and replay your work

```sh
node lab.mjs export work ../advanced-storage-export
```

The destination must be new and outside this course/project. In that exported directory, run `node lab.mjs check work 07 --help-used "export replay"`. This creates a fresh result without rewriting historical passes. Exports include the learner source and attempts, never the separate instructor directory.

Use `node lab.mjs run work SCENARIO.json NEW_RUN_DIRECTORY --help-used none --prediction "your expected outcome"` to run your own transaction schedule after implementing the necessary policies. The scenario format is in the contract. The runner records actual events and a hash-bound manifest. A successful scenario execution is an observation, not a capstone pass.

For an actual wrong snapshot result, the supplied [witness minimizer](WITNESSES.md) removes irrelevant actions and initial versions while preserving the exact failure. Use `minimize`, `show-witness` and `replay-witness`; keep its output inside your project for export. Budget-limited results are explicitly best-so-far.

The [schedule experiment workshop](WORKSHOP.md) adds a prediction-and-observation loop after units 04–06. Create an editable retention or predicate workbook with `node lab.mjs workshop-init work retention work/retention`, compare copies of your own policies, and inspect snapshots, dependencies and deterministic events action by action. Genuine wrong reads feed directly into the existing witness commands. The workshop supplies no completed engine and awards no course pass.

## Limits

The core models concurrent logical clients in one process, with serialized commit publication. It does not establish thread safety, multiple-process writers, remote transactions or power-loss durability. Indexes store historical candidate memberships and rebuild their maps before publication; they are not B-trees. Queries include single-table scans and the bounded two-table equality join described in the contract. Open `index.html` directly in your installed browser for practice and pure-policy checks in units 01, 05, 06 and 07. The reader restores committed responses and policy source when reopened and exports its history. Browser work is separate from `work/engine.mjs`; use the Node route for the complete engine, persistence and final projects. Your JavaScript runs with your ordinary local permissions, not in a security sandbox. The checker subprocess has a 15-second limit; custom scenario execution is trusted local code.

The supplied `runtime/foundation.mjs` and `runtime/disk.mjs` retain verified existing MIT coverage and Free to Learn attribution; see [their notice](runtime/FOUNDATION-NOTICE.md) and complete accompanying license. Original course code uses MIT and original lesson material uses CC BY 4.0; see [License and reuse](LICENSE.md). Existing component notices remain in force.

The final two projects use [PROJECTS.md](PROJECTS.md), `node lab.mjs assess`, and `node lab.mjs transfer`. Keep their run folders inside your project for portable export. Technical references are in [SOURCES.md](SOURCES.md).
