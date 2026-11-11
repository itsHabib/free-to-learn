# Public learner contract CI

Pushes to main, pull requests and manual dispatch select changed courses. Course
source or its matching ZIP selects that course; .ci/workflow/common setup changes
run the full configured matrix. A newly added course without a contract fails
selection. Changes to a generated source manifest alone do not hide course diffs.

Checks bind every source file to its ZIP member and executable bit, then use the
existing validation runner for syntax, exact documented setup, named initial
TODO outcomes and configured export/recovery. A stale archive, import crash,
missing dependency, wrong diagnostic or unexpected exit fails. An expected
unfinished starter is not a completed exercise.

The public profile is intentionally separate from full private qualification:
green means these configured public interface regressions pass. It does not mean
that all exercise/capstone implementations succeeded, a blind learner finished,
or human learning occurred. Complete learner implementations are not legitimate
public fixtures here, and are not published merely to make CI green. The retained
source-aware complete runs and new independent blind trials stay private.

The ordinary verify_courses.py CLI still exits2 for incomplete coverage. The
public_contracts.py adapter reports full_exercise_capstone_completion:false and
only passes when all explicitly configured public checks succeed. It never
suppresses a failed or blocked check. Reports uploaded by Actions contain only
summary outcomes, never workspaces, code submissions or blind-trial histories.

All jobs use standard public-repository runners, immutable official Action pins,
contents:read, no persistent checkout credentials, no custom secrets, no release
permissions and no pull_request_target trigger. macos-26 is the standard arm64
profile for supplied native targets; no larger/paid runner is requested. Node and
Python are provisioned only in the disposable hosted CI environment, not on the
operator's Mac. No npm dependencies are installed. No site deployment, visibility,
repository protection, billing or credential settings are changed by CI.

Run locally with already installed tools from the repository root:

    python3 -B -m unittest discover -s .ci -p test_pipeline.py -v
    python3 -B .ci/public_contracts.py --course time-travel-debugger --output NEW_DIR

The JSON-formatted .yml workflow is valid YAML and locally parsed as JSON. Public
course/source licenses and third-party terms apply unchanged. CI is regression
evidence; current qualification is described in QUALIFICATION.md.

The configured matrix now includes the five original terminal releases, Inside
the Shot and Compiler. Inside the Shot checks its exact packet, supplied native
ARM64 target launch and initial public Python model diagnostic. Compiler reads
all nine lessons and checks setup/starter/export/restore. These remain public
interface regressions, not complete learner solutions. Full-path/private-fixture
CI was explicitly deferred; no credential infrastructure is being added for it.

## Targeted recovery and feedback regressions

Adaptive runs generated lossless session-capacity controls (formats 1/2/3,
continued saving, malformed references and existing bounds) without private learner
work. Adaptive also runs checks.test.mjs: one-line wrong edits of the already-public
support layers (a pooled row rate used as p, `now > deadline`) must fail with messages
naming the rule and lesson, the unedited layers must pass, `play --help` must print
usage, and progress wording must not shrink after an edit. Firmware starts with the parser-only checker; its separate staged-checker
regression verifies that later feedback remains gated until the documented stage.
These deterministic regressions do not establish full learner completion.

Anti-cheat's contract checks exact packaging, JavaScript syntax, five public
offline runtime/control suites, sealed M1/order/seven-core workspace preparation
and blank-prediction refusal. It never starts HTTP/browser listeners and does
not establish complete learner exercises or capstone success.
