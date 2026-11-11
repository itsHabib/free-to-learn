# Circuit Observatory

Build an offline instrument that shows what a working onion circuit does and where its privacy argument stops. Use only the fictional archive, simulated relays and synthetic observations in this package. Do not substitute public addresses or real traffic.

## Deliverable

Keep your cumulative `learner/solution.mjs`. Run the supplied report command with that implementation and write your explanation in a copy of `REPORT-TEMPLATE.md`. The report must identify code and case hashes, declared help, actual results, and which observations support each conclusion. The report runner is supplied platform code; the routing and analysis must be yours.

Run `node tools/lab.mjs capstone`. The command prints the report and saves it beside the committed source and question identity in a new attempt directory. Use `--help-used` to declare assistance. Reasoning is marked UNASSESSED until your explanation is reviewed with the rubric below.

Alternatively, implement the browser starter and use **Run capstone** in the workbench. It checks the same requirements before running the six scenarios with your editor source. Export your project history and code; those records contain source/requirement/runtime hashes. The browser API awaits crypto operations but preserves the same protocol and request-sequence binding. An offline adapter rehearsal does not establish browser acceptance.

1. Retrieve `tide` over a qualifying three-hop path. Include the complete forward and return trace, then separate entry, middle, exit and archive views. Explain which fields are direct observations and which are inferences. Show that a genuine reply for request 7 cannot fulfill a call expecting request 8, while matched replies 8 and 7 can be unwrapped in that order. Explain why authentic bytes alone do not establish a match to the caller's request.
2. Present a changed ciphertext before its original. Show the rejection, unchanged freshness state and later acceptance of the original. Then replay the accepted packet and show the different rejection reason.
3. Lose a middle relay. Close the old circuit, choose a valid replacement and retrieve the same record. Show why the old packet cannot authenticate on the replacement. Include an insufficient-relay case that stops explicitly.
4. Lose the reply after archive receipt. Use the trace to explain why the client cannot infer non-delivery. Defend why the supplied read-only lookup can be repeated and identify the extra contract a state-changing application would need.
5. Analyze the two synthetic transfer cases below. Keep every compatible candidate. A unique match is still evidence under a model, not proven identity.

## Changed observation problem

For a learner-owned extension, complete [the multi-circuit workshop](WORKSHOP.md). Preserve a baseline, one changed fault boundary, and your own recovery design. Compare client, relay and archive evidence before inspecting the operator trace. The workshop shares your browser-format implementation and records scenario/source hashes; it does not replace the capstone rubric or automatically assess your written claims.

Case A uses an archive that batches output. Entry event times are `[0,4,13,18]`. Observers offer candidate A at `[50,54,63,68]`, B at `[80,85,93,98]` and C at `[100,104,114,121]`. Use tolerance 1. Explain what your matcher retains and which model assumptions remain untested. The complete exercise includes variable delays; matching only the total duration is insufficient.

Case B changes the sender behavior. A scheduler emits one packet every tick, including when there is no lookup. Entry times are `[0,1,2,3]`. Candidate P has `[20,21,22,23]`; Q has `[60,61,62,63]`; R has `[90,91,92,93]`. Use tolerance 0. Explain what can and cannot be concluded from the retained set. You are given the schedule; you are not implementing a traffic-shaping or evasion system.

Finally, compare two hypothetical endpoint policies: a read-only anonymous catalog lookup, and a request containing a stable fictional visitor label. State how the latter changes what the archive can link even if relay content is encrypted. Do not generate an actual account, credential or identifying payload.

## Acceptance rubric

| Criterion | Evidence required |
| --- | --- |
| Circuit construction | Your path and layering pass the stated tests for more than one path length; no plaintext is attached beside the outer ciphertext. |
| Request/reply binding | Every return layer uses the caller's expected request sequence. Wrong-request replies fail, matched reordered and independent replies remain valid, and stateless unwrap is not confused with replay acceptance. |
| Local reasoning | Each relay’s direct view is justified from its input/state. The complete simulator trace is not mislabeled as one relay’s knowledge. |
| Integrity and freshness | Changed packet, original and replay give distinct appropriate outcomes; rejected inputs leave state unchanged. |
| Recovery | New circuit identity and keys; old circuit closed; valid path or explicit stop; no reuse of failed IDs. |
| Endpoint uncertainty | The lost-reply trace is interpreted correctly and no exactly-once claim is made. |
| Observation limits | Every compatible timing candidate is retained; endpoint identity, operator control and model omissions remain explicit. |
| Provenance | Code/case hashes, commands, actual outputs and declared assistance are present. First and revised attempts remain separate. |

The automatic report checks behavior and records evidence. The reasoning rubric is reviewed from the actual explanation; a nonempty text field does not pass it. All eight dimensions are necessary, and a misleading privacy claim cannot be offset by a high count of passing tests.

The supplied one-layer example and practice questions remain available. Complete the transfer cases without hints first; later help must be declared. For a genuinely fresh assessment, an instructor uses a separate instrument that is not included in the learner export.
