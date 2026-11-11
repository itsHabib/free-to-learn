# Run your own circuit in the browser workbench

The workbench now contains an actual code editor and disposable execution worker. Its **Run module checks**, **Run diagnosis**, and **Run capstone** buttons run the source in that editor. The optional reference demonstration in lesson 3 remains labeled separately and never supplies your implementation.

This build's source, worker bundle, Web Crypto adapter and controller have offline checks. Actual browser execution, storage behavior, CSP behavior, keyboard flow, visuals and accessibility are **NOT_RUN**. Browser/server execution is held in the current delivery environment. This is implementation evidence, not browser acceptance.

## Learner route

The [multi-circuit workshop](WORKSHOP.md) adds learner-authored ordered scenarios using this same editor and worker. Open its scenario builder after module 5 to inject loss, corruption, replay and outages, then choose recovery actions and compare observer evidence. **Run experiment** saves the exact scenario and predictions alongside the source; it does not require or imply a passing module score.

1. Use the **Run your code** link in the workbench. The editor starts with `learner/browser-solution.js`, containing the same eight functions as the CLI project.
2. Read the module and edit its functions. Run the checks through that module. Initial `TODO_M1` failures are intentional; incomplete later modules do not block running an earlier module's checks.
3. After implementing the round trip, select a fictional record and a two-, three- or four-hop path, then run a diagnosis. Compare the actual result with your prediction. Use the observer selector and event buttons to inspect the trace created by your code.
4. After completing all modules, run the capstone. All 29 checks precede six diagnostic scenarios and the timing transfer cases. Written reasoning remains unassessed until you apply the capstone rubric.

The browser needs built-in Web Crypto, Worker, Blob URLs and writable local storage on the document's origin. If a capability is missing, the UI reports it and keeps the code visible. It does not substitute the reference trace or claim success. The established Node CLI remains available. No network service, account, package installation or actual Tor relay is part of the project.

## One semantic difference: await the crypto result

Web Crypto encrypts and decrypts asynchronously: `seal` and `open` return a Promise, a value that completes later. The supplied browser starter marks the four crypto-using functions `async`. Inside them, use `await seal(...)` or `await open(...)` before using the result. Returning the Promise directly from `addReturnLayer` is also valid. For example, assigning an un-awaited Promise to a packet body would serialize the wrong value instead of the ciphertext.

The full one-layer sibling in `examples/browser-sibling.js` is executed by the offline adapter tests. It shows the API calls without solving the multi-hop build. You still decide wrapping order, local route checks, replay-state changes and request binding.

The helper names `seal`, `open`, `context`, `requireThat` and `LabError` are supplied to the editor's code. Write ordinary function declarations, with no imports or exports. Functions that do not use crypto may remain synchronous. The adapter awaits their results either way. The original `learner/solution.mjs` and Node CLI retain their synchronous crypto API; neither source file is silently converted or overwritten.

## Same protocol requirements

Every return layer uses the caller's `expectedSeq`. A valid reply for request 7 cannot fulfill request 8, and an outer layer for 8 cannot conceal an inner layer for 7. Mismatches produce `BAD_PACKET`. Properly matched replies may arrive out of order, and separate circuits may use the same sequence under different keys. Stateless unwrapping does not replace the receiver's replay policy.

All 29 public check IDs, requirements and inputs agree with the CLI checklist. The browser adapter preserves per-hop/direction ephemeral keys, AES-256-GCM, 96-bit nonces, 128-bit tags, authenticated context, and rejection before plaintext release. It reserves a nonce before awaiting encryption so concurrent calls cannot reuse the key/nonce pair. It never saves key material.

## Your history and evidence

Before a worker starts, the controller commits the exact source, its SHA-256, the selected command/module/scenario, prediction, declared help, requirement wording and hash, and the build/runtime identities. Results are separate records linked to that submission. Editing code does not rewrite earlier results. The UI flags a result that belongs to earlier editor text; saved runs retain their original build identity.

**Save draft** keeps an editable copy distinct from immutable attempts. **Download code** exports the current editor source. **Export project history** exports submissions and outcomes, including an explicitly unsaved result if storage failed after execution. A failure to save the submission prevents execution. The ten-second limit and **Stop run** terminate the disposable worker and retain a failure/cancellation outcome. A worker is recreated for the next attempt, so keys and replay state never carry across runs.

The page policy blocks connections and the worker disables ordinary network APIs. Those browser restrictions remain unverified until authorized browser acceptance. A worker is not a secure grading sandbox against hostile code: local results are editable evidence, not credentials. Use only your own exercise code and the supplied fictional data. The complete simulator remains under one operator; its restricted observer views do not establish anonymity.
