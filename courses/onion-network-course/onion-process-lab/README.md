# Build and run your own local onion relays

This extension takes Circuit Observatory beyond calling simulated relays in one JavaScript process. You implement a client and a relay protocol, start **four separate Node processes**, create a three-hop circuit, and carry an encrypted request and reply through it. Then you kill a real relay process and decide how to recover.

The qualified transport is **local IPC with simulated links**, routed by the parent process. This is a local onion-routing prototype, not a distributed anonymity network. An optional loopback TCP adapter is included but was **not qualified**: its first startup failed before readiness in the authoring environment, and was not retried. No public network, Tor service, account or secret from outside the lab is used.

## Start

Use an already installed Node runtime with `node:crypto`. The author control was tested on Node **v26.5.1**. No dependencies or installation are needed. If that runtime is unavailable, record the blocker; do not install software or change permissions for this lab.

```sh
node tools/check.mjs 1
```

The starter deliberately reports `TODO_P1`. Read [lesson 1](lessons/01.md), edit `learner/protocol.mjs`, and repeat. All seven exported functions belong to you; the starter never loads an instructor answer. Checks are cumulative and later functions can remain unfinished until their lesson.

| Lesson | You build | Run |
| --- | --- | --- |
| [1. Processes and paths](lessons/01.md) | `selectPath` and a process/observer map | `node tools/check.mjs 1` |
| [2. Create relay state](lessons/02.md) | `createCircuit` and `installCircuit` | `node tools/check.mjs 2` |
| [3. Build the outgoing onion](lessons/03.md) | `wrapRequest` | `node tools/check.mjs 3` |
| [4. Forward and return](lessons/04.md) | `handleCell` and `unwrapReply` | `node tools/check.mjs 4` |
| [5. Kill a relay and recover](lessons/05.md) | `recoveryPlan` and a controlled experiment | `node tools/check.mjs all` |
| [6. Defend the claim](lessons/06.md) | Evidence report, including limits of the transport | [report template](REPORT.md) |

This follows the original course's six lessons. Reuse your reasoning about path choice, reverse wrapping, request binding and replay protection. The synchronous `peelForward`/`addReturnLayer` split becomes one asynchronous server handler. Existing browser and CLI solution files are separate artifacts and are not imported automatically.

## Operate the system you wrote

After lesson 4:

```sh
node tools/lab.mjs demo
node tools/lab.mjs interactive
```

The launcher starts four child processes and prints their PIDs. At the interactive prompt enter one command per line:

```text
directory
open alpha
send alpha luna
view r1
quit
```

`open` prints the actual chosen path. Do not assume a particular relay is the middle hop if you chose a different valid order. Read [lesson 5](lessons/05.md) before stopping a relay. `quit` and end-of-input close circuits and terminate the children created by this launcher. Only this lab's child processes are stopped. A parent disconnection also asks surviving children to release local resources.

Rows labeled `operator` combine all process observations for debugging. A row labeled `client` is narrower evidence. A learner's handler must call `io.observe` with metadata only, as specified in [PROTOCOL.md](PROTOCOL.md). Do not print keys or use personal data. The only application requests are fictional, read-only `luna` and `tide` lookups served at the exit.

The public checks are readable in `checks/requirements.mjs`. They exercise your submitted code in the client and child processes. A pass is finite behavior evidence, not proof of learning or security. Make predictions before running the scenarios and submit your own explanation, source and captured output using [REPORT.md](REPORT.md). Nothing is automatically uploaded or graded.

## What is supplied

The runtime supplies process launching/termination, parent-child IPC, a bounded TCP framing adapter, AES-256-GCM primitives, a tiny archive and a command prompt. You supply circuit setup policy and state, layered requests, replay decisions, asynchronous forwarding, layered replies and replacement selection. Read the [contract](PROTOCOL.md) before implementation.

All code runs with your ordinary Node permissions. The processes and launcher are **not a sandbox for untrusted submissions**, and a loop in your client code can hang the launcher. Supplied I/O operations have deadlines; that is not an execution time limit on arbitrary learner code.

The local operator owns all the processes and keys. Fresh keys are delivered over a trusted IPC setup channel, without relay authentication or a cryptographic handshake. There is no independent relay trust, production anonymity, Tor interoperability, public exit, secure erasure, or forward-secrecy claim. The [limitations](LIMITS.md) are part of the assignment.
