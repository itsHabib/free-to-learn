# HTTP verification

These independently authored tests implement the frozen revision 2 spike contract. Gameplay requests use real loopback HTTP; only the owning parent process can advance the deterministic clock through IPC. The tests do not import admission, movement, collision or detector implementation. Replay tests import only the public replay API to compare the recorded transcript with its canonical final state.

From `courses/anti-cheat-engineering/project`:

```sh
node --test tests/*.test.mjs
node tests/mutants.mjs
node --test tests/proximity.test.mjs
```

The focused proximity check is also suitable for an editable source exercise: it requires both honest delivery and rejection of remote pickup. `withServer(callback, {entry})` can point it at an explicit copied server entry. The default entry is `../server.mjs` relative to the harness.

`tests/mutants.mjs` first runs an unmodified baseline. For each owner-only mutant it also completes honest delivery, then requires the named state invariant to fail. A refused connection, malformed response, startup error, crash, or unrelated assertion fails the runner and is never reported as a killed mutant. The runner prints the observed authoritative state for both kills.

The suite checks honest delivery, stale ordering, expiry, coalescing, malformed authority claims, isolation, authentication, Host/Origin boundaries, JSON/body limits, owner-control isolation, advisory detection, legal retry false positives, token resume/restart, transcript replay and bounds, normal-clock progress, and shutdown. Its 100-request timing sample is a bounded local responsiveness smoke, not a load or capacity claim. The live-clock smoke asserts progress and eventual expiry without claiming exact wall-clock scheduling.

The known miss is explicit: a client can alter its own rendering and still send the same valid messages. Equivalent valid traffic gives equivalent legal state, with no inferred self-integrity verdict or invented inspection endpoint.

For manual normal-clock runs, start the server on a chosen port, then run one client per fresh process run (the game permits four sessions):

```sh
node server.mjs --port 8787 --seed 17
node clients/honest.mjs --port 8787
node clients/adversarial.mjs --port 8787 --scenario remote-pickup
```

Other adversarial scenarios are `stale-ordering`, `forged-fields`, `detector`, and `equivalent-valid-traffic`. `--url` accepts only plain loopback HTTP origins. Clients never receive owner clock access, and their printed normal-clock traces remain observations; deterministic invariant claims come from the owner-clock tests.
