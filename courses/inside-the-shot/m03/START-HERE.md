# M3 — Read an unfamiliar file

You can explain a record across a call from M2. Now infer a bounded file format and build an inspector another person can use without silently accepting missing data. Your outputs are a field map, a robust `inspector.py`, two saved fresh predictions, an application explanation and an export of your evidence.

Prerequisites: M2's offsets, widths, signedness and byte order; Python functions, dictionaries, lists and exceptions; terminal commands. If a term is uncertain, begin at worked-example.md. Plan for several focused sessions; duration has not been tested with first-time learners. Navigation is open and hints are optional.

## 1. Set up and learn the method

Follow setup.md, then worked-example.md before the trail investigation. All commands here run **inside the extracted student folder**. `trail` is the original native executable. A `.trail` file is data, not a command to execute. `response.json` is your editable answer; `work/m03` contains immutable saved copies. The filenames supplied in the archive are already present; never regenerate them over themselves.

The native command is `./trail write NEW_FILE TICK DELTA TAG OPAQUE ...`, with four decimal integers per entry. Tick is 0–65535, delta −32768–32767, tag 0–255, opaque 0–16777215. These are supplied value domains, not inferred widths or offsets. The last argument is a controllable three-byte marker of **unknown meaning**. Choosing 0 makes comparisons easier; choosing nonzero later tests your assumptions. The writer refuses existing output files. To retry, choose a new filename.

The Python API must return `{'count': N, 'entry_size': W, 'payload_bytes': P, 'entries': [...]}`. Each entry has exactly `tick`, `delta`, `tag`, and `unknown_hex`, a lowercase raw hex string for the three unexplained bytes. This output contract supplies names and representations. You must infer their locations, the header length and its size relation. Files contain at most 1024 entries and 8204 bytes. A malformed file must raise ValueError. No recovery or best-effort partial output is requested.

Before **every reveal or probe**, write a prediction in response.json: a nonempty `claim`, `reason`, an alternative and what would distinguish it. The notebook copies the current question, teaching, manifest and optional artifacts into a new UUID-named record. It never edits old records.

```sh
python3 notebook.py record --workspace work/m03 --stage prediction --response response.json --manifest manifest.json --assistance none --artifact inspector.py
```

After a run, add its actual result in response.json and save again. That edit changes only your scratch response; the earlier record remains. `--assistance` must describe help already used: none, hint-1, hint-2, hint-3, checker or solution. Every non-none value requires `assistance_details` naming the help and what it revealed. Use the highest exposure and mention all others. Opening check.py, worker.py or native `trail read` output can reveal the complete format; classify that as solution. Running the checker is checker assistance, even when its result is green. Native `write` and a raw hex view are intended investigation tools.

## 2. Make the first comparison

Do not open hints or use native `read` yet. Predict which bytes change if only tick changes. Give an alternative: if tick is one byte, what would happen at 255 → 256? Save first, then generate these new files:

```sh
./trail write probe-a.trail 255 -300 7 0
./trail write probe-b.trail 256 -300 7 0
python3 -c "from pathlib import Path; print(Path('probe-a.trail').read_bytes().hex(' ')); print(Path('probe-b.trail').read_bytes().hex(' '))"
```

Read the hex output left to right, numbering the first byte zero. A change in two bytes at a numeric boundary is stronger evidence than “one changed byte means a one-byte field.” Save both outputs and identify offsets that changed. Open feedback.md only for the section you have attempted.

Next choose one-variable pairs for delta −1/0, delta 255/256, and tag 127/128. The positive tag domain crosses its high bit: this distinguishes an unsigned field from interpreting `80` as −128. Use unused filenames, predict first and retain actual output. Choose a second distinctive tick such as 513 to distinguish little-endian from big-endian. Do not infer the original author's C type; infer an interpretation consistent with the supplied domain and observations.

## 3. Find the envelope and build incrementally

Predict what changes between zero, one and two entries; generate each with `trail write`. With no fields after the filename the file has zero entries. Compare the fixed prefix and the growing suffix. `one.trail`, `markers.trail` and `empty.trail` are prebuilt controls; inspect their raw bytes when useful. Ask whether each header number counts bytes or entries. Test your claim on **both** one and two entries: a mistaken count-as-byte-length can fit the empty case.

Create format-note.md with a table: byte range, proposed meaning, width, byte order/signedness, supporting probe, and competing hypothesis rejected. Mark unexplained bytes explicitly. A sequence of zero bytes is not proof that those bytes may be discarded. Explain how you will handle nonzero values without inventing meaning.

Edit inspector.py in stages: reject too-short input; read the proposed header; cap count; check fixed width; check count × width against declared payload; check total length exactly; only then decode entries. `LIMIT` is supplied safety policy. Keep `inspect_file`'s bounded read. An exact-size check rejects both missing entries and extra trailing data. Before checking, predict how your implementation handles empty, truncated-header, truncated-entry, inconsistent-count and enormous-declaration inputs. Save code and note under stage layout:

```sh
python3 notebook.py record --workspace work/m03 --stage layout --response response.json --manifest manifest.json --assistance none --artifact inspector.py --artifact format-note.md
python3 check.py inspector.py
```

The starter deliberately fails with NotImplementedError and exit 2. Completed behavior yields agreement on finite cases. A mismatch names a case and a contract rule, and points to a newly saved feedback folder containing the exact input, expected native result, observed-result summary and original submitted source. Use its printed replay command and save feedback.json plus the relevant input as notebook artifacts before editing. Set `--evidence-dir NEW_FOLDER` to choose the location; an existing folder is refused. The checker generates fresh native files, mutates bytes and asks native `read` whether each is valid. It contains no stored layout table, but its code and feedback can expose the answer. It is practice assistance, not a private exam. It cannot grade your inference or prove behavior for every input. See feedback.md for repairs tied to common failures.

## 4. Apply the model to nonzero unknown bytes

Before viewing transfer.trail, predict what would break if bytes you called padding were nonzero. Save under transfer. Now inspect the file with your implementation:

```sh
python3 inspector.py transfer.trail
```

Compare the output with raw hex. Explain which layout claims survive and whether your implementation retained all three unknown bytes. This practice changes their values and crosses numeric boundaries; it does not establish new semantics for them. Report the bytes without naming them flags, a checksum or padding unless you have evidence for that interpretation.

Generate **two** files from new tuples of your choosing. Before each `write`, predict the full output dictionary and the total file size from your map. One must be empty or multi-entry, the other must combine a negative delta, a tick over 255 and nonzero opaque bytes. Save separate predictions and actual results; another person must be able to compare them without relying on your memory.

## 5. Deliver and resume

Run check.py again after repair, label checker assistance, and save the exact final source, note and feedback under handoff. State which claims came from observations, the supplied contract or assistance. Readable errors and preserved unknowns matter as much as plausible happy-path values.

```sh
python3 notebook.py list --workspace work/m03
python3 notebook.py export --workspace work/m03 --out exported-m03
python3 notebook.py list --workspace exported-m03
```

`exported-m03` must not exist. Its sibling `exported-m03-hashes.txt` lists SHA256 hashes for verification. Copy your inspector, note and the extracted original student files with your export; records already include attached source and binary snapshots. To resume, use `--workspace exported-m03` for the next save and keep question_version at this lesson's version. Compare old hashes with `shasum -a 256 exported-m03/*.json`: saving a new record adds one file and does not change old ones.

M4 relies on your validated envelope and field model, then provides a deliberately faulty parser of this same format. A checker pass alone does not establish a sound format explanation; compare your note with the rubric through your reviewer before claiming completion. Keep original records outside a public repository.
