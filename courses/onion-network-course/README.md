# Build your own local onion-routing system

Build encrypted circuits, then run your client and relay protocol across four separate Node relay processes. Create circuit state, send a fictional archive lookup through three hops, check the layered reply, stop a relay and choose a fresh replacement circuit.

**The working transport is parent-routed local IPC between real processes.** The links are simulated; the processes, AES-GCM encryption and failure/restart operations are real. This course does not yet qualify TCP or multiple machines. It is not Tor-compatible or a real anonymity system.

## Start with the local Node route

Use an already installed Node runtime with built-in crypto. The imported course was tested on Node v26.5.1. No packages, installation, account, listener or network access are needed for the default route.

1. Unzip this package into a new folder. Keep earlier course folders and your attempts.
2. Open this README and the linked lessons in your editor. The static `index.html` is an optional course map.
3. Start with the six [Circuit Observatory lessons](observatory/README.md), which teach layers and observer reasoning in one process:

```sh
cd observatory
node tools/lab.mjs check 1
```

4. After those lessons, continue to the six [local relay lessons](onion-process-lab/README.md). From the bundle root:

```sh
cd onion-process-lab
node tools/check.mjs 1
```

Both starters deliberately fail until you implement the lesson's functions. A TODO result is your starting point, not a broken installation. Later checks are cumulative. If you already have a working Observatory implementation, retain it and begin the process lab's first lesson; its new setup and asynchronous handler still need implementation.

## Carry your work into processes

| Observatory work | Process-lab work |
| --- | --- |
| `selectPath` | Adapt the selection policy to the supplied process directory. |
| Supplied circuit constructor | Implement `createCircuit` and `installCircuit`, including cleanup after partial setup. |
| `wrapRequest` | Compose the same layers with the process-local crypto helpers. |
| `peelForward`, `acceptSequence`, `addReturnLayer` | Combine them in asynchronous `handleCell`; record replay state before awaiting a successor. |
| `unwrapReply` | Preserve the caller's expected sequence at every return layer. |
| `recoveryPlan` | Retain the path length and choose replacement or stop after a real process fails. |
| `correlate` and observer report | Explain what process separation changes and what the shared operator still knows. |

The two learner files are separate: `observatory/learner/solution.mjs` (or its async browser starter) and `onion-process-lab/learner/protocol.mjs`. Read the [process API](onion-process-lab/PROTOCOL.md); do not replace one file with the other or assume their imports and signatures are interchangeable.

After completing process lesson 4, run these commands inside `onion-process-lab`:

```sh
node tools/lab.mjs demo
node tools/lab.mjs interactive
```

The interactive command starts only the four child processes owned by this lab. Use `directory`, `open alpha`, `send alpha luna`, then `quit`. Read [lesson 5](onion-process-lab/lessons/05.md) before stopping a relay. `quit` or end-of-input awaits their shutdown. No socket adapter is needed for this route.

## Finish with evidence

Complete the [process report](onion-process-lab/REPORT.md): record predictions before fault injection, preserve the source and terminal output for each attempt, identify the real chosen path and PIDs, and explain a lost reply and a successful recovery. Retain unsuccessful attempts and declare help. The process lab asks you to save those artifacts explicitly; it does not provide automatic assessment history. Observatory's existing attempt storage is unchanged. Neither project imports or migrates old histories automatically.

The final artifact is your local client/relay implementation and its evidence report. Passing public checks does not assess all claims or establish human learning.

## Delivery and limits

The original Observatory browser workbench is retained as source. The hosted browser runner is unavailable under the current delivery policy; use the Node routes above. No browser can launch the Node relay processes from this package. Real browser acceptance, TCP qualification and independent-machine execution remain unrun for this combined package.

Process spawning, IPC routing, primitive crypto and the archive are supplied; you write circuit provisioning and protocol behavior. Trusted local setup distributes fresh keys without an authenticated handshake. There is no SOCKS proxy, public exit, real destination service, directory discovery/consensus, Tor protocol, independent administration or production security guarantee. Read [the process limits](onion-process-lab/LIMITS.md) before making privacy claims. Use only the fictional `luna` and `tide` records.
