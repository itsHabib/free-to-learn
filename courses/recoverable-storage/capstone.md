# Capstone: a store you can use and recover

Choose a benign local string dataset you own. Build a small client on your own engine; for example, reading notes indexed by an id. Use get, put, delete and an atomic batch in a real operation such as replacing one note id with another. Include an empty string value and a repeated-key update in the workload.

State one transaction requirement for your client that differs from the lesson 04 exercise. Explain what changed and use your own workload to show that the operation meets that requirement atomically. Use the existing batch interface; the change may be in the client's rules rather than the engine API.

Keep a clean acknowledged baseline. In separate copied directories or MemoryDisk instances, interrupt the next append at several byte offsets, leave complete operations without a commit, corrupt a complete frame, and stop compaction before/after rename. Reopen each case and record the exact allowed and observed entries. After a torn-tail repair, successfully append and reopen again.

Deliver your code, runnable client/workload and recovery report. The report must state the single-writer, append-prefix, atomic-rename and synchronization assumptions; distinguish acknowledgements from attempted calls; identify the last committed byte boundary; connect each case to a requirement; retain at least one failed implementation experiment and repair; include a valid alternative strategy and one test that would reject an unsafe strategy.

Rubric: the client is useful without author code; the changed transaction requirement is stated and supported by the workload; normal operations survive reopen; partial batches never appear; complete corruption is reported clearly and bytes are preserved; compaction retains the committed logical state; evidence is reproducible from the original workload; conclusions stay inside the tested crash model. A report claiming universal power-loss durability fails the reasoning criterion regardless of green checks.

Use examples/batch.json as a shape example, then choose your own keys and operation history. Public cases are not hidden mastery items. Parent-owned independent assessment and human trials are separate from this local report and remain pending.
