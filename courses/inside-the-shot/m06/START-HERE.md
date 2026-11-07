# M6 — one behavior, two compiled forms

Your goal is to explain the same native calculation in two very different listings. Deliver one Python model, a correspondence map, and a counterexample to an assumption that instruction shape equals source shape. The programs are original local toys. Only macOS ARM64 is tested; [setup.md](setup.md) identifies the tools and recovery steps. This milestone is implemented for review, not accepted as evidence of human learning.

You need M1's predict/probe/revise routine, M2's `w0` argument/return and stack vocabulary, and Python functions, comparisons and exceptions. M3–5 are not required for these files. If you cannot trace a load, arithmetic instruction and return yet, revisit M1/M2 first. A **behavioral model** predicts outputs from inputs; a **correspondence map** links values with the same role across listings. Neither has to reproduce the author's source spelling. This is a terminal/editor investigation; no Ghidra installation is required for the delivered route.

Plan two sittings with a break after P2; there is no timer. Your first useful artifact is a saved prediction. Read only the linked feedback for the current exercise. Navigation remains open.

## P0 — save a prediction

For the small fee example, begin with `amount + 4`. If `urgent` is nonzero, add 3 more; otherwise keep that amount. Nonzero means any value except zero, including negative values. This rule is supplied so you can predict a result before checking how the two builds compute it. It does not describe the larger `quote` investigation.

Follow setup, then edit `response.json` in your editor. Keep it valid JSON: strings use double quotes and there are no trailing commas. Replace the claim/reason; set `arguments` to `[5, 1]` (amount 5, urgent 1) and calculate `predicted_result` using the rule above. Explain your arithmetic and any uncertainty. Save it before running either fee program or opening the next page:

```sh
python3 notebook.py record --workspace work/m06 --stage prediction --response response.json --manifest manifest.json --assistance none
```

Each save creates a new file. Edit the response for the next event; never edit old records. The records contain the actual question and lesson text, target manifest, response, assistance and optional source snapshot. `none` means no extra help beyond the assigned teaching. Hints, checker output, answer pages, source or another person's solution must be disclosed. Use `--assistance hint-1`, `hint-2`, `hint-3`, `example-feedback`, `checker` or `solution`; every assisted response must include a nonempty `assistance_details` describing exactly what you saw. If several apply, use the strongest and describe all. Copying source or a checker-aided revision cannot become an unaided first attempt.

## P1 — compare a smaller calculation

Do [worked-example.md](worked-example.md), including its completion and separate practice. Save each answer before opening its feedback. Its function has two inputs and one optional adjustment; the main investigation adds interacting conditions and limits. The worked example solves only its own function.

## P2 — infer and implement one model

The supplied entry facts are: `quote-O0` and `quote-O2` are built from the same C source with different optimization settings. Each accepts `UNITS COUPON RUSH`, all integers in -100..100, and prints one JSON `result`. `O0` means no requested optimization; `O2` requests compiler optimizations. Function arguments enter `w0`, `w1`, `w2` and the result leaves in `w0`. The omitted CLI wrapper validates/prints; the listing covers only `_quote`. These are supplied facts, not claims you must infer from an omitted `main`.

Before running either build, save two competing explanations for what a coupon or rush input might do. Choose a first argument triple and predict its output under both explanations. Use the P0 command with stage `prediction`. The commands below illustrate the triple `8 1 0`; replace it with your saved triple in both commands:

```sh
./quote-O0 8 1 0
./quote-O2 8 1 0
```

Save a second record with both actual results beside your predictions. Explain which observations agree or disagree with each explanation. Now choose paired probes: change one input while holding the other two fixed. Include all the following pairs, predicting each pair before running it. Enter each row as two separate commands in the form above; do not paste parenthesized tuples into a shell.

| Compare argument triples | Question it distinguishes |
| --- | --- |
| `-1 0 0` / `0 0 0` | How does a negative unit count behave? |
| `7 1 0` / `8 1 0` | Is coupon behavior uniform over units? |
| `8 -1 0` / `8 0 0` | Is negative coupon the same as positive? |
| `8 0 0` / `8 1 0` | Does a positive coupon matter here? |
| `8 0 -1` / `8 0 1` | Does rush depend on sign or nonzero value? |
| `23 0 1` / `24 0 1` | Does growth remain linear? |
| `39 1 0` / `40 1 0` | What can a saturated result hide? |
| `40 1 0` / `41 1 0` | Does this alone establish an input limit? |

The last two equal outputs cannot establish which internal value stopped growing. Trace the listing as well. Keep a table with input, prediction, both outputs and the interpretation. Add your own pair when two explanations still fit. At each pair's resolution save the result and the rule it supports or contradicts. Distinguish observed finite cases from your generalized rule.

Open `quote-O0.asm` and `quote-O2.asm` side by side in your editor. Addresses are hexadecimal identifiers in this build, not timestamps or execution order for skipped branches. Read each instruction's value, not just its register name. Use the instruction reference below and the smaller example. Implement `model(units, coupon, rush)` in `model.py`: return an actual Python `int`; reject booleans, non-integers and values outside -100..100 with `ValueError`. Keep this a pure computation: no native calls, files or stored answers. Save the first code before testing:

```sh
python3 notebook.py record --workspace work/m06 --stage model --response response.json --manifest manifest.json --assistance none --artifact model.py
python3 check_model.py model.py --seed 61
```

A stopped check (exit 2) means setup, syntax or an unfinished starter needs attention. A mismatch (exit 1) supplies arguments and both native results: save this as checker assistance before repairing. Change one inferred rule at a time, save each revision with `--assistance checker` and descriptive details, then rerun. Exit 0 means sampled behavior agrees; it does not approve your explanation. Public probe values, checker source and feedback are visible assistance, not a secure exam. The checker calls the native programs for expected results; it does not contain their authored formula.

## P3 — defend the correspondence

Complete `report.md`. For every phase requested in its map give addresses from both listings, a concrete value trace and why the conditions agree. Cover input handling, base arithmetic, optional adjustments, final limit and return. State where a named value disappears or is combined with another. Use `8 1 -1` for one complete trace; include an out-of-range-for-your-inferred-internal-limit value and a negative input as separate traces. All remain within the CLI's -100..100 domain.

Show one register with two different meanings at two addresses. Then state and refute a specific claim about source spelling, register identity or visible branch count. Your evidence must include actual outputs and addresses from both main-task listings. Merely saying “optimization changes things” is not a counterexample. Reuse the lesson's reasoning method, not its fee-example answer. Save your report:

```sh
python3 notebook.py record --workspace work/m06 --stage comparison --response response.json --manifest manifest.json --assistance checker --artifact report.md
```

Use the assistance category you actually used and fill in its details first. [hints.md](hints.md) has three optional levels. They are not required. Ask a reviewer to assess the map and reasoning separately from your passing model, using the criteria in `report.md`.

## P4 — test a fresh claim and hand off

After your last feedback, choose a new triple outside the probe table and never previously run. Mix signs/flags or a region where two effects interact. Save its predicted result and a reason with stage `handoff`, plus `--artifact model.py`. Only then run both native builds for that triple. Save a later result record: does it support the rule, require repair, or leave two explanations? If repaired, choose another fresh triple. Run a second checker seed to vary its public probes:

```sh
python3 check_model.py model.py --seed 6201
python3 notebook.py list --workspace work/m06
```

Keep the whole extracted folder together, including `work/m06`, `report.md` and `model.py`. From its parent folder, copy it to a NEW name for export and again for resume; do not reuse an existing destination. Open a terminal in the resumed folder. Rerun `notebook.py list`, inspect an old record's question/code, then add a new handoff save. Earlier UUID files must retain their hashes; compute `shasum -a 256 work/m06/*.json` before copying and compare the old filenames after resume. The new record is additional. If a save fails, earlier records remain; fix the new response/path and retry. Do not delete your failure history.

Your handoff contains one model, your report, observations and all original/revised records. Note platform limits, untested cases, help used and uncertainty about original source spelling. A full input-space proof, another compiler/architecture and Ghidra GUI work are outside this route.

## Instruction reference for these files

`wN` is the low 32 bits of ARM64 register `xN`; integers here fit without overflow. `sp` points at a function's stack storage. `str` stores, `ldr` loads, `mov` copies/sets, and `ret` returns. `wzr` always reads zero. A destination overwrites its previous value. Hex `0x28` is decimal 40; `0xc8` is 200.

- `cmp a,b` sets flags from a-b. `subs d,a,b` also keeps the result in d.
- `b.lt`, `b.le`, `b.gt` branch if signed less, less-or-equal, or greater.
- `cbz a,label` branches if a is zero.
- `tbz a,#31,label` branches if bit 31 is zero (nonnegative 32-bit signed input).
- `csel d,a,b,cond` chooses a when the condition holds, otherwise b; no jump.
- `ccmp a,b,#4,gt` compares a-b if previous flags say signed greater; otherwise it sets NZCV to 0100 (zero true, signed greater false). NZCV names the negative, zero, carry and overflow condition flags.
- `bic d,a,a,asr #31` clears a's bits wherever its sign-extended sign mask is 1: negative becomes 0, nonnegative stays a.
- `madd d,a,b,c` computes d = a*b+c.
- `lsl d,a,#1` shifts left one bit; here it doubles a without overflow.
- `lo` means unsigned lower; `eq` means equal. Prove nonnegativity before equating unsigned and signed order.

Use [setup.md](setup.md) for missing files, execution refusal, version mismatch and safe restart. Keep all targets with their own manifest; mixing archives invalidates address evidence.
