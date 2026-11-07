# Compiler Optimizer

Build a local optimizer for integer kernels, inspect its evidence, and investigate a wrong-result transformation. You implement the analyses and optimization decisions; the supplied runtime executes your IR and checks the proposed edits.

This is a **local development candidate with nine implemented units**. Deterministic author checks are separate from independent course review, browser/accessibility checks and human learning evidence. Nothing here is published on Free to Learn.

## Run locally

Use Node 26.x. Development observed **Node 26.5.1 on macOS arm64**; other operating systems and Node versions are not qualified. No npm install, external service, solver, API key, GPU or model download is needed.

From the extracted course directory:

```sh
node cli.mjs start work
node cli.mjs lesson 01
node cli.mjs question 01a
node cli.mjs answer 01a work YOUR_LETTER --help-used none
node cli.mjs check 01 work --help-used none
```

Edit **work/optimizer.mjs**. The initial TODO failures are intentional and name the required function. `start` refuses an existing destination. Use unit numbers 01 through 09; there is no score gate on reading or later checks. Open `index.html` directly for the offline reading/practice interface; it does not execute learner code. Browser interaction is implemented but **not yet browser-qualified**. Use the tested terminal route if local browser storage is unavailable.

The reader can commit reasoning choices before feedback, preserve attempts locally, export them and merge an earlier export. Its practice history is separate from terminal code history. Export both when using both routes. It refuses to reveal new answer feedback if it cannot save the commitment. Reading does not require storage or an account.

Node runs your code with your normal local permissions. The eight-second owned-worker limit catches accidental nontermination; it is **not a hostile-code sandbox**. Only run code you choose to trust. No learner code or results are automatically transmitted anywhere.

## The cumulative project

| Units | You build | Result |
|---|---|---|
| 01–03 | Observation comparison, dominance, scalar rewrites | Useful scalar optimizer with replayable edit evidence |
| 04–06 | Conditional constants, alias/effect decisions, loop motion | The same optimizer handles branches, memory and supported loops |
| 07–08 | Evidence/cost policy and reduction decisions | Reproducible acceptance/rejection and smaller wrong-result witnesses |
| 09 | A fresh investigation and narrow repair | A portable report and repaired optimizer that retains valid wins |

After unit 03:

```sh
node cli.mjs example scalar calibration.json
node cli.mjs run calibration.json
node cli.mjs optimize work calibration.json scalar --help-used none
```

`optimize` records a report and its selected output program under the new `work/.attempts/<id>/receipt.json`, and prints the result. Use `branch`, `memory` or `loop` examples with the corresponding `constants`, `memory` or `loops` pass. The ordinary product route checks evidence independently before adopting a result. Add `--learner-policy` after unit 07 to apply your policy as well.

Compare pass orders with `node cli.mjs pipeline work calibration.json scalar,constants --learner-policy --help-used none`. Its receipt preserves accepted and rejected stage candidates plus an aggregate check. The scalar example declares all 256 i8 inputs through a finite-domain manifest; the generated list and coverage remain explicit.

## Keep and restore your work

```sh
node cli.mjs status work
node cli.mjs export work my-optimizer.json
node cli.mjs restore my-optimizer.json restored-work
node cli.mjs check 03 restored-work --help-used "restored my own work"
```

Every check snapshots your exact implementation and supplied dependencies before execution. Practice records the original question and committed answer before revealing feedback. First attempts, later revisions, actual help and failed results remain separate. Status labels a receipt historical after source or course changes. These editable local records are not credentials.

Export includes current code, dependencies and the preserved source/question/result history. Restore requires the matching course identity and a new destination. Export refuses to overwrite a file and stops above 16 MiB rather than dropping history; keep earlier exports and the original work directory if the limit is reached. No automatic migration or destructive reset is provided.

Exit 0 means the requested check/adoption succeeded; 1 means a criterion failed or a candidate was retained; 2 means invalid invocation or file/format failure; 3 means learner module execution failed or timed out. A program's defined bounds trap is an observation, not a CLI crash.

## Scope and evidence

Read [API.md](API.md) for exact Kernel IR v1 behavior and interfaces, and [RUBRIC.md](RUBRIC.md) before the final investigation. The instruction set has fixed-width integers, typed arrays and explicit effects. It has no frontend, LLVM compatibility, floating point, native code generation or universal-correctness guarantee.

Short mechanism readings accompany substantial coding and investigation. Their length is a deliberate prototype choice; reading and project times have not been measured. The public checker is a learning tool with inspectable cases, not a hidden exam. Independent held-out measurement and human tryouts remain pending.

Author solutions, alternative controls, development evidence and packaging scripts are excluded from the learner ZIP. [NOTICE.md](NOTICE.md) records source provenance.
