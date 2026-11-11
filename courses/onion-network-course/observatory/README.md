# Build Your Own Onion Routing Network

Build **Circuit Observatory**: an offline client that retrieves a fictional archive record through several relays, inspects each relay’s view, rejects altered and repeated traffic, and rebuilds a failed circuit.

This is an educational toy inspired by onion routing. It is **not Tor-compatible and is not a real anonymity system**. All relays run in one process under one operator. Use only the supplied fictional traffic. It has no network access, public relays, accounts or persistent access keys.

## Start here

You need an already installed Node runtime with `node:crypto` and AES-256-GCM support. This build was tested on **Node v26.5.1, OpenSSL 3.6.3** on macOS. No packages, installation, server or account are needed. Other runtime versions are unqualified.

From this folder:

```sh
node tools/lab.mjs help
node tools/practice.mjs p1
node tools/lab.mjs check 1
```

The first check deliberately fails with `TODO_M1`. Read [lesson 1](lessons/01.md), edit only `selectPath` in [your implementation](learner/solution.mjs), and rerun it. Later functions stay unfinished until their modules. The full check is not expected to pass at the start.

Submit a practice response as JSON, enclosed in shell single quotes. For example, an array response has the form `node tools/practice.mjs ID '["first","second"]'`. Ask for an item without an answer to see its prompt. Responses are saved before feedback; retries create new attempts. Predictions are recorded and explained but are not scored as mastery.

The [workbench](workbench/index.html) contains lesson navigation, practice and an actual learner-code editor. Its disposable worker runs your code through the same 29 requirements, six diagnostic scenarios and observer trace views using built-in Web Crypto. The optional reference trace is separate. Read [the browser guide](BROWSER.md) for the async API and source-bound history. The adapter and worker bundle have been exercised offline on Node; browser rendering, worker startup on the target origin, keyboard behavior, CSP and storage have **not yet been exercised in a real browser**.

## Build sequence

After module 5, use [The reply never arrived. What happened?](WORKSHOP.md), the multi-circuit failure/recovery workshop. Author and reorder scenario steps in the existing workbench or run the same experiment offline with `node tools/browser-lab.mjs workshop scenarios/recovery.json learner/browser-solution.js`. Your protocol and recovery choices determine the outcome. No additional code editor or network service is needed.

| Module | What you build | Check |
| --- | --- | --- |
| [1. Choose a path](lessons/01.md) | Distinct available relays; observer scope | `node tools/lab.mjs check 1` |
| [2. Wrap the onion](lessons/02.md) | Layers from exit to entry | `node tools/lab.mjs check 2` |
| [3. Forward and return](lessons/03.md) | Local peel and reverse-direction wrapping | `node tools/lab.mjs check 3` |
| [4. Integrity and freshness](lessons/04.md) | Authenticate, validate, then record sequence | `node tools/lab.mjs check 4` |
| [5. Rebuild](lessons/05.md) | Replacement path or explicit stop | `node tools/lab.mjs check 5` |
| [6. Challenge the claim](lessons/06.md) | Timing comparison with ambiguity | `node tools/lab.mjs check all` |

Plan roughly 30–45 minutes per module including code and repair, plus 45–60 minutes for the capstone. These are untested design estimates, not measured learner times. Reading is deliberately compact; most work is executing and interpreting your own build. All modules remain available without a score gate.

You should already know JavaScript arrays, objects, functions, loops, imports, exceptions and terminal commands. The lessons introduce circuit, relay, symmetric key, ciphertext, authenticated encryption, associated data, nonce, replay and traffic correlation as they become necessary.

## Supplied and learner-owned code

The runtime supplies crypto primitives, trusted ephemeral key setup, an in-process call harness, a read-only archive, trace views and command/file handling. You implement the eight functions in `learner/solution.mjs` for the original CLI, or in the browser editor's `learner/browser-solution.js` starter. Their [contract](PROTOCOL.md) is shared; the [browser adapter](BROWSER.md) uses await for crypto operations. Neither source file silently replaces the other. You are not asked to implement AES, sockets, a UI or storage plumbing.

`seal` and `open` use installed Node AES-256-GCM. Separate key handles exist per circuit, relay and direction. A sequence becomes a nonce only under those fresh keys. No key material is written into attempts or reports. The setup is trusted and local; it does not implement relay authentication, key exchange, Tor cells, Tor directory consensus, guard selection, onion services, TLS, flow control or network transport. These omissions are material, not implementation details to ignore.

The browser adapter implements those same operations with the platform's built-in Web Crypto AES-GCM and nonextractable CryptoKeys. An optional offline rehearsal of that exact worker bundle is `node tools/browser-lab.mjs check 1 learner/browser-solution.js`; its initial TODO failure is expected. This is not a browser test. It saves each source/result pair in `browser-attempts/` before/after execution. The original `tools/lab.mjs` CLI path remains unchanged.

## Run and preserve work

After module 3, run `node tools/lab.mjs demo`. After module 5, run `node tools/lab.mjs failover`. Each command saves the exact submitted source, question wording and hash, declared help, and result into a new `attempts/` directory before importing your code. The checker runs local code with your ordinary Node permissions; it is not a security sandbox for untrusted submissions. A five-second execution limit prevents an accidental infinite loop in the supplied launcher.

If you use help, add `--help-used hint-1`, `hint-2`, `worked-example`, or your own description to a build/check command. Practice responses take that description as the last positional argument. A passed assisted attempt stays assisted. Earlier attempts are never replaced. Files are readable JSON and source, so you can copy the folders yourself. Local history can be edited by its owner and is not a credential.

If saving fails, the command refuses to execute. If Node is unavailable or AES-256-GCM is missing, do not substitute a homemade primitive. Use another already provisioned suitable environment or record the runtime blocker.

## Finish with an argument

Complete [CAPSTONE.md](CAPSTONE.md) using your own implementation and [REPORT-TEMPLATE.md](REPORT-TEMPLATE.md). The project is useful as a controlled explanation and diagnostic instrument. A green checker is finite behavior evidence, not a security proof, anonymity guarantee or evidence that a human learned.

Source grounding and protocol differences are in [SOURCES.md](SOURCES.md). The original author workspace also contains private instructor solutions and QA evidence; the learner export deliberately excludes them. Nothing in this package is published to Free to Learn by the export command.
