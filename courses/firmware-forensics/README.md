# Firmware Forensics — learner package

This public course uses original inert EDUFW1 files. Nothing is flashed, booted,
executed as firmware or sent to a service. Python 3.10+ and Node 22+ must already
be installed. Tested on macOS arm64 with Python 3.14.6 and Node 26.5.1.

## Start from public source

With Git already installed, clone into a new directory and record the exact
revision before doing course work. This acquisition step needs network access;
after acquisition, all required exercises use only local files and tools.

```sh
git clone https://github.com/itsHabib/free-to-learn.git
cd free-to-learn
git rev-parse HEAD
cd courses/firmware-forensics
```

Save that revision with your notes. If you already have the clone, enter its
`courses/firmware-forensics` directory without cloning again. No private checkout,
account, API key, hardware, vendor binary or firmware download is required.
The **course root** contains `work.py`, `check_core.py`, `lab/` and `trust/`.
All commands below run from that directory, not the repository root.

## Preserve the first failure

```sh
python3 --version
node --version
```

Missing tools, import errors or a missing course file are setup failures. With
the required versions present, preserve the deliberate TODO results:

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

The first core report should say `status: fail`: the supplied scaffold passes
5 tests, while parser/inventory/dependency checks report `NotImplementedError`.
The trust checker also exits 1 for the unfinished policy function. Those are
expected learner failures, not evidence of completed work.

Before implementing the full parser, use the small slice experiment in
[unit 01](reader/01/index.html) and the
[parser lesson](lab/lessons/00-build-parser-and-map.md#experiment--a-slice-is-not-a-bounds-check).
It is deliberately incomplete and has its own focused check; passing that check
does not pass the parser or establish trust.

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

`lab/` retains the standalone 0.3.1 core runtime and contracts; its opening
parser lesson has additional public learner guidance. Its README's statements
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

## Optional archive recovery

The clone is the primary route. A saved `.packages/firmware-forensics.zip` is an
optional course-only recovery copy; it has no Git history. Keep it with the
revision of the repository that supplied it. Unpack into a **new** directory,
locate the folder containing `work.py`, `check_core.py`, `lab/` and `trust/`, and
run from that folder. Do not unpack over your current course or attempts.
An older archive may not contain newer lesson examples; keep using its matching
instructions or return to the recorded source revision in a separate checkout.

The archive does not back up your later work. Preserve your whole course folder,
including `attempts/`, notes and separately saved reasoning JSON, before recovery.
Copy that backup to another new directory; retain the original. Verify the saved
sources and outputs before creating your next numbered attempt. A fresh clone or
archive restores supplied files, not your personal attempt history or browser
storage. See the repository's `BACKUP-AND-RESTORE.md` for the non-overwriting copy
pattern. Existing browser export and qualification limits still apply.
