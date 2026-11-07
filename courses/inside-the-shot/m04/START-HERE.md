# M4 — Explain and repair a parser failure

Your M3 inspector reads the owned trail format. A second implementation now rejects valid files. Diagnose it, make the smallest justified repair, and check that the repaired parser still rejects the malformed cases in your regression set. Deliver the original failure, a minimal valid reproducer, an actual value trace, a patch explanation, regression tests and saved revisions.

Prerequisites: M3's validated field map and exact-size rule, Python functions/loops/ValueError, and the terminal workflow. setup.md covers tools. Begin with worked-example.md: it introduces coordinate systems and failure-preserving reduction before you need either. This is local correctness work on an original owned parser. It is not exploit development or testing another party's software. Session length has not been measured with first-time learners.

## 1. Preserve before trying to repair

Use the new M4 package directory. It contains the same native format and fixture identities as M3. parser.py is intentionally faulty. Make a copy before any edits:

```sh
cp parser.py parser-original.py
```

Create a nonempty prediction in response.json for parser.py on empty.trail, one.trail and markers.trail. Do not run it first. `claim` and `reason` should separate what you expect from why; keep question_version. Save using:

```sh
python3 notebook.py record --workspace work/m04 --stage prediction --response response.json --manifest manifest.json --assistance none --artifact parser-original.py
```

The notebook captures questions, teaching, manifest, response, assistance and every `--artifact` into a new record. Use as many artifact flags as needed. It never updates earlier records. Set assistance to hint-1/2/3, checker or solution when used, with nonempty assistance_details. Opening checker source or the author solution is solution assistance. The supplied faulty parser and trace.py are intended diagnosis tools. A successful checker run is still checker assistance.

Run these separately. Exit 2 means this CLI rejected the file; it does not by itself identify the cause. Redirection saves stdout and stderr as ordinary files.

```sh
python3 parser.py empty.trail
python3 parser.py markers.trail > original-output.txt 2> first-failure.txt
python3 parser.py one.trail
```

Do not replace first-failure.txt. Copy the outputs into a **new** response and save with parser-original.py, first-failure.txt and markers.trail attached. Note file name, command and exit status. The native reader and your M3 inspector provide controls for validity; predict what each will say, then compare:

```sh
./trail read markers.trail
```

This prints the full known layout result. If you have not completed M3, it is an answer reveal for that milestone. If native read rejects an allegedly original fixture, verify its manifest hash and re-extract a fresh package before diagnosing parser.py.

## 2. Reduce while preserving the failure

An invalid four-byte header can fail too, but at another guard. State your failure predicate before reducing: parser-original.py rejects an otherwise valid, nonempty trail file at the entry-loop bound. The native reader must accept it. Keep the original fixture unchanged.

Generate a smaller valid candidate through the native writer. Repeating entry values is allowed. Choose a new filename for each candidate; start with two entries, then one. One example command is:

```sh
./trail write minimal.trail 513 -300 7 0
python3 parser-original.py minimal.trail > minimal-output.txt 2> minimal-failure.txt
./trail read minimal.trail
```

Before each generation, save the predicted failure and explain why it would be the same stage. Record both parser and native results afterward under stage reduce. Use `--artifact minimal.trail --artifact minimal-failure.txt`. Is zero entries smaller? Try empty.trail and explain whether it still satisfies the failure predicate.

Also save one deliberately invalid candidate by truncating your minimal file. Predict which guard should fail and why it is **not** an equally useful reproducer:

```sh
python3 -c "from pathlib import Path; p=Path('minimal.trail').read_bytes(); Path('truncated.trail').write_bytes(p[:-1])"
python3 parser-original.py truncated.trail
```

A minimality explanation needs the size lower bound for a valid nonempty file and a zero-entry control. Counting how many candidates you tried does not prove minimality.

## 3. Trace the actual values

A trace relates input values to executed operations. “The length is wrong” is too vague: name which length, its origin, its unit and the guard that uses it. Read parser-original.py from the validated envelope to the loop. Predict `count`, `payload`, `cursor`, `end` and the first proposed next offset. Save before running:

```sh
python3 trace.py parser-original.py minimal.trail > minimal-trace.txt 2> trace-result.txt
python3 trace.py parser-original.py markers.trail > original-trace.txt 2> original-trace-result.txt
```

trace.py observes Python's actual local variables at the loop guard using `sys.settrace`. It does not simulate them. It prints `index`, `count`, `width`, `payload`, `cursor`, `end` and the next offset before each guard, and returns 2 on the original ValueError. Its source is included so you can inspect that measurement. Compare predicted and observed values, attach both traces under stage trace, and identify the first guard that contradicts the valid-file control. Trace a multi-entry case too: a repair must explain the changing failure index, not just the one-entry message.

For each relevant number add a unit: entries, payload bytes, or offset from beginning of file. Decide whether the same coordinate system is being compared. Write one competing cause (for example signed decoding or corrupt count) and the observation that rules it out. The optional hints progressively reveal the cause.

## 4. Make a narrow repair and write your own regressions

Before editing parser.py, save the proposed change and predicted results for empty, minimal, original, truncated, nonzero-opaque and trailing-byte cases. Use stage repair and preserve parser-original.py. Change the mistaken expression, leaving independent validation rules intact. Explain why adding “catch any error and return []” would hide a valid-input failure and erase records.

regression.py is an unfinished unittest file. A regression test is an executable claim that protects a previously broken case. Complete its two tests: compare the **whole expected dictionary** for your minimal fixture; use `with self.assertRaises(ValueError): ...` for malformed bytes. Add empty and original-file controls. The expected minimal output must come from your prediction and field map, not from calling the parser twice. See feedback.md for the test pattern after attempting it. Run:

```sh
python3 regression.py
python3 parser.py minimal.trail
python3 parser.py markers.trail
python3 check.py parser.py
```

The delivered tests deliberately fail until you write them. check.py independently uses native read as its oracle for ordinary, random, boundary and mutated files. It runs student code with a timeout in a subprocess; it is not a security sandbox. Do not use it for untrusted code. It distinguishes valid files that must retain all fields from malformed files that must raise ValueError. A reject-everything patch, blanket catch or fixture-specific exception will fail. Checker feedback can reveal expected fields and is assisted practice. Each mismatch names a contract rule and lesson pointer; a new feedback folder retains every exact failing input, expected native result, observed-result summary and original submitted source, with a printed replay command. Use `--evidence-dir NEW_FOLDER` to choose the location; existing folders are refused. Save feedback.json and the relevant input as notebook artifacts before repair, and mark the next record checker-assisted. It cannot establish the correctness of your explanation.

## 5. Export a reproducible explanation

Write report.md with: original command and failure; validity control; reduction sequence including a candidate that failed differently; minimality argument; predicted and actual local-value trace; causal claim; exact changed expression; regression commands and results; remaining uncertainty and assistance. Attach the original parser, repaired parser, tests, minimal bytes, traces and report in a final handoff record. Other people should be able to reconstruct the failure even after parser.py is repaired.

```sh
python3 notebook.py list --workspace work/m04
python3 notebook.py export --workspace work/m04 --out exported-m04
python3 notebook.py list --workspace exported-m04
```

The export directory must be new; a sibling hashes file identifies every unchanged record. Copy your report, tests and package with the export. Resume by saving a new record into exported-m04. Check old SHA256 hashes with `shasum -a 256 exported-m04/*.json`. This establishes preservation, not independently learned competence. M5 will reuse the distinction between a region length and its position when interpreting framed process data.
