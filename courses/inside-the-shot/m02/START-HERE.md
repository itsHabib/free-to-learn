# Milestone 2 — recover a record layout

Two owned native programs print the bytes of a record before and after a function call. You will recover the fields from those bytes, trace the call through an ARM64 listing, and write a decoder that survives a changed layout.

This is a private course milestone under development, not an accepted course. It follows M1's prediction, probe and revision workflow. You need a terminal, a text editor, and enough Python to edit a function and dictionary. [Setup](setup.md) covers the verified Mac route. [The worked example](worked-example.md) teaches the new byte-reading operations before you use them here. No Ghidra installation is required.

The end artifacts are your `decoder.py`, `decoder_shifted.py`, and a folder of saved predictions, evidence and revisions. This milestone covers these two programs and their supplied listings; it does not teach arbitrary binary analysis or establish Ghidra proficiency.

| Stage | Your decision | Saved evidence |
| --- | --- | --- |
| Prediction | What will one native call change, and what result will distinguish two explanations? | A prediction saved before its output |
| Layout | Which bytes hold each field, and how does the pointer reach those bytes? | Paired probes, instruction trace, first decoder and repairs |
| Transfer | Which parts of the old decoder still fit the reordered record? | A new prediction and a separate decoder |
| Handoff | Can you predict a new case and resume without losing earlier attempts? | Fresh prediction, result, limitations and export |

## 1. Prepare a record before revealing results

Complete [setup.md](setup.md), then [worked-example.md](worked-example.md). Keep the bundle folder open in your terminal. All commands below run there. Keep your private `work/` folder outside a source checkout or public upload.

Open `response.json` in a text editor. It is a worksheet, not an answer key. `claim` is your current explanation; `reason` is its evidence; `alternative` is a competing explanation. `probe` holds an experiment's arguments and predicted result. Use `observations`, `layout` and `static_evidence` for later results. `revision` records what changed and why. Keep `question_version` unchanged.

To save any attempt, edit the response, check its JSON syntax, then run the relevant record command. JSON uses double quotes, has no comments, and does not allow a comma after the final field.

```sh
python3 -m json.tool response.json
python3 notebook.py record --workspace work/m02 --stage prediction --response response.json --manifest manifest.json --assistance none
```

The first command displays the parsed response. The second prints the path of a **new** record. An unsuccessful save says `Not saved`; repair the named problem before revealing the result. Editing `response.json` later does not change a saved record. The recorder captures the question, this lesson, both worked examples, the manifest, your response and declared assistance. It preserves work; it does not grade reasoning.

The command examples use `none` for a first attempt without optional help. After checker feedback, use `checker` if that is your only help for the revision. For baseline hints use `hint-1`, `hint-2` or `hint-3`; for changed-layout hints use `transfer-hint-1`, `transfer-hint-2` or `transfer-hint-3`. Record the highest level read for the current task. Use `solution` after reading a worked answer or the checker implementation. Every assisted save requires nonempty `assistance_details`: name the hint files/levels, the checker cases and what they revealed, or the solution material used. Include both hint files if applicable and replace the example's flag accordingly. The byte and temperature examples are normal lesson teaching, not parcel solutions. Preserve the first attempt before help; assistance does not prevent continuing. The recorder checks that details are present, not that the disclosure is truthful or complete.

Run `check_decoder.py` as a tool after saving your own layout and decoder. Its source contains a native-probe inference procedure. Failure messages can print valid bytes beside expected fields; one run with a decoder that raises on valid records can reveal the complete byte layout without opening the checker source. Reading that implementation can also guide the solution even though it contains no table of the two layouts. Keep it closed until your first attempts are saved; record `solution` if you inspect it, and preserve checker feedback used in later repairs. This local bundle manages spoilers; it cannot enforce an answer-hidden examination.

## 2. Predict one native update

The command shape is `./parcel KIND UNITS CREDIT DELTA`. The four inputs are decimal integers: kind 0–255, units 0–65535, credit −1000000–1000000, and delta −10000–10000. An optional leading `+` or `-` is allowed; fractions, extra text and missing arguments are rejected. A valid call prints one JSON object with `before` and `after` hex strings and an integer `total`. These are snapshots of the same record around one call, not instructions to execute.

Use kind **7**, units **513**, credit **−300**, delta **12** for the first case. Before running it, write the expected field values before and after the call and your predicted total. Propose two explanations: for example, does the total use a field before its update or after it? Say what result would reject your alternative. If you cannot yet predict the exact hex, predict field values and which bytes might change; mark unknown offsets as unknown.

Save this as a new `prediction` record with the command in section 1. Only after the save succeeds, run:

```sh
./parcel 7 513 -300 12
```

Put its actual output in `observations` without replacing your prediction. Compare the observed total and byte changes with your own expected result. A correct total alone does not identify a field layout: several arrangements can hold the same numbers. Save your comparison as another `prediction` record. The byte procedure below resolves that uncertainty.

## 3. Separate field evidence from padding

An **offset** counts bytes from the start of this record, beginning at zero. Each pair of hex digits is one byte; `01 02` occupies two bytes even though four characters are printed. Add spaces between pairs in your notes and number the bytes. On this target, multi-byte integer fields use little-endian order, as in the worked example.

Compare two calls that change one input. That input's bytes can move while unrelated fields remain fixed. A value crossing 255 to 256 is useful because it changes from `ff 00` to `00 01` in a two-byte little-endian field; a one-byte-only guess will fail. Negative values help distinguish signed interpretation from an unsigned reading of the same bits. One pair is evidence, not a proof of width: the listing and further cases must agree.

Write the expected differences for these paired probes in `response.json` and save a new `prediction` record with the command from section 1 before running them. Run each row's first and second command separately. Preserve the raw outputs in `observations` and record which offsets changed.

| Purpose | First command | Second command |
| --- | --- | --- |
| Isolate kind with ordinary values | `./parcel 7 513 -300 12` | `./parcel 8 513 -300 12` |
| Distinguish kind's signed interpretation | `./parcel 127 513 -300 12` | `./parcel 128 513 -300 12` |
| Cross a low-byte boundary in units | `./parcel 7 255 -300 12` | `./parcel 7 256 -300 12` |
| Cross a low-byte boundary in credit | `./parcel 7 513 255 0` | `./parcel 7 513 256 0` |
| Compare negative and zero credit | `./parcel 7 513 -1 0` | `./parcel 7 513 0 0` |
| Isolate the effect of delta | `./parcel 7 513 -1 0` | `./parcel 7 513 -1 1` |

Some bytes may stay unchanged in every probe. A native record can contain **padding**: space between or after fields so that fields meet the compiler's alignment rules. Alignment places a field at a suitable byte boundary for its type. These programs zero the whole record before assigning fields, so their padding starts at zero. That is a property of these programs, not a general rule for C records. Do not invent a field for every zero byte or reject other padding values in your decoder.

The kind boundary separates interpretation from width. The CLI accepts the positive value 128; its one-byte pattern is `80`. A signed one-byte decode would call that −128 and disagree with the supplied input contract. The byte itself has no signedness label, and `strb` alone cannot prove a signed or unsigned C declaration. Cite the accepted positive input as evidence for this decoder's unsigned interpretation.

In `layout`, propose each field's offset, width in bytes and signedness, and list the remaining padding offsets. In `reason`, explain what the paired observations support and what they leave uncertain. Save a `layout` record now, even if a hypothesis remains incomplete:

```sh
python3 notebook.py record --workspace work/m02 --stage layout --response response.json --manifest manifest.json --assistance none
```

## 4. Follow the pointer through the listing

Open `parcel.asm` in your editor. A **pointer** is an address of data. The **caller** invokes a function; the **callee** is the invoked function. Here `process_parcel` calls `adjust_credit`, then `score_parcel`. The supplied calling convention puts the record pointer in `x0`, delta in `w1`, and an integer result in `w0`. A calling convention is the agreement about where arguments and results go. The earlier `initialize_parcel` call receives the pointer in `x0`, kind in `w1`, units in `w2` and credit in `w3`; use its stores to check all three field widths.

The listings contain only the four named functions, not `main`. Treat this setup as supplied information: `main` zeroes the record, calls `initialize_parcel`, captures `before`, then calls `process_parcel` and captures `after` and its total. You cannot trace `main`'s calls or snapshots in these focused listings. In the shown build, field stores touch only their own bytes; zero padding in its snapshots is an observed build property, not a general C guarantee.

`x0` and `w0` are 64-bit and 32-bit views of the same register. A **register** is a small CPU working location; its contents can change during a function. Trace what it holds at each instruction instead of assuming `x0` always remains a pointer. Other numbered `x` and `w` registers follow the same size pattern.

| Listing notation | What to track |
| --- | --- |
| `ldr xN, [...]` / `str xN, [...]` | Load / store an eight-byte value, such as a saved pointer |
| `ldr wN, [...]` / `str wN, [...]` | Load / store four bytes |
| `ldrh wN, [...]` | Load two bytes as an unsigned value; the rest of the register becomes zero |
| `strh wN, [...]` / `strb wN, [...]` | Store the low two bytes / low one byte of the register |
| `[xN, #0xK]` | Memory at the address in `xN` plus the hex displacement `K` |
| `[sp, #0xK]` | A location in this function's stack storage, not automatically a field in the record |
| `add wD, wA, wB` | Add two register values and put the result in `wD` |
| `bl ... <_name>` / `ret` | Call the named function / return to the caller |

`sp` is the stack pointer. The listing saves working values on the **stack**, a memory area used for function calls. Stack setup and restoration keep the calls working; they do not describe the parcel's field order. Follow a saved pointer from `x0` to stack storage, back to a register, and only then to a load or store through that pointer. A four-byte load identifies width; it does not by itself prove whether your Python decoder should interpret the bits as signed.

Work through [one pointer, two stack frames](call-example.md) now. It traces a different program completely, then asks you to fill in a new starting state before checking it. Return here for the parcel investigation afterward.

Write four short traces in `static_evidence`, quoting the relevant instructions and addresses from your own listing:

1. In `initialize_parcel`, follow each incoming value through any stack storage to its store through the record pointer. What offsets and widths do those stores support?
2. In `process_parcel`, where is the original record pointer saved, and how is the same pointer supplied to each call? Where does delta go?
3. In `adjust_credit`, which load, arithmetic instruction and store describe the update? Which address is stack storage and which is within the record?
4. In `score_parcel`, which two loads feed the return value? Compare their widths with your byte evidence. Which field does this calculation leave unused?

Use the first native case's field values in your trace, not just register names. Identify the `ret` lines in `score_parcel` and `process_parcel`, and state the value that `w0` carries back through each return. You can call the record's address `P`: this route does not print its numeric memory address. Keep that symbolic pointer separate from the numeric field values loaded through it.

Do not claim that a register name or a zero byte proves a type. Combine the native input values, observed bytes, access widths and arithmetic. Resolve your layout proposal and save a new `layout` record. [hints.md](hints.md) gives baseline help in three levels if you need it.

## 5. Implement and check the baseline decoder

Edit `decoder.py`; keep its function named `decode(raw)`. A completed decoder takes `bytes` of exactly **12 bytes** and returns exactly `{'kind': int, 'units': int, 'credit': int}`. Return real Python integers, not booleans or strings. Raise `ValueError` for a non-`bytes` input or any other length. Accept arbitrary values in padding bytes. The function must use only its argument: do not invoke the target, read files or carry state between calls.

Use the guard, slicing and `int.from_bytes` procedure from the worked example with your inferred layout. The decoder must cover the full field ranges: unsigned 8-bit kind (0–255), unsigned 16-bit units (0–65535), and signed 32-bit credit (−2147483648–2147483647). The native CLI accepts a smaller credit range to keep its update and total safe. Rejecting a raw record just because its credit is outside the CLI range would violate the decoder contract.

Before checking, save your implementation with your explanation:

```sh
python3 -m py_compile decoder.py
python3 notebook.py record --workspace work/m02 --stage layout --response response.json --manifest manifest.json --assistance none --artifact decoder.py
python3 check_decoder.py decoder.py --target baseline --seed 20261017
```

`py_compile` checks syntax and does not call `decode`. The unchanged starter is deliberately unfinished; the checker must reject it. A completed checker run tests finite public cases, including native before/after snapshots, boundary field values, arbitrary padding and malformed inputs. A passing run establishes agreement on those cases, not universal correctness or a sound instruction trace.

On a failure, copy the actual message into `observations`. Explain which assumption the case contradicts, edit your code, then save another record before checking again. Use `--assistance checker` for a revision using only that feedback; include the case and what it revealed in `assistance_details`. A mutated-padding failure can reveal unused offsets, so that revision is checker-assisted. A syntax/import error is a file problem; a decoded-value mismatch is evidence about your decoder. Keep earlier implementations in their saved records.

If the message instead starts `Target evidence check could not complete`, the native calibration failed before your decoder was tested. Keep your work and re-extract the original bundle into a new folder; compare its target hashes with `manifest.json`. Preserve the error. A target refusal is not evidence that your decoding rule is wrong.

## 6. Adapt to the reordered record

Keep `decoder.py` as your baseline implementation. `parcel-shifted` exposes the same command and field-value contract, but its record is **8 bytes** long. A change in length is evidence that the byte layout needs investigation; it does not tell you the new field offsets.

Before running `parcel-shifted`, use `transfer_decision` to predict which old assumptions may survive and which may fail. In `probe`, use the same arguments as one saved baseline case so you can separate a layout change from a value change. Predict field values, total and the byte positions you expect. Save the prediction without a decoder artifact:

```sh
python3 notebook.py record --workspace work/m02 --stage transfer --response response.json --manifest manifest.json --assistance none
./parcel-shifted 7 513 -300 12
```

Compare that output with your saved prediction and baseline output. Then make at least one ordinary one-input pair and one boundary pair on `parcel-shifted`; predict their differences first. Inspect `parcel-shifted.asm` and update your field table from evidence. Explain which access changed and which call/update relationship stayed the same. [transfer-hints.md](transfer-hints.md) is optional help for this stage only.

Edit `decoder_shifted.py`. Its contract is the same as the baseline decoder except that it requires exactly **8 bytes** and uses the new layout. Save the first implementation before checking it:

```sh
python3 notebook.py record --workspace work/m02 --stage transfer --response response.json --manifest manifest.json --assistance none --artifact decoder_shifted.py
python3 check_decoder.py decoder_shifted.py --target shifted --seed 20261017
```

Retain any failure and repair as separate records. Explain why applying the baseline offsets unchanged is wrong, even if one field or the computed total happens to match. The required transfer is the changed layout plus this explanation, not just different numbers in an old test.

## 7. Predict a new case, then hand off your work

Use kind **129**, units **4097**, credit **−65537**, delta **257** for a fresh `parcel-shifted` case. Before running it, save the expected before/after fields, the total, and the exact hex strings your decoder layout implies in a `handoff` record. Explain one carry or signed-byte pattern in your predicted bytes. Do not obtain the prediction by calling the target or checker.

The command below uses `checker` because this stage follows your earlier conformance checks. Describe that prior feedback in `assistance_details`; use a different flag and details if you used hints or solutions too. A fresh prediction after feedback is useful evidence, but it is not an unaided first attempt.

```sh
python3 notebook.py record --workspace work/m02 --stage handoff --response response.json --manifest manifest.json --assistance checker --artifact decoder_shifted.py
./parcel-shifted 129 4097 -65537 257
```

Compare the actual output with the saved prediction and explain any difference. Save a second `handoff` record with the actual result. In that record, state your two supported layouts, pointer evidence, treatment of padding, assistance, and one limitation of the public checks. Someone should be able to distinguish your first guess, observations, first implementation and repairs.

To export, use a new backup folder name if `m02-export-01` already exists. These commands copy files locally; they upload nothing.

```sh
python3 notebook.py list --workspace work/m02
mkdir ../m02-export-01
cp -R work/m02 ../m02-export-01/records
cp response.json decoder.py decoder_shifted.py manifest.json ../m02-export-01/
diff -rq work/m02 ../m02-export-01/records
```

`diff` prints nothing when the saved records match byte for byte. Keep the original bundle alongside this backup: its executable, listings and teaching belong to the captured manifest. To resume in the same bundle without altering the first records:

```sh
cp -R ../m02-export-01/records work/m02-resumed
python3 notebook.py list --workspace work/m02-resumed
python3 notebook.py record --workspace work/m02-resumed --stage handoff --response response.json --manifest manifest.json --assistance checker --artifact decoder_shifted.py
```

Use a new `m02-resumed` name if that folder already exists. Open an earlier copied record and confirm its response, teaching snapshot and code are readable; confirm the new save added a record. If resuming in a fresh copy of the same bundle, restore the backed-up response and decoders first. Keep old records and the old bundle when upgrading: a new manifest must not silently reinterpret an old attempt.

Stop with your artifacts and unanswered questions preserved. Passing the public checks does not certify a first-time human learning outcome, accessibility, arbitrary native targets or the full course.
