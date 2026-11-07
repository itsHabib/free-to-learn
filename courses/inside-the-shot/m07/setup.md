# Setup — a local, supplied native program

This route was authored on Darwin 25.6.0 ARM64 using Python **3.14.6**, Apple clang **21.0.0** and Apple LLVM objdump **21.0.0**. The manifest captures exact versions, flags, source and native/listing hashes. The learner does not need the compiler. No package downloads, account, service or container are needed. Other operating systems and Python versions have not been rehearsed; preserve their errors as setup evidence, not wrong answers.

Extract the delivered ZIP in a private writable folder. In Terminal type `cd `, drag the extracted folder onto Terminal, then press Return. `cd` chooses where later relative filenames are resolved. `pwd` prints that location; `ls` lists files. Run:

```sh
pwd
ls README.md START-HERE.md setup.md worked-example.md practice-feedback.md hints.md transfer-hints.md checkpoint.md response.json investigation.py write_hex.py check_model.py notebook.py questions.json reserve reserve-atomic reserve-opt reserve.asm reserve-atomic.asm reserve-opt.asm manifest.json
uname -sm
python3 --version
file reserve reserve-atomic reserve-opt
python3 -m py_compile investigation.py write_hex.py check_model.py notebook.py
```

`uname` should say Darwin arm64, Python 3.14.6, and `file` should identify three Mach-O ARM64 executables. Syntax success is silent and does not mean the unfinished model works. The command may create `__pycache__`, which is generated data, not your evidence.

If a file is missing, first confirm the directory or extract a fresh copy. If executable permission was lost in copying, `chmod u+x reserve reserve-atomic reserve-opt` restores local permission. Do not bypass OS security warnings. A platform mismatch needs a matching bundle, not edits to your model. Missing Python is a setup blocker; this course does not install it.

Open `response.json` and `investigation.py` in a plain-text editor. Keep both extensions. All commands below run from this extracted folder. `python3 -m json.tool response.json` diagnoses malformed JSON without changing it. A file that cannot be parsed is not a committed attempt.

Keep `check_model.py`, hints and any author solution closed until their named stage. Checker output supplies new evidence, and reading the checker is also help. Use assistance `checker` for feedback, `solution` for source reading, and describe the exposure. Author solutions never belong in your first-attempt folder.

The three binaries accept one filename and no other arguments. A malformed file returns exit status 2 with `refused:` on stderr and no result on stdout. A valid file prints JSON; a rejected operation inside a valid file is a result, not a process error. JSON uses `true`/`false`; Python uses `True`/`False`. Save the exact command and output. A `Check incomplete or disagreed` message can mean your model failed, your corpus lacks coverage, or a target hash changed: read the rest before deciding what to repair.

Read the worked example next. After its first save, `python3 notebook.py list --workspace work/m07` should print a new JSON pathname. Open it: it must show your response, original question, teaching documents and manifest. On a save failure, keep the response and repair the named issue; never replace an older record.
