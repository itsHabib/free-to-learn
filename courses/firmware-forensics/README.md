# Firmware Forensics — learner package

This private course uses original inert EDUFW1 files. Nothing is flashed, booted,
executed as firmware or sent to a service. Python 3.10+ and Node 22+ must already
be installed. Tested on macOS arm64 with Python 3.14.6 and Node 26.5.1.

Unpack into a new directory. The **package root** contains `work.py`,
`check_core.py`, `lab/` and `trust/`. Run this README's commands from that root:

```sh
python3 work.py 001-first
python3 check_core.py --stage parser attempts/001-first > attempts/001-first/core-first.json
node trust/check.mjs attempts/001-first/trust.mjs > attempts/001-first/trust-first.json
python3 work.py 002-revision --from-attempt attempts/001-first
```

Use `--stage parser` through unit 02. It runs the scaffold and parser, inventory
and dependency checks without the later analysis or investigation checks. After
you write your first investigation in unit 05, run the complete check on your
latest attempt with a new output filename, for example:

```sh
python3 check_core.py --stage full attempts/005-analysis > attempts/005-analysis/core-full.json
```

Omitting `--stage` still runs the complete check for older saved commands.

The TODO starters deliberately fail. Keep those first source files and outputs.
Edit parser.py, analysis.py and trust.mjs in the new attempt, not the starters.
Create another numbered attempt before repairing submitted code. Record help in
help.json. Use a fresh output filename every run; shell redirection can overwrite.
All code executes locally as you; do not run unknown submissions from other people.

Read the seven-unit reader in `reader/`. To open it offline, run
`python3 -m http.server 8118 --bind 127.0.0.1` here and open `/reader/` locally.
The course is complete with sound off. JavaScript records optional reasoning
checks in browser storage; the reading and all terminal labs are ordinary files.
Export browser reasoning separately from your terminal attempt folders.

`lab/` preserves the standalone 0.3.1 core unchanged. Its README's statements
about an incomplete course, Linux-only testing and pending signatures/final
capstone describe that earlier component. The Mac testing statement above applies
to this integrated package with its root-level wrappers; it does not qualify every
low-level command in the historical lab.

Read `lab/README.md`, `lab/FORMAT.md` and `lab/lessons/` for core contracts. For the
integrated course, keep using `work.py` and `check_core.py` from the package root.
If you follow the embedded README's standalone examples, first run `cd lab`; its
relative paths, including `attempts/`, are then inside `lab/`. Run `cd ..` to return
to the package root. Those `lab/attempts/` records are separate from the root
`attempts/` records; do not mix the two workflows.

This package adds the signature exercise in `trust/README.md` and the final
investigation in `capstone.md`.
Core origin is always unverified. The signature extension uses public RFC test
keys and calls only the classroom manifest relationship verified. It authenticates
no vendor and authorizes no hardware use. A signature-gate pass does not override
the Python configuration policy; both must appear in your final report.

The extractor rejects symlinked destinations. `check_core.py` chooses a canonical
temporary test directory on macOS while leaving that rule unchanged. For manual
extraction use a fresh directory under your home directory.

Expected completed code checks: scaffold 5, parser 49, analysis 31, unfamiliar
core integration 6, trust 154, plus two RFC vectors and four negative controls.
Passing these open cases is limited behavioral evidence. Review your capstone explanation and first-attempt history with the rubric;
optional help can come from your own LLM account. Human learning outcomes remain
unverified, and no automatic certification is issued. Source and runtime details are in `SOURCES.md` and `PACKAGE-MANIFEST.json`.
