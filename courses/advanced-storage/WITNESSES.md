# Reduce a failing schedule without changing the failure

The supplied minimizer helps you explain a wrong snapshot result. It uses the exact learner policy saved in a recorded run, even if you have since repaired `work/engine.mjs`. It never edits the original run or your current policy. A failure of the learner policy is not evidence that the supplied repaired engine is broken.

After recording a genuine failing run with `lab.mjs run`, use a new sibling directory inside your project:

```sh
node lab.mjs minimize work/runs/broken work/witnesses/first --seed 7 --budget 80 --help-used none
node lab.mjs show-witness work/witnesses/first
node lab.mjs replay-witness work/witnesses/first --help-used none
```

`show-witness` prints the expected and observed result, the reduced action trace with original indices, and removed action/data indices. The same explanation is saved as `witness.md`. The execution traces are `original/results.json` and `reduced/results.json`. This is a terminal/Markdown feature; no browser execution or phone preview is claimed.

## What counts as the same failure

The input must be a complete recorded run with `engine.mjs`, `scenario.json`, `results.json` and `manifest.json`. Source, scenario, result and runtime identities are checked before the search. Two fresh, seeded processes must reproduce the recorded execution and a mismatch against the existing copied-map snapshot oracle. A passing run, syntax error, invalid transaction schedule, stale result, timeout or resource refusal is not a semantic witness.

The target is the **first snapshot mismatch**: its original action index, mismatch kind, exact expected value and exact observed value. Every accepted candidate must preserve all four, under the same source, seed and isolation mode, and reproduce identically twice. A new earlier mismatch is a different failure and is rejected. This deliberately conservative signature can retain more data than a looser, domain-specific equivalence would.

The current oracle covers point reads, scans, iterator pulls and supplied join results. It does not prove general serializability, minimize arbitrary exceptions, or recognize every application invariant. Use it for the observation defect that unit 08 already asks you to preserve.

## Search and limits

The search removes whole transaction groups, chunks and individual actions, and initial version records. It retains the target action, preserves execution order, and does not shorten strings, rename aliases, change predicates or rewrite row values. Progress is measured as fewer actions and/or fewer initial versions, never fewer JSON bytes. Invalid candidates are discarded without becoming the new witness.

The default budget is 80 fresh-process replays and 10 seconds. `--budget` accepts 2–200; `--max-ms` accepts 100–30000. Each replay has a 750 ms limit. The seed is an unsigned 32-bit integer. It chooses deletion order and fixes `Math.random` inside replay; the original run must still match. Source using clocks, external state or other nondeterminism may be rejected. No network or external service is needed, and learner code still runs with your local permissions.

This tool accepts at most 96 actions, 128 initial versions, 64 KiB of self-contained policy source and 128 KiB of scenario JSON. Relative source imports are unsupported, consistent with the recorded-run contract. A replay result is limited to 1 MiB; a completed witness bundle to 3 MiB. Larger course schedules remain runnable but must be narrowed explicitly before this bounded tool can process them.

`best-so-far` means a replay/time budget ended. Its preserved failure is verified, but the witness is not claimed irreducible. `locally-irreducible` means the search reached a fixed point for the tested single-action, single-version and transaction-group deletions. It is never a claim of global shortest length or a proof that every remaining operation causes the defect. Read `search.json` for attempted removals, rejection categories and budget use.

## Export, import and repair

Keep the witness under `work/`. The existing `export` command copies the original run, both witness traces, exact saved policy, seed, mappings, signature and tool/runtime identities. Import by extracting/copying that exported course to a new directory, then run `replay-witness work/witnesses/first --help-used "import replay"`. Replay checks content hashes and the deletion mapping before running both cases. A stale tool/runtime or edited file requires an explicit new run; old evidence is never silently relabeled current.

Use the smaller trace to formulate your causal explanation, then repair your policy and replay the **full original scenario**. The reduced witness does not replace unit 08's composed-mechanism checks, same-scenario repair or genuinely different schedule variation. Keep the failing source and witness as evidence rather than overwriting them with a passing implementation.
