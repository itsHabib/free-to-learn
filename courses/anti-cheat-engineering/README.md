# Anti-cheat Engineering — Courier Lab

Build defensive server-owned rules for an original toy game: authority and
proximity, ordered inputs, independent tests, timing, integrity, replay,
detector evaluation, retention, compatible recovery and a new-mechanic capstone.
This is an educational beta, not production anti-cheat or a security guarantee.

## Clone and start

Use Node.js 22 or later and npm (included with Node). No dependency installation,
account, API key, paid service or private repository access is needed.

```sh
git clone https://github.com/itsHabib/free-to-learn.git
cd free-to-learn
git rev-parse HEAD
cd courses/anti-cheat-engineering/courier-lab
node --version
npm start
```

Open the complete loopback `/learn` URL printed by the server and keep that
terminal open. `/course` links the guided lessons to the source exercises.
Stop with Ctrl-C. Keep the listener on loopback; do not expose it publicly.
The original web introduction remains at
https://freetolearn.world/courses/anti-cheat-engineering/ and the original ZIP
remains at https://freetolearn.world/courses/anti-cheat-engineering/courier-lab.zip.
This Git edition preserves all 228 project files from that published ZIP.

## Make your own source project

From `courier-lab`, use another terminal while taking the guided lessons:

```sh
npm run lab:prepare
npm run order:prepare
npm run core:prepare -- timing --name first
```

Each command prints its new workspace and exact next command. Existing
workspaces are refused, not overwritten. M1 is the proximity guard; M2/M3 share
the ordering workspace. Read the generated `LEARNER.md`, keep each prediction
question unchanged, fill either an answer or an explicit skip reason in
`predictions.json`, edit the learner source and record your explanation/help.
For example, inside the printed timing workspace:

```sh
npm run core:check -- --assistance "describe the help you actually used"
```

Untouched templates are intentionally incomplete. Blank prediction drafts are
refused before grading; that is different from a failed implementation. Revise
in the same workspace to retain first failures and later feedback. Do not copy
worked solutions and describe them as your own unassisted work.

Follow `courier-lab/README.md` for all ten software modules (M1–M7, M9–M11)
and their exact preparation/check commands. M8 native work is optional/excluded.
The final capstone requires your own policy and independent HTTP scenario.
The `author/`, `controls.mjs`, reference policies and labelled examples inside
this published teaching project are intentional public grader/calibration and
worked-example material. They are not private learner submissions or a new
blind-test fixture. They stay outside generated learner workspaces; consulting
them is assistance to disclose.

## Safe offline checks and the HTTP route

These public deterministic checks need no listener or package installation:

```sh
node --test tests/admission.test.mjs tests/clock.test.mjs tests/engine.test.mjs tests/timing.test.mjs tests/recovery.test.mjs
```

They check the supplied runtime and labelled controls, not your completion of
all projects. `npm run ci`, M1/order/capstone checking and browser exercises
also start the real loopback HTTP server. Browser author tests additionally
require their separately installed tools; do not run npm install just to take
the course. Repository CI deliberately runs only the safe offline/setup
contract. Complete HTTP/browser learner execution was not rerun for this Git
publication because the validation environment has a retained listener
restriction. Source access is delivered; full course completion is not claimed.

## Save and recover your work

A Git clone contains starters, not your generated work. Stop the local server
and all checks, keep the original clone, and back up the whole course directory
including hidden files and `courier-lab/artifacts`. From the repository root,
use a NEW archive name in a location you own:

```sh
tar -cf /absolute/path/to/new-courier-backup.tar courses/anti-cheat-engineering
tar -tf /absolute/path/to/new-courier-backup.tar
```

Keep that archive and a separate copy. Do not overwrite your only backup or
extract over existing work. Prepared sessions contain absolute paths to their
trusted reference and history: an unchanged full-session restore must retain
its original absolute location. Moving only a workspace or replacing its
session metadata does not migrate history.

For another machine/location, retain the complete original backup as evidence,
clone again and prepare a NEW named workspace. Copy your own policy/scenario
and explanation into that workspace, complete its exact prediction draft, and
declare prior work/help when checking. It is a new attempt; do not claim the
old session or first-response status moved. The old backup/history remains
readable and unchanged. Browser notebook export/import is separate and belongs
to the original loopback origin. Export it before clearing that origin's data.
See the original README for interrupted-check maintenance; never remove locks
or evidence to force a check through.

## Scope and licenses

Human learning/time, native 200% zoom and VoiceOver remain unvalidated. Historical
generator model IDs were not exposed and are not guessed. Written explanations
need review; the local editable mastery labels are not proctored credentials.
See `provenance.json` and `NOTICE.md`. Original software is MIT; original lesson
prose/illustrations are CC BY 4.0, attributed to Free to Learn. Explicit
third-party terms remain intact in the repository notices. No third-party game,
kernel component, external credential, real player data or private assessment
is included.
