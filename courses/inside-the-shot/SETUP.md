# Set up the seven-project workspace

Prepare one working folder in which the supplied native programs, Python checkers and your saved files remain together. The main route uses the assembly listings already in the download; it does not require Ghidra, Java, Clang, LLDB, Node.js or the Ivy game source.

## Check the computer before starting

The native targets are Mach-O ARM64 programs for Apple Silicon macOS. The full CLI learner route has been exercised on macOS 26.6.2 arm64 with Python 3.14.6. Module manifests also retain their original author-build details. Other Python versions or operating systems are not established by that run. The guided reading remains available elsewhere, but it does not make the native binaries portable.

In Terminal run:

```sh
uname -sm
python3 --version
```

The supported architecture response is `Darwin arm64`; the recorded Python profile is `Python 3.14.6`. Python functions, lists, dictionaries, integer arithmetic and editing a plain-text file are prerequisites. No assembly knowledge is assumed. If the command is missing, Python must be available before the coding route can run; the archive does not install software. Keep the actual interpreter version with your work rather than changing global aliases to make a version line look right.

## Extract once into a new folder

Keep the downloaded ZIP and its adjacent `.sha256` file. A SHA256 fingerprint identifies bytes; it does not by itself authenticate an unknown sender. Compare the download with the fingerprint supplied alongside this course before extracting. On a Mac, the following command prints the fingerprint of a named file:

```sh
shasum -a 256 re-lab-course-macos-arm64-v0.6.0.zip
```

Use the actual filename if your delivered version differs. Extract into a new writable folder, not over an older attempt. In Terminal, type `cd ` with a trailing space, drag the extracted folder onto the window, then press Return. Dragging supplies the folder's real path, including spaces. Check your location:

```sh
pwd
ls START-HERE.md index.html check_packet.py m01 m07
python3 check_packet.py
```

The packet check reads the listed files and compares their bytes with the course manifest. Before editing, expect `Packet files match the manifest.` An added notes folder is allowed. A changed supplied file is reported by name. Preserve a mismatching download and use an untouched copy rather than repairing its manifest to match the error.

Open `index.html` in a browser for the offline reader. It needs no server or connection. Its practice answers are saved locally when browser storage is available; export each lesson's practice to keep a portable copy. The raw Markdown instructions and original project tools are also present.

## Start Project 1 from its own directory

All seven project procedures run commands inside their respective `m01` through `m07` folders. The complete packet is already extracted; ignore an older standalone setup's instruction to find a second module ZIP. From the course root:

```sh
cd m01
pwd
ls START-HERE.md response.json model.py cart manifest.json
python3 -m json.tool response.json
python3 -m py_compile model.py notebook.py
```

JSON syntax success prints the worksheet; Python syntax success is silent. Neither means the starter is finished. `NotImplementedError` is intentional in an untouched model. Read the guided lesson and the original first-prediction step before running a behavioral checker.

A module's `setup.md` describes its original standalone author environment. This complete-course setup governs extraction and navigation; the module's target manifest governs that target's identity. Some retained standalone notes call the first project a foundation under development or describe tools not yet installed. Those statements describe that earlier module edition, not a missing step in this seven-project route. Use this edition's shared setup and project map; the original project recording and checking instructions still apply. Optional Ghidra has its own guide and distinct validation scope.

## Separate work from inspection

Edit the named starter and `response.json`. Keep native executables, listings, checkers and original manifests unchanged. After intentional model edits, the full baseline packet check will correctly name changed files; it is not your progress checker. From the course root, `python3 check_packet.py --targets-only` verifies supplied native/listing assets without treating your model edits as damaged targets.

If a copied executable lost permission, the module setup names the exact files for `chmod u+x`; this changes only that working copy's execute bit. An OS security warning is a different issue. Do not disable protections or bypass quarantine as a course step. Keep the exact warning and target identity; reading the listing can continue, but an unrun target must remain unrun in your evidence. See [recovery](RECOVERY.md).
