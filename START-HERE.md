# Start from a fresh clone

Run these commands from the cloned repository. Use already-installed Node 26.x
(observed 26.5.1) and Python 3 (observed 3.14.6) on macOS arm64. Minimum versions
and other profiles retain their course qualifications. No installer, account,
hosted provider or private Ivy checkout is needed for these terminal routes.
Run only trusted local course/learner code. Expected TODOs are incomplete starter
work, not successful exercises; missing dependencies/import errors are failures.

| Course directory | Setup | First check |
| --- | --- | --- |
| `courses/time-travel-debugger` | `node lab.mjs start project` | `node lab.mjs check project 01 --help-used none` |
| `courses/recoverable-storage` | `node lab.mjs start project` | `node lab.mjs check project 01 --help-used none` |
| `courses/small-llm-runtime` | `node lab.mjs start work` | `node lab.mjs check 01 work --help-used none` |
| `courses/firmware-forensics` | `python3 work.py 001-first` | `python3 check_core.py attempts/001-first` |
| `courses/adaptive-decision-engine` | `node lab.mjs start work` | `node lab.mjs check 01 work --help-used none` |

Read each course's README, API/contracts and lessons. Implement your own source,
then finish every unit and capstone and exercise its documented export/recovery
route. Preserve first failures, snapshots, help and later revisions. Supplied
earlier-layer support/worked examples remain labelled assistance. No completed
learner implementation, private reference or attempt history is supplied here.

Debugger/Storage exports contain `EXPORT_DIRECTORY/project`; retain the original
course package and pass that nested project path to the checker/client. Adaptive
new sessions use format 2 and keep all attempts; old tools cannot read it. Keep an
original export and import into a new directory. Firmware reasoning export is
qualified manual selected JSON; automatic file download is not supported. Its
original 28/30 journal history and clipboard/file-save qualification are unchanged.
Browser/local-server routes are not exercised by this terminal rehearsal.
