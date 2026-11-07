# Setup and recovery

Tested target: macOS 26.6 / Darwin 25.6.0, Apple Silicon ARM64, little endian. Author builds use Apple clang 21.0.0 (clang-2100.1.1.101), Apple LLVM objdump 21.0.0 and Python 3.14.6. The package supplies Mach-O executables and their focused listings; learners need only Python 3 and a terminal/editor. Other Python versions, Intel Mac, Linux, Windows, Rosetta and other compilers are unverified. Do not assume these addresses survive rebuilding. `manifest.json` records exact compiler flags, tool hashes, sources and target hashes.

Obtain the private `re-lab-m06-student.zip` and its package SHA-256 from the author. Compare `shasum -a 256` for your archive with that receipt before extracting. Extract it into a new folder using Archive Utility or `unzip`; in Terminal, `cd` into that extracted folder. All learner commands run there. Keep the folder away from the repository's sources/solutions if you want an unaided attempt. The package is not a sandbox or secure exam.

Run:

```sh
pwd
uname -sm
python3 --version
file quote-O0 quote-O2 fee-O0 fee-O2
python3 -m json.tool response.json
python3 -m py_compile model.py notebook.py check_model.py
```

`uname` should say Darwin arm64 and `file` should identify Mach-O ARM64 programs. JSON formatting and compilation should succeed; they do not execute your unfinished model. `quote-O0.asm` and `quote-O2.asm` must be beside their programs and manifest. Use your editor to open Markdown, Python and JSON as text; open `START-HERE.md` next. No downloads, external services, administrator privileges or compiler install are part of this route.

If Python is missing or architecture differs, stop and report the exact output; the author must provide a rehearsed route for your platform. If your terminal says permission denied, use `chmod u+x quote-O0 quote-O2 fee-O0 fee-O2` only on these verified extracted files, then retry. If macOS blocks execution, do not disable protections or strip quarantine. Keep the exact dialog/error and ask the course owner for a verified distribution route. Download quarantine handling is unverified.

If the checker reports a target hash mismatch, missing file or launch failure, save the message and re-extract the matching archive into a new folder. Copy your `work` folder, `model.py` and `report.md` from the old folder; retain the old folder as evidence. Never combine programs, listings or manifest from different packages. Target trouble is not a wrong model. An unfinished-model diagnostic tells you to save/edit the starter; a mismatch supplies a behavioral counterexample.

If a notebook save fails, fix valid JSON, required assistance details or the new writable destination and retry. It never intentionally replaces old UUID records. The workspace must not be a symlink. Keep two copies before moving machines. To resume, copy the entire extracted folder to a new directory, enter it and run `python3 notebook.py list --workspace work/m06`; examine old question/code snapshots, then append a new record. The original records and manifest remain authoritative for those attempts.

Optional Ghidra analysis is a separate extension. No GUI import, decompiler result, human learning or accessibility conformance is claimed by this terminal route.
