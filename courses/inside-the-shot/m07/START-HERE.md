# Defend the reservation investigation

Goal: deliver a reproducible decoder and replay model with evidence for its claims and limits. The useful result is an explanation another person can challenge and rerun. Neither a checker pass nor a confident sentence supplies that explanation.

## 1. Frame the question before running the target

Complete setup and the separate count example first. This investigation supplies native programs and listings, not C source. All three programs read the same file family. A valid file starts a state with `free`, four `held` slots and `delivered`; each reported event has `accepted` plus a state snapshot. `final` is the published state and `committed` is a boolean. An event snapshot and the final state may differ. These field names are supplied interface facts, not the answer about when or how they change.

The file is at most 72 bytes with at most 16 entries. Quantities are nonnegative and at most 64 on input; operation codes are 1..4, slot labels 0..4. Some combinations are well-formed but rejected during replay. The native parser validates the complete file before producing any event. The exact layout and operation effects are yours to investigate. No unsafe input or unbounded allocation is needed.

Write two competing hypotheses in `response.json`. For example, a rejected entry might leave state unchanged, end the sequence, or invalidate the whole sequence. Select two you can distinguish; do not assert one as fact yet. Predict both the state and event count for your first probe. Save before running it:

```sh
python3 notebook.py record --workspace work/m07 --stage hypotheses --response response.json --manifest manifest.json --assistance none
```

Use your actual assistance on every save. Choices are `none`, `hint-1` through `hint-3`, `transfer-hint-1` through `transfer-hint-3`, `checker`, `solution`, or `other`. Every non-none choice requires nonempty `assistance_details`, including material, level and what it revealed. Feedback from earlier checks still counts when making a later prediction. If more than one source helped, select the most revealing category and list all sources in details.

## 2. Make files and choose discriminating probes

Create the initial probe folder and two supplied starting files. These bytes are specimens, not an annotated format. The first has no entries; the second has three. Predict their outputs before invoking the executable. The Python helper writes bytes but does not run the target.

```sh
mkdir probes
python3 write_hex.py --hex '52 53 4c 31 08 00 00 00' --out probes/empty.bin
python3 write_hex.py --hex '52 53 4c 31 08 00 03 00 01 01 03 00 01 02 06 00 03 01 00 00' --out probes/sequence.bin
python3 notebook.py record --workspace work/m07 --stage probes --response response.json --manifest manifest.json --assistance none --evidence probes/empty.bin --evidence probes/sequence.bin
./reserve probes/empty.bin
./reserve probes/sequence.bin
```

Copy exact outputs into your response alongside the saved predictions. Identify the first observation that separates your hypotheses; if neither predicts it, retain both failures and propose another explanation. Do not overwrite the first save. `--evidence` copies raw bytes and hashes into the new record; a command string alone does not preserve its input.

Now choose at least six additional probes, predicting each before execution. Include one change at a time, an entry repeated against the same slot, equal-to-available versus one-too-large, a zero amount, a changed operation code, and an operation after a rejection. Keep four slots distinct rather than treating all held quantities as one bucket. Add a truncated file and a file with a trailing byte to separate parser refusal from a rejected event. You can write whole hex strings or use the supplied mutation command:

```sh
python3 write_hex.py --source probes/sequence.bin --offset 10 --value 2 --out probes/changed.bin
./reserve probes/changed.bin
```

The example mutation is a tool demonstration, not a required discriminating case. Explain what byte 10 means under your hypothesis before using it. Mutation preserves byte length, so a count change may make a file malformed rather than create an extra entry. Use a new filename for every variant. Keep the number of files used by the public checker to 24 or fewer, each ending `.bin` and at most 73 bytes.

After each small probe group, save `--stage probes` with each cited `--evidence FILE`. Record both unexpected outputs and explanations you rejected. A text editor may show binary bytes badly; inspect your file safely with:

```sh
python3 -c "from pathlib import Path; print(Path('probes/sequence.bin').read_bytes().hex(' '))"
```

Hex output is reversible; screenshots alone are not a reproducible input. [hints.md](hints.md) offers three levels if probe selection stalls. Opening one changes assistance, not your first record.

## 3. Connect the bytes to the calls

Open `reserve.asm`. Only `decode_record`, `apply_record` and `replay` are listed. Supplied setup: main bounds the file, validates its header and all entries, initializes a state, calls replay, and prints the result. Its file operations and validation are not visible in these focused listings; do not invent addresses for main.

On this ARM64 build, replay receives state address in `x0`, the first entry address in `x1`, count in `w2`, mode flag in `w3` and event-array address in `x4`. `decode_record` takes an entry address in `x0` and returns the small decoded record in the low 32 bits of `x0` (`w0`). `apply_record` receives state address in `x0`, record bits in the low 32 bits of `x1`, and returns accepted/rejected as integer `w0`. This register assignment is supplied calling-convention scaffolding. The main function supplies the mode value, which is absent from the focused listing; the listing shows the conditional mechanism, while probes distinguish the selected policy. Infer which values the instructions implement.

`xN` is a 64-bit register; `wN` its low 32-bit view. `sp` is the current stack address; `x29` is this function's frame reference. A callee has its own stack storage, so equal stack offsets in two functions are different locations. A record or state pointer must be followed through saved and reloaded registers; a stack displacement is not a file offset.

| Notation in these listings | Meaning to use in your trace |
| --- | --- |
| `ldrb`, `ldrh`, `ldr wN` | Load 1, 2, or 4 bytes; byte/halfword loads zero-extend |
| `strb`, `strh`, `str wN` | Store the low 1, 2, or 4 bytes |
| `ldr/str xN`, `ldur/stur xN` | Load/store 8 bytes |
| `ldur/stur wN` | Load/store 4 bytes |
| `ldr/str qN`, `ldur/stur qN` | Copy 16 bytes; this may be a state copy, not arithmetic |
| `orr ..., lsl #8` | Shift one value eight bits then combine bits |
| `subs`, `cmp`, `cbz`, `cbnz` | Compare/subtract, or branch on zero/nonzero |
| `b.ls`, `b.hs` | Unsigned lower-or-same / higher-or-same branch |
| `bl`, `ret` | Call and return; inspect the returned value and its consumer |
| `[xN, xM, lsl #2]` | Address xN plus four times xM; explain the selected array element |

`ldur` and `stur` use **unscaled addressing**: the displacement is a number of bytes and can be negative. Their access width still follows the register: `w` means 4 bytes, `x` means 8, and `q` means 16. The mnemonic alone does not tell you the width.

Three more instructions connect the entries to their output positions. These examples use unrelated toy values, not the reservation rule. A destination is the register written; source registers supply values read before that write.

| Instruction | Operand/value example |
| --- | --- |
| `umull x9, w9, w10` | Multiply unsigned 32-bit sources into a 64-bit result. With old `w9=12`, `w10=3`, new `x9=36`. The destination can share a source's register number. |
| `umaddl x9, w8, w9, x11` | Multiply the two unsigned 32-bit sources, then add the 64-bit final source. With `w8=12`, old `w9=3`, `x11=1000`, new `x9=1036`. This can combine an index, stride and base address; identify them from the caller's values. |
| `cset w8, ne` | Write 1 when the most recent condition flags say “not equal,” otherwise 0. After comparing 3 with 0 it writes 1; after comparing 0 with 0 it writes 0. It does not branch. |

**Condition flags** retain information from a flag-setting instruction such as `subs` or `cmp`. The zero flag, **Z**, is 1 when that instruction's result is zero. `eq` tests Z=1; `ne` tests Z=0. `cset` reads these flags rather than comparing its destination's old value. Ordinary loads, stores and moves do not replace these flags. In `reserve.asm`, locate `umull` at `0x100000c70`, `umaddl` at `0x100000c84` and `cset ... ne` at `0x100000d18`. Follow each one's actual inputs and flag producer rather than copying the toy values. The [Arm multiply-add description](https://www.scs.stanford.edu/~zyedidia/arm64/umaddl.html) and [conditional-set description](https://www.scs.stanford.edu/~zyedidia/arm64/cset_csinc.html) are optional reference material, reproduced from Arm's ISA text; the local route does not require opening them.

Build four traces in `instruction_evidence`, quoting addresses from your actual listing and giving values for one saved probe: (1) entry pointer to decoded fields, including byte order; (2) caller's record bits and state pointer reaching apply_record; (3) one acceptance and one rejection path, including whether stores happen; (4) returned acceptance entering the event and influencing final-state publication. Name evidence versus supplied setup explicitly. The listing uses hex constants (`#0x40` is 64). A branch count or register name alone cannot justify a source type or a state rule.

The key distinction from earlier record work: the bytes on disk, temporary decoded-record bits and in-memory state are three different layouts. Draw them separately. Your file decoder should follow the file layout, not stack offsets used to pass a small record by value.

## 4. Implement, preserve, then check

Edit `investigation.py`. `decode(raw)` takes only Python `bytes`, validates all syntax and returns exactly `{'initial': int, 'records': [{'op': int, 'slot': int, 'amount': int}, ...]}`. `analyze(raw, mode='individual')` returns exactly the native JSON structure with Python booleans. It supports mode `individual` or `atomic`; unknown modes and malformed/non-bytes input raise `ValueError`. Do not invoke the native program, read files or retain state inside either function. The model must explain arbitrary valid input, not memorize your probe results. The unchanged starter raises `NotImplementedError` deliberately.

Preserve your first implementation and format/state explanation before running the checker:

```sh
python3 -m py_compile investigation.py
python3 notebook.py record --workspace work/m07 --stage model --response response.json --manifest manifest.json --assistance none --artifact investigation.py --evidence probes/sequence.bin
python3 check_model.py investigation.py --corpus probes --target individual --seed 20261018
```

The checker compares your model with the native program on your files and finite seeded mutations, plus malformed/non-bytes controls. It needs at least one accepted and one rejected event across the resulting cases. It tests decoder shape, count and bounds, but cannot independently prove the isolated decoded fields: the binary exposes effects, not field labels. Private assessment checks that too. Its output and source can reveal evidence; retain the first attempt beforehand and label subsequent work accurately. It executes your Python locally and is not a secure exam sandbox.

On failure, save the exact offending bytes, expected/observed result and false assumption. Repair the smallest supported part, add a regression probe, then save `--stage repair --assistance checker` with details and code before rerunning. A hash mismatch means the target changed: preserve the error and extract the original archive into a new folder. It is not evidence for a different transition rule. If your first implementation passes, challenge a plausible alternative and save its counterexample rather than inventing a repair. [checkpoint.md](checkpoint.md) states the evidence needed at this pause.

## 5. Transfer the transaction boundary and compiled form

Do not run `reserve-atomic` until you save a prediction. Create `probes/transfer.bin` using your inferred layout: choose accepted, rejected, then later accepted entries whose two candidate final states differ. A sequence that returns to its initial state cannot distinguish those policies. Predict every event snapshot and final state under at least two candidate commit policies, and explain which observation separates them. Save code and input:

```sh
python3 notebook.py record --workspace work/m07 --stage transfer --response response.json --manifest manifest.json --assistance checker --artifact investigation.py --evidence probes/transfer.bin
./reserve-atomic probes/transfer.bin
```

Compare event snapshots with `final`: a printed intermediate state need not be a committed state. Read `reserve-atomic.asm`, trace the mode flag and publication branch, then implement or revise `mode='atomic'`. Include an all-accepted log and an empty log so a model that always resets final state cannot pass. [transfer-hints.md](transfer-hints.md) is optional and uses its own assistance labels.

```sh
python3 check_model.py investigation.py --corpus probes --target atomic --seed 20261018
./reserve-opt probes/sequence.bin
python3 check_model.py investigation.py --corpus probes --target optimized --seed 20261018
```

`reserve-opt` is a differently optimized build of the individual mode. For the required static comparison, focus on **decode_record**: compare the byte loads and combination in `reserve.asm` with `ldr w0, [x0]` and `ret` at `0x1000007b8` and `0x1000007bc` in `reserve-opt.asm`. Use a saved entry's four bytes to predict the low 32-bit returned pattern in both forms. Then locate the `bl ... decode_record` and `bl ... apply_record` calls in each replay listing; those call identities survive although addresses and surrounding instructions change. This is a bounded comparison using taught instructions, not a request to explain the entire optimized function. Retain the full native model checks above. A reduced branch count is not evidence that rejected operations disappeared; identical outputs on finite probes support equivalence on those cases, not universal source identity.

If you explore the optimized **apply_record** listing, these extra forms help. Bit positions count from zero at the least significant bit. A **mask** selects bits using bitwise AND. A vector register is 128 bits that can be viewed as several lanes; `.4s` means four 32-bit lanes. The names `q0`, `v0` and `s0` are views of SIMD register 0, while general register `w0` is a different register.

| Form in the optimized listing | Small independent example |
| --- | --- |
| `ubfx w10, w1, #8, #8` | Extract eight bits starting at bit 8, place them in the low bits, and zero the rest. `w1=0x0000ab34` gives `w10=0xab` (171). |
| `tst x1, #0xff00` | Compute `x1 AND 0xff00` for flags only, leaving x1 unchanged. `x1=0xab34` gives Z=0; `x1=0x0034` gives Z=1. A following `b.ne` takes its branch only in the first case. |
| `cmn w9, #4` | Add 4 for flags only, leaving w9 unchanged. With `w9=0xfffffffc`, the 32-bit sum wraps to zero: Z=1 and the unsigned carry flag C=1. `b.hs` tests C=1; `b.lo` tests C=0. Follow the arithmetic and flags instead of treating the mnemonic as a signed source comparison. |
| `addv.4s s0, v0`, then `fmov w11, s0` | Add four 32-bit lane values, retaining a 32-bit result in s0, then copy those bits to w11. Lanes `[3,5,7,11]` produce 26. `fmov` here moves bits without converting a floating-point number to an integer. |

The [Arm bitfield](https://www.scs.stanford.edu/~zyedidia/arm64/ubfx_ubfm.html), [bit-test](https://www.scs.stanford.edu/~zyedidia/arm64/tst_ands_log_imm.html), [CMN](https://www.scs.stanford.edu/~zyedidia/arm64/cmn_adds_addsub_imm.html), [vector-add](https://www.scs.stanford.edu/~zyedidia/arm64/addv_advsimd.html) and [register-move](https://www.scs.stanford.edu/~zyedidia/arm64/fmov_float_gen.html) descriptions are optional references. Other optimized instructions are outside the required static trace: name an unknown rather than assuming its meaning. You still test the entire optimized program against your model.

## 6. Fresh prediction, reproducible handoff, resume

Create a new well-formed log that has not appeared in your earlier corpus. It must combine at least three operation families, two slots, an exact boundary and a rejection followed by another operation. Before running either binary, save raw bytes, complete event/final predictions for both modes, and your reasoning in a `handoff` record. This is fresh-input prediction after assistance, not an unaided first attempt. Only then run, compare and save a second handoff record. If it fails, preserve and explain the revision.

Your final response should name each claim, its discriminating input and native output, and relevant instruction addresses. Include file bounds, unknowns, which conclusions rely on supplied setup, what optimization changed, and what finite tests cannot establish. An invariant should be an equation over a state, not merely “it works”; explain any quantity that leaves or enters the system. Use [checkpoint.md](checkpoint.md) to self-review, without treating it as a grade.

Copy a backup using a new name; these commands send nothing to a service:

```sh
python3 notebook.py list --workspace work/m07
mkdir ../m07-export-01
cp -R work/m07 ../m07-export-01/records
cp -R probes ../m07-export-01/probes
cp response.json investigation.py manifest.json ../m07-export-01/
diff -rq work/m07 ../m07-export-01/records
cp -R ../m07-export-01/records work/m07-resumed
python3 notebook.py list --workspace work/m07-resumed
python3 notebook.py record --workspace work/m07-resumed --stage handoff --response response.json --manifest manifest.json --assistance checker --artifact investigation.py --evidence probes/sequence.bin
```

Silent `diff` means the record copies match byte for byte. Open an earlier copied record and confirm questions, teaching, response, raw evidence and code remain readable; the last command must add a new file. Keep the exact original ZIP and the export together. To resume in a newly extracted copy of the same ZIP, restore the backed-up response, model, probes and records first. Keep older packages/records when changing versions; a new manifest does not reinterpret an old attempt. An independent person still needs to run the package and assess the explanation. Stop with uncertainty preserved rather than declaring the course complete.
