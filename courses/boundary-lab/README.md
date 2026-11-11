# Build a boundary you can defend

This runnable **portable-core slice** accompanies Low-Level Sandbox Security. You repair the security decisions in a tiny image-filter plugin host. The supplied app already knows how to execute bytecode and display test results. Your work is to decide what it may execute, access and change.

This is a teaching model, not a production sandbox. Guest programs are tiny bytecode capsules. Everything currently runs inside one ordinary process. **Linux syscall/process confinement is not implemented or tested.** Do not run downloaded native programs or use real secrets. All fixtures contain original synthetic bytes.

## Start

Requires an existing Rust/Cargo toolchain and Python 3.12+; tested here with Rust/Cargo 1.97.1 and Python 3.14.6 on macOS arm64. The project has no external Cargo dependencies. No installation or network connection is part of these commands.

Start in a fresh directory containing `sandbox-model.zip`, with no existing `boundary-lab` subdirectory. The archive extracts to `boundary-lab/`. If you have already extracted it, enter that directory and start with the first `cargo` command below.

```sh
python3 -m zipfile -e sandbox-model.zip .
cd boundary-lab
cargo run --offline -- status
cargo run --offline -- demo
python3 run.py check core --attempt attempts/first \
  --prediction "The image will work, but at least one boundary will fail."
```

The initial demo succeeds and the security checks fail intentionally. Read the expected and observed behavior before editing. An exit code of 1 from the initial checks means the starter still violates public requirements; it is not a broken installation. Code 2 from `native` means the required native profile is unavailable. An unknown command uses 64.

The attempt runner snapshots your actual source and prediction **before** compiling. It records output, exit status, source and binary hashes in a new directory. It refuses an existing attempt directory. Use a different name after a repair and `--parent-attempt first` to link the revision. `--help-used` takes a text argument, for example `--help-used "read the public API types"`; it is not a boolean switch. Omit it when there was no assistance (the recorded default is `none`). Keep your explanation beside those files; a pass is not a substitute for an argument.

The runner also compares supplied scaffold files with `scaffold-manifest.json` and refuses accidental changes to the checks or runtime. Only `src/learner.rs` is the intended edit surface. This local manifest is not tamper-proof certification; a reviewer must compare the package and receipt with the known original when assessing work. Keep your own additional tests separate from the required checks. The capture runner is currently qualified only for POSIX hosts.

## Your work

Edit only `src/learner.rs` for the core exercises. The public argument types and enums are declared in [`src/model.rs`](src/model.rs); read them alongside the policy signatures when you need exact field names. That file also contains supplied type/default helpers, not a reference policy to copy. For the delayed-operation driver named in module 8, its public event and function declarations are in [`src/schedule.rs`](src/schedule.rs). Keep those files unchanged and retain any source-reading assistance in your attempt record. Its deliberately wrong policies cover admission, complete memory ranges, capability authorization, modeled syscall/seal decisions, resource accounting and delayed-operation authorization. The remaining Rust files supply the machine, canonical decoder, safe physical guards, synthetic filters, deterministic queue and public checks. Do not remove those guards or change expected results to obtain a pass.

The model uses eight u32 registers and at most 64 KiB guest memory. ADD wraps as u32 arithmetic; memory-range calculations must meet the mathematical contract rather than accidentally inherit that wrap. A handle combines a 16-bit generation with a 16-bit slot. The trusted job is an argument supplied by the broker; the request's `claimed_job` is untrusted.

## Learning sequence

1. [State the promises](lessons/01-promises.md)
2. [Admit only programs you understand](lessons/02-admission.md)
3. [Keep guest memory inside its world](lessons/03-memory.md)
4. [Make authority explicit](lessons/04-authority.md)
5. [Seal the OS boundary — practical portion unavailable](lessons/05-native.md)
6. [Bound work and make failure precise](lessons/06-budgets.md)
7. [Break, repair and defend](lessons/07-investigation.md)
8. [Transfer: delayed authority](lessons/08-transfer.md)

These are cumulative module slices with practice and evidence requirements, not a claim that all 24 planned full lessons or the complete course have been delivered. Module 5 includes runnable pure policy-model decisions and an explicit native practical hold. All portable exercises can be explored without a Linux environment.

```sh
python3 run.py check memory --attempt attempts/memory-01 \
  --prediction "State the exact failing family you expect and why."
python3 run.py check authority --attempt attempts/authority-01 \
  --prediction "State which actor determines the job identity."
cargo run --offline -- check all
cargo run --offline -- native
```

Available practice groups: `admission`, `memory`, `authority`, `syscall` (model only), `budget`, `runtime`, `wire`, `transfer`, `core` (all except transfer), and `all`. All 84 test cases in this package are public, including ten transfer cases. Final independent schedules, instructor solutions and grading controls are not in the learner export.

## Evidence and completion

For each repaired policy, retain: original prediction; exact initial result; revised source; reason the boundary failed; a useful positive control; a negative control; and the scope of your conclusion. Mark help honestly. The runtime's emergency stop and physical arena checks are supplied safety backstops; hitting one does not count as your security policy working.

The portable project is successful when all public checks pass **and** your report defends the five policy decisions on fresh cases. The full course additionally requires qualified Linux confinement, independent review, real learner trials and live Free to Learn delivery. None of those follows from a green portable test run.

## Source and rights

The runtime, filters, fixtures and instructional slice were originally authored for this project. No RE/Memory Corruption source or book material was copied. Public background references are linked in the lessons. Redistribution licensing for the future public course is still an owner decision; this local export is not a publication authorization.
