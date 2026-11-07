# Firmware Evidence Lab — learner-parser milestone 0.3.1

**Build the parser → inventory components → map dependencies → investigate changes.**

This finite milestone extends the accepted 0.2 working slice. You now implement
three core functions in `parser.py` and two analysis functions in `analysis.py`.
The selected parser really drives the CLI and investigation; there is no supplied
parser fallback and no reference solution inside this learner package.

This is **not the complete seven-milestone course**. EDUFW1 is our original inert
teaching format: **not UEFI, not bootable, not production firmware**. All payloads
are descriptions or JSON, never executed. No flashing, malware, persistence,
evasion, credentials, private keys, downloads or external services are involved.

## Requirements and boundaries

- Python 3.10+ language features, standard library, terminal and writable directory.
  No pip packages or elevated privileges. Tested only on Linux x86-64/Python
  3.12.14; other Python versions, macOS, Windows and BSD are unverified.
- After receiving this package and an existing interpreter, every mandatory step
  is local/offline. The example commands use `python3`.
- Run from the unpacked folder containing `fwlab.py`.
- Selected Python submissions execute as ordinary local code. This is **not a
  sandbox** for running somebody else's untrusted submission.
- Hashes check consistency, **not authenticated origin**. Signatures, certificates,
  trusted roots and measured-boot correlation remain pending course stages.

## 1. Preserve a first attempt

```sh
python3 -m unittest discover -s checks -v
python3 tools/attempt.py 001-first
python3 checks/check_parser.py --parser attempts/001-first/parser.py > attempts/001-first/parser-check.json
```

The supplied scaffold suite should pass **5 tests**. The parser checker should
exit **1** because all three starter functions are TODOs. Keep that first failure.
The attempt contains both sources, a help log and initial source hashes.

```sh
python3 tools/attempt.py 002-parser --from-file attempts/001-first/analysis.py --parser-from attempts/001-first/parser.py
```

Read [Build a bounded parser and component map](lessons/00-build-parser-and-map.md)
and [FORMAT.md](FORMAT.md). Implement in `attempts/002-parser/parser.py`:

1. `parse_container(data)` — validate byte layout; return the supplied data classes.
2. `component_inventory(container)` — compute evidence for every component.
3. `map_dependencies(components)` — find missing nodes/cycles and a valid ordering.

The starter docstrings define exact return values and error behavior. Checks are
open learning aids, not secret exams. Do not change tests or fixture bytes to get
a pass. Each failed case names the contract that needs work.

```sh
python3 checks/check_parser.py --parser attempts/002-parser/parser.py > attempts/002-parser/parser-check.json
```

Success is exit **0**, `status: pass`, **49/49**. The checker tests independently
permuted table/payload layouts, unfamiliar names, size/count boundaries, malformed
ranges, safe labels, mismatched hashes, missing dependencies and cycles. It accepts
**any valid dependency-first order**, not one memorized reference ordering.

## 2. Run your parser on actual files

```sh
python3 fwlab.py inspect fixtures/release-1.efw --manifest fixtures/release-1.json --policy fixtures/policy.json --parser attempts/002-parser/parser.py > attempts/002-parser/intake.json
python3 fwlab.py extract fixtures/release-1.efw extracted-release-1 --parser attempts/002-parser/parser.py
```

The inventory and dependency graph come from **your selected source**. Inspect
records its SHA-256. Extraction writes data only into a new directory, rejecting
existing output, symlinked ancestors, unsafe/duplicate names and mismatched
component hashes. It retains a second name check even if your parser is wrong.
Read the text/JSON files; do not execute them or treat extraction as verification
of origin. Use another unused destination name on repeat runs.

`inspect` exits 0 when supplied checks find no inconsistency, **3** for
hash/manifest/local-policy findings, and **2** for malformed data or an operation
error. Exit 0 does **not** mean authenticated, approved, benign or safe to flash.
Absent manifest/policy checks are not positive evidence. Omitting `--parser` fails
rather than silently using a reference.

## 3. Add the change investigation

```sh
python3 tools/attempt.py 003-analysis --from-file attempts/002-parser/analysis.py --parser-from attempts/002-parser/parser.py
```

Keep the implemented parser, then build `compare_components` and
`summarize_trust` in the new `analysis.py`. Read
[Evidence and change](lessons/01-evidence-and-change.md).

```sh
python3 checks/check_submission.py --analysis attempts/003-analysis/analysis.py --parser attempts/003-analysis/parser.py > attempts/003-analysis/analysis-check.json
python3 fwlab.py investigate fixtures/release-1.efw fixtures/release-2-observed.efw --old-manifest fixtures/release-1.json --new-manifest fixtures/release-2-observed.json --policy fixtures/policy.json --analysis attempts/003-analysis/analysis.py --parser attempts/003-analysis/parser.py > attempts/003-analysis/investigation.json
```

The analysis checker expects **31/31**, exit 0. Investigation output binds both
selected sources and both container hashes. Its exit 0 means analysis ran—not
that its output is correct; rerun the checkers after changes.

## 4. Unfamiliar-input investigation bridge

Follow [the case brief](fixtures/case-study/BRIEF.md), without first reading the
integration check's expected results. The captures use new names, independently
reordered tables/payloads, mixed changes and an incomplete capture. Write your
facts, hypotheses and unknowns before checking:

```sh
python3 checks/check_investigation.py --parser attempts/003-analysis/parser.py --analysis attempts/003-analysis/analysis.py > attempts/003-analysis/case-check.json
```

This integration check expects **6/6** and includes a changed release-floor
requirement. It checks computed results, **not the quality of your written
reasoning**. Use [the rubric](rubric.md), retain original findings, and put revised
work in a fresh numbered attempt. This is a capstone-progression exercise, not the
full-course independent capstone or proof of competence.

## Attempts, help and restore

Every new attempt uses a new name. Record help in that attempt's `help.json`.
Both sources are loaded afresh; a stale saved pass cannot substitute for execution.
To restore both TODO starters without erasing anything:

```sh
python3 tools/attempt.py 004-restored
```

This is explicit file-copy history, not a hosted attempt UI. No LLM or staffed
feedback is required; the rubric contains an optional learner-owned critique prompt.

## Supplied versus built; stopping point

**You build:** binary parser/layout checks, inventory, dependency graph, change
classifier, evidence summary, investigation and changed-policy explanation.

**Supplied:** immutable data-class contract and format constants, bounded file I/O,
strict JSON/manifest/policy checks, defensive extraction, CLI wiring, original
inert fixtures, tests and copy-based attempts. Hash convenience properties do not
replace the learner's inventory or confer authenticity.

**Not delivered:** complete seven-unit course, signature/certificate/root
verification, measured-boot/log correlation, real firmware execution, full final
capstone, other-platform validation, served download or publication. The graph
is a manifest declaration, not an observed hardware boot chain.
