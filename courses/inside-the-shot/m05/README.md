# M5 — trace a local request

You will connect bytes observed between two original local processes to the messages your decoder emits. Your deliverables are a byte-to-event timeline, `decoder.py`, and preserved predictions, failures, repairs and a changed-request experiment.

Start with [setup.md](setup.md), then follow [START-HERE.md](START-HERE.md) in order. You need the earlier milestones' habit of predicting and preserving evidence, basic Python loops/classes/bytes, a terminal and a text editor. The framing and process concepts are taught here. No service account, network connection, compiler or install is needed.

This private milestone is implemented for review, not accepted as a complete course. The tested route is macOS ARM64 with Python 3.14.6; other POSIX systems are unverified, and Windows is unsupported. There is no speed requirement. Work in short sessions and resume from saved files.

| Part | What you produce |
| --- | --- |
| Different worked example | Hand-traced deliveries, a completion exercise and feedback |
| Prediction | Expected events and leftover bytes, saved before a live run |
| Investigation | Two actual process IDs, a timeline that separates writes/reads/delivery, and repeated evidence |
| Implementation | Your own incremental decoder, feedback, and either a supported repair or a counterexample to a competing rule |
| Transfer | Prediction for a changed request and changed delivery schedule, followed by an observed test |
| Handoff | Error cases, fresh chunking, uncertainty and a preserved export/resume |

The packet intentionally includes the runnable client/service and a public checker. They are operational scaffolding; their source can help solve the task. Keep `client.py`, `service.py`, `transport.py`, `protocol.py` and `check_decoder.py` closed until your first predictions and decoder are saved. Reading them is solution assistance; using feedback is checker assistance. The archive excludes the author's incremental decoders, answer walkthrough, tests and records. It is not a secure exam.

Maintainer route from the repository root: `python3 courses/re-lab/m05/tools/package_student.py` prints a new build folder. Its `re-lab-m05-student.zip` is the learner package. `python3 -m unittest discover -s courses/re-lab/m05/tests -v` runs maintainer checks. Run `python3 courses/re-lab/m05/tools/rehearse.py --archive PATH --out NEW_PATH` against that exact archive for a source-aware author control. `PATH` means the actual archive path; `NEW_PATH` must not exist. These are author commands, not learner exercises. In the source repository, `audit/ACCEPTANCE.md` records the remaining acceptance work; it is excluded from the learner archive.
