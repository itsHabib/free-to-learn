# The controlled protocol contract

This protocol is an original teaching model. Its nested JSON, per-layer GCM tags, key setup, freshness policy and variable packet sizes are not Tor wire formats or algorithms. It implements no public network behavior.

The original CLI API below stays synchronous. The browser implements the same protocol with async `seal`/`open` from Web Crypto; see [BROWSER.md](BROWSER.md). Its four crypto-using learner functions await those operations. The worker and file/history plumbing are supplied, so the learner's routing, request-binding and freshness decisions remain the same.

## Execution model

`establish(path)` is a trusted local constructor. It creates one circuit ID, two independent fresh 256-bit keys per hop, and one local relay state per hop. Each key handle is valid only in the current Node process. No handshake, identity check, directory consensus or remote key distribution is simulated.

Forward movement is a sequence of function calls. A relay opens one layer and returns the inner packet. Backward movement visits relays in reverse order, adding one encrypted layer at each call. The client opens the result in path order. The harness can inspect the entire process and supplies narrow observer views for teaching.

## Learner API

All functions are synchronous. Do not mutate caller inputs except the explicitly mutable freshness set. Valid directory inputs contain objects with string `id` and boolean `online`. Requested lengths are positive integers no larger than the available teaching directory. Paths in integration exercises have at least two hops.

| Function | Required behavior |
| --- | --- |
| `selectPath(relays, failedIds=[], length=3)` | Return exactly `length` distinct online IDs excluding all failed IDs. Throw `LabError('NO_PATH')` if insufficient. Keep input unchanged. Any qualifying order is valid. |
| `wrapRequest(hops, request, seq)` | Return the outer packet. Visit hops exit-to-entry. Encrypt `{next, body}` with `forwardKey`. The exit’s `next` is `archive`; earlier `next` values come from the following hop. Keep request plaintext out of the outer packet. |
| `peelForward(state, packet)` | Open one layer using local forward context. Require matching `next` and a `body` property, else `BAD_ROUTE`. After authentication and route validation, call `acceptSequence`. Return `{next, body}`. |
| `addReturnLayer(hop, body, seq)` | Seal `body` with the backward key and backward context. The harness calls this exit-to-entry. |
| `unwrapReply(hops, packet, expectedSeq)` | Open each backward layer entry-to-exit using the caller's `expectedSeq` in every layer's context. Each layer's sequence must equal that expected request sequence; otherwise throw `BAD_PACKET`. Never derive the expected sequence from the packet. Return the final reply only after all layers validate. This function is stateless; the supplied client checks accepted reply sequences. |
| `acceptSequence(seen, seq)` | Require an integer in 0…1023, else `BAD_SEQUENCE`. Reject a member of `seen` with `REPLAY`. Add a fresh sequence. Out-of-order unseen values are allowed. |
| `recoveryPlan(relays, failedIds, oldPath)` | Return `{action:'rebuild',path}` preserving path length and selection rules, or `{action:'stop',reason:'NO_PATH'}`. The harness closes the old circuit and performs fresh setup. |
| `correlate(entryTimes, candidates, tolerance)` | Return every candidate ID with equal event count and all corresponding gap differences ≤ tolerance. Require at least two entry events. Candidates are `{id,times}`; inputs have finite ascending times and nonnegative tolerance. Preserve input and candidate order. |

Each hop has `circuitId`, `relayId`, `forwardKey`, `backwardKey`. Each relay state also has `previous`, `next`, `seenForward`. Key handles carry no serializable key bytes.

## Supplied crypto API

`context(circuitId, relayId, direction, seq)` returns canonical authenticated context. `direction` is `forward` or `backward`; valid sequences are 0…1023. `seal(keyHandle, context, value)` returns `{seq,ciphertext,tag}`. `open(keyHandle, context, packet)` returns a parsed JSON value only after GCM authentication succeeds. The two encoded fields use base64.

The wrapper uses AES-256-GCM, a 96-bit nonce containing the sequence, and a 128-bit authentication tag. A fresh handle must be scoped to one circuit/hop/direction. Reusing a sequence with the same handle throws `NONCE_REUSE`, even if associated data differs. Each new circuit creates new keys before the sequence restarts. This bookkeeping is a teaching guardrail, not a new cryptographic primitive.

For replies, the caller supplies the request sequence it expects to fulfill. An authentic reply for sequence 7 cannot fulfill a call expecting sequence 8. A mixed packet with an outer layer for 8 and an inner layer for 7 must also fail. `open` diagnoses a mismatch between packet sequence and expected context as `BAD_PACKET`; an altered ciphertext/tag or wrong key/context with matching sequence fails as `AUTH_FAILED`. This distinction is separate from freshness: stateless unwrap may decode replies 9 and 2 in that order if each call supplies its matching expected sequence, and independent circuits may use the same sequence with their own keys. The receiver, not unwrap, decides whether an already accepted reply can be accepted again. The supplied synchronous client records the sequence only after matched unwrapping succeeds; it does not model a general asynchronous request scheduler.

Packets are limited to 256 KiB of plaintext per layer; nesting increases size. The small exercises fit well inside this bound. No attempt is made to reproduce fixed-size Tor cells or traffic shaping. An unchanged packet can authenticate again; replay rejection belongs to receiver state.

`destroyKey` overwrites the wrapper’s key buffer and invalidates its handle. JavaScript and native library copies may remain in memory. This is not a secure-erasure or forward-secrecy assurance.

## Failure semantics

`AUTH_FAILED` means the key/context/ciphertext/tag combination did not authenticate. `BAD_ROUTE` means an authenticated instruction contradicts the established successor. Neither may mutate `seenForward`. `REPLAY` means the packet’s sequence has already been accepted. `RELAY_DOWN` is a supplied fault before a named relay acts. `REPLY_LOST` is a supplied fault after archive receipt and before reply delivery. `CIRCUIT_CLOSED` prohibits using a retired circuit. More than 1024 send sequences requires a new circuit.

The harness does not implement adversarial scheduling, real transport loss, retries in a running network, or durable endpoint state. The archive accepts only `{operation:'lookup',item:'luna'|'tide'}` and returns a fictional catalog record. Repeating a read-only lookup is acceptable. No exactly-once application guarantee follows.

## Observer contract

Entry: previous client, next relay, local circuit state, packet times/sizes and its encrypted inner packet. Middle: neighboring relays, local circuit state, packet times/sizes and its encrypted inner packet. Exit: previous relay, archive destination and plaintext request/reply in this toy. Archive: exit as caller and request contents. Process operator: everything.

Relay projections do not include the full route. The trace collection does include all projections for inspection; sharing it would reveal the combined information. This distinction is deliberate and is part of the capstone argument.

The toy gives every hop the same circuit ID and uses the same sequence number across layers. These are linkable labels when observers combine their state. The timing exercises intentionally restrict their input to event times; they do not model all metadata available in this protocol. Real Tor has different circuit/link metadata and cell handling. Do not infer unlinkability from the absence of the request body at one relay.
