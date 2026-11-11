# 5. Seal the operating-system boundary

**Goal:** state what a real restricted worker must establish, and refuse to claim native confinement from portable VM tests.

**Native practical status: NOT IMPLEMENTED / NOT RUN.** This page includes a runnable pure policy-model exercise. The full Linux activity requires an approved existing Linux environment, a reviewed fixed worker/adapter and explicit permission for child-only confinement. Nothing here asks you to change host settings or install a tool.

## 5.1 Setup and execution are different phases

Today's VM, broker and objects share a process. Their interfaces enforce model-level rules, but a native flaw in the trusted host implementation is outside the guest model. A separate worker process plus a kernel restriction would add another boundary with its own assumptions.

That worker must perform trusted setup before interpreting attacker-controlled bytes. Its executable and libraries load, bounded storage is prepared, unintended file descriptors are closed, and its environment is constrained. Only after the restriction succeeds may untrusted guest interpretation start. A failed setup cannot fall back to ordinary execution while claiming the worker is confined.

A worked sibling: a tool reads its configuration, opens a particular input pipe, then enters a restricted phase. Requiring it to open arbitrary files after the restriction would expand its authority. Conversely, allowing all of its setup operations forever would fail to describe the narrow execution phase. The phase boundary matters as much as a list of syscall names.

## 5.2 A syscall policy is one component

Linux seccomp filters inspect syscall metadata and arguments. They do not dereference a pathname pointer and decide whether its contents are a safe file. The kernel documentation explicitly distinguishes syscall filtering from a complete sandbox. This is why our design gives object authority to the broker instead of imagining that a filter can safely approve arbitrary guest pathnames. [Linux seccomp documentation](https://docs.kernel.org/userspace-api/seccomp_filter.html).

A policy must identify the intended ABI as well as operation numbers. On x86-64, x32 encodings require attention in addition to the ordinary architecture value. Allowing reads/writes also requires thinking about which descriptors they can use; denying new opens does not revoke an already inherited descriptor. [seccomp manual](https://man7.org/linux/man-pages/man2/seccomp.2.html).

No-new-privileges is another specific mechanism. It prevents certain exec-related gains, but is not a command to erase existing authority. [Linux no-new-privileges documentation](https://docs.kernel.org/userspace-api/no_new_privs.html).

## 5.3 Evidence must name its boundary

Repair `modeled_syscall` and `modeled_seal` in `learner.rs`. The model admits only `NativeX86_64`, READ on descriptor 3, WRITE on descriptor 4, and EXIT (whose descriptor field is irrelevant). X32, other ABIs, unknown operations and other descriptor uses are denied. Guest interpretation may begin only if no-new-privileges was verified, the filter was installed, and descriptors were cleaned. Run the `syscall` practice group with a recorded prediction.

These are original model enums and booleans, not actual syscall numbers, BPF or kernel observations. Passing S01–S15 establishes the modeled decision behavior only. In a real worker, each precondition needs independent actual evidence; the worker cannot prove it simply by emitting `true`.

Run `cargo run --offline -- native`. It reports NOT RUN and exits with code 2. That is the correct result for this slice. It does not install a filter or inspect private machine state.

The future practical check must show both a harmless fixed probe that works without the filter and its specified denial inside the sealed child. It must also show that ordinary useful work still succeeds. A missing syscall, failed process launch or runtime panic is not proof that the intended rule blocked an operation.

**Practice:** annotate your current report with three columns: supported portable claim, proposed native claim, missing observation. Include exact worker/filter identity, successful seal, inherited resources and raw process outcome in the latter. Keep the proposed native claim marked unassessed.

**Checkpoint:** you can explain why passing modules 2–4 does not complete module 5. The practical checkpoint cannot be completed in this package. Continue the portable modules without treating this page as a native pass.
