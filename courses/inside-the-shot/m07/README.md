# RE Lab M7 — defend a fresh investigation

Build an investigation another person can rerun: decode a small file, explain its state changes through native calls, challenge the model, and defend a fresh prediction. The owned reservation program is new to this milestone. Its transfer changes when a sequence takes effect, rather than merely changing a constant.

Start with [setup.md](setup.md), then [the separate worked example](worked-example.md) and [START-HERE.md](START-HERE.md). Budget several sessions; no timer or speed grade applies. Pause after any saved stage and resume later. You need Python functions, byte order, state traces, caller/callee arguments, file bounds, and the idea that optimized code can preserve behavior while looking different. The worked example refreshes file I/O; the main route refreshes call notation. If those ideas are new, revisit their earlier lessons before attempting an independent capstone.

The deliverable is `investigation.py`, `response.json`, your raw probes and an exported folder of original and revised records. The recorder preserves actual prompts, teaching, source, assistance and target identity. Records are append-only by convention: an owner can edit ordinary local files, so keep a separate backup. A passing checker does not grade your reasoning or establish independent discovery.

The supplied route is private, local macOS ARM64 with Python 3.14.6. Other platforms, Ghidra and real assistive-technology use remain unverified. Human follow-along, independent technical/teaching review and accessibility evidence are still needed. **Milestone and full course are not accepted.**

For maintainers, the author-only contract, native source, private assessments, separate solutions and acceptance audit are in this directory. They must not enter the student archive. Build with `python3 courses/re-lab/m07/tools/package_student.py` from the repository root; the command prints a new folder containing the archive and SHA-256 inventory. Run the tests and exact-archive rehearsal in the audit. The student archive has a flat explicit allowlist; no private fixtures or transition-rule checker are included.
