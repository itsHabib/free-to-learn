# Setup — supplied Mac ARM64 targets

Use this page to reach the first saved prediction without installing a reverse-engineering suite. The supplied route uses a terminal, a text editor, Python and two owned native programs.

## Verified scope

The author route ran on Apple Silicon macOS, Darwin 25.6.0 arm64, with Python **3.14.6**, Apple clang **21.0.0** (`clang-2100.1.1.101`) and Apple LLVM objdump **21.0.0**. The bundle contains Mach-O ARM64 executables. `manifest.json` identifies the compiler, flags and SHA-256 hashes of the programs and listings; a hash identifies exact bytes, not the quality of a lesson.

The learner route uses the supplied binaries, so it does not require clang or a rebuild. Other Python versions, Intel Mac, Linux and Windows are unverified routes. Ghidra import, decompilation and its native accessibility remain unexecuted for this milestone. Do not install Ghidra or a JDK to fix a command on this page. No package download, account or network service is needed for the verified route. A matching platform alone does not replace the separate first-time learner rehearsal still needed for course acceptance.

## Enter the extracted bundle

Extract the archive into a private folder where you can save files. In Terminal, type `cd ` with a trailing space, drag that extracted folder onto the terminal window, then press Return. `cd` changes the directory where later commands look for files. Confirm the location and tools:

```sh
pwd
ls START-HERE.md worked-example.md call-example.md completion-feedback.md practice-feedback.md padding-feedback.md setup.md hints.md transfer-hints.md response.json decoder.py decoder_shifted.py check_decoder.py notebook.py questions.json parcel parcel-shifted parcel.asm parcel-shifted.asm manifest.json
uname -sm
python3 --version
file parcel parcel-shifted
```

`pwd` should name your extracted bundle folder. `ls` should find all twenty files. On the verified route, `uname` reports Darwin and arm64, Python reports 3.14.6, and `file` identifies the programs as Mach-O ARM64. If the platform or Python differs, preserve the output as an unverified setup instead of treating later failures as a wrong decoder. If Python is missing, stop this route and arrange the named tool separately; the course does not install it for you.

If `ls` reports a missing file, return to the extracted folder or extract a fresh copy. If a verified executable loses its executable permission during copying, `chmod u+x parcel parcel-shifted` restores that local permission. A permission change does not resolve an OS security warning; do not disable protections. An `Exec format error` usually means the executable and platform do not match.

## Prepare files without running an answer reveal

Open `response.json` and both decoder files in a plain-text editor. Keep the `.json` and `.py` extensions. The decoders are intentionally unfinished.

Keep `check_decoder.py` closed while making your first layout and code attempts. It is a feedback tool whose implementation derives cases from native probes; reading its method can supply solution help. If you inspect it, record `--assistance solution` and describe the exposure. Run it only at the lesson's check step after saving your work. Its generated cases and feedback are also help, not an independent discovery of the layout.

This command checks only that Python can parse the starters:

```sh
python3 -m py_compile decoder.py decoder_shifted.py
```

Success is silent. A syntax error points to a line to repair; restore a fresh starter if you have not meant to edit it. Do not run the checker yet: first attempts belong before its feedback. The syntax command may create a `__pycache__` folder; that is generated Python data, not a learner record.

Read [worked-example.md](worked-example.md) next. Its first save creates `work/m02/` locally. Once the recorder reports a successful save, inspect the resulting record with:

```sh
python3 notebook.py list --workspace work/m02
```

Open a listed JSON file in your editor. It should contain your response, question text, teaching snapshots and target manifest. A failed save is not a committed prediction. Repair the reported issue and retry; never delete an older record to make a new response appear first.

## Recover and report a failure

For a command error, retain the command and complete error text. First check the directory with `pwd`, then the named file with `ls`. For JSON errors use `python3 -m json.tool response.json`; for Python syntax errors use `python3 -m py_compile decoder.py decoder_shifted.py`. These checks do not establish decoder correctness.

For a bug report, include the milestone, platform, Python version, relevant command, error and target hashes from the manifest. Share a small synthetic example rather than your entire private notebook. [START-HERE.md](START-HERE.md) explains copying, export and resume without changing earlier attempts.
