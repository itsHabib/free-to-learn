# Process lab contract

This is a new teaching protocol derived from Circuit Observatory 0.3.0. The same core cryptographic model is used, but relay execution is asynchronous and occurs in separate operating-system processes. It is not a Tor wire format.

## Process and transport boundary

`runtime/lab.mjs` is the client and trusted controller. Each `runtime/relay-process.mjs` instance loads **your** `learner/protocol.mjs`, owns its own `Map`, and invokes your `installCircuit` and `handleCell`. Importing your module must not start other programs or perform top-level work.

Default data transport uses Node child-process IPC. A relay asks the parent to deliver a cell to the next child. The parent forwards the nested ciphertext without running another relay's handler itself. Setup, fault controls, observer events and data share this trusted parent. These are simulated links between real processes, not independent hosts or TCP connections.

The optional TCP adapter instead opens one `127.0.0.1` listener per relay on an OS-assigned port. Only the data path uses TCP; setup remains trusted IPC. One connection carries one request and one response, each encoded as a four-byte unsigned big-endian length followed by UTF-8 JSON. Maximum frame size is 1 MiB. A decoder accepts fragments, rejects oversized frames, and permits one frame per connection; later data is ignored after acceptance. Response failures and deadlines become `DELIVERY_FAILED` on upstream forwarding. This adapter is supplied, syntax-checked and **unqualified at runtime**. Its initial listener startup failed; no successful TCP exchange is claimed.

Neither transport has a relay handshake or authenticates the previous neighbor. `previous` is expected topology metadata, not verified sender identity. A key-holding local controller can inject cells into any relay. All supplied destinations are local relay IDs. The archive is a read-only function in the exit process, not an Internet service.

## Learner API

### `selectPath(directory, failedIds = [], length = 3)`

Return exactly `length` distinct online IDs excluding all failed IDs. Directory rows contain `id`, `online`, and runtime metadata; ignore fields you do not need. Duplicate directory IDs must not create duplicate hops. Preserve inputs. Throw `LabError('NO_PATH')` if there are too few. Any valid order is accepted.

### `async createCircuit(path, control)`

The caller supplies a valid distinct ordered path. Generate a fresh `randomUUID()` circuit ID and two independent `freshSecret()` values for every hop. Import them into client key handles using `importSecret`. Construct:

```text
circuit: {id, hops}
client hop: {circuitId, relayId, next, forwardKey, backwardKey}
setup config: {circuitId, relayId, previous, next, forwardSecret, backwardSecret}
```

For hop `i`, `previous` is the preceding ID or `client`, and `next` is the following ID or `archive`. Await `control.install(relayId, config)` for each hop. Send only that relay's keys and two neighbors, never the full route or other keys. Do not return a circuit until all installations acknowledge.

On a setup error, attempt `control.close(id, circuitId)` for **every attempted installation**, including the failing one: an acknowledgment can fail after installation. Destroy client handles you created with `destroyKey` and rethrow the original error. A cleanup failure must not replace the original cause. `control.close` returns a Promise. It is safe to close a state that was never installed. No persistent keys or accounts are used.

### `installCircuit(config, states)`

Reject an existing ID with `CIRCUIT_EXISTS` before changing anything. Import the two supplied secrets. Store only:

```text
{circuitId, relayId, previous, next, forwardKey, backwardKey, seenForward: new Set()}
```

under `states.set(circuitId, state)`. Do not store the input config's raw key strings. The supplied controller checks the relay identity and allowed neighbors before invoking this function. A replacement process starts with no circuit state; restarting a PID does not revive its old circuits.

### `wrapRequest(hops, body, seq)`

Build exit-to-entry. Every plaintext layer is `{next: hop.next, body: inner}`. At the exit `inner` is the archive request; elsewhere it is the next encrypted packet. Use the hop's `forwardKey` and `context(circuitId, relayId, 'forward', seq)`. Return the entry packet.

### `async handleCell(state, packet, io)`

Open exactly one forward layer using local keys and the incoming sequence. Validate `instruction.next === state.next` and presence of its `body`, otherwise `BAD_ROUTE`. Reject a sequence already in `state.seenForward` with `REPLAY`. Record a fresh sequence **after authentication and route validation, but before the first await**.

Call `io.observe({next: state.next, seq, bodyKind})`, where bodyKind is `encrypted-packet` at non-exits and `plaintext-request` at the exit. This metadata is for the report, not a cryptographic input.

If the configured successor is `archive`, await `io.archive(instruction.body)`. Otherwise await `io.forward(state.next, instruction.body)`. Do not choose an arbitrary address from incoming data. The supplied `io.forward` restricts destinations to the established successor and local directory.

Wrap the result with the local `backwardKey` and backward context at the same sequence. Return the encrypted packet. Propagate failures. A downstream failure leaves the accepted forward sequence consumed; do not clear it or try to encrypt another backward packet under the same key/nonce.

### `unwrapReply(hops, packet, expectedSeq)`

Open entry-to-exit using each hop's backward key. Use the caller's `expectedSeq` for **every** context, never the packet's claimed sequence. Return the final value only after all layers authenticate. A mixed outer/inner sequence must fail even if both packets were genuinely generated.

### `recoveryPlan(directory, failedIds, oldPath)`

Return `{action:'rebuild', path}` with the same length and valid selection rules, or `{action:'stop', reason:'NO_PATH'}`. No silent shortening or reuse of failed IDs. The supplied lifecycle closes the old circuit, creates fresh state with new keys and ID, and restarts at sequence zero. It never resends an application request automatically.

## Crypto and lifecycle

`context(circuitId, relayId, direction, seq)` accepts sequences 0–1023. `seal` and `open` use installed Node AES-256-GCM, a 96-bit sequence nonce and a 128-bit tag. Keys are fresh per circuit, hop and direction. The wrapper rejects repeated sealing with the same handle/sequence as `NONCE_REUSE`. These handles are process-local. Trusted setup imports the same secret separately in the client and its relay.

`open` releases JSON only after authentication succeeds. A context/packet sequence mismatch is `BAD_PACKET`; altered tag, ciphertext or authenticated context is `AUTH_FAILED`. Authentication does not detect a repeated authentic packet; your replay set does. Fresh out-of-order sequences are allowed.

The client reserves a new sequence before building/sending. A failure still consumes it. Sequence 1024 requires rebuild (`REBUILD_REQUIRED`). Closing invalidates local key handles and attempts relay cleanup, and rejects later sends with `CIRCUIT_CLOSED`. `destroyKey` overwrites its own buffer; it cannot erase all JavaScript/native copies or raw setup strings, and does not imply forward secrecy.

## Failure observations

`DELIVERY_FAILED` can mean an unavailable process, downstream rejection, closed connection, timeout, or lost reply. It does **not** prove which hop failed or whether the archive processed a request. Operator traces and explicit controls have more information than the client. Direct diagnostic injection at a relay can expose its local `AUTH_FAILED`, `REPLAY`, `BAD_ROUTE` or `UNKNOWN_CIRCUIT` code; an upstream forwarding path deliberately collapses downstream errors.

The state limit is 32 active circuits per relay; the sequence space is 1024 per circuit; operator event retention is 2000 rows. Large onions can exceed the 256 KiB plaintext-per-layer crypto limit. These are lab bounds, not flow control or denial-of-service defenses. Experiments use short three-hop paths and tiny fictional records.
