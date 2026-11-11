# 01 · One message, one meaning

A transaction arrives with a familiar account name and a plausible amount. Decide whether its exact meaning was authorized before looking at anyone's balance.

Your artifact is `validateEnvelope` in `work/protocol.mjs`. The supplied signing helper creates ephemeral classroom signatures; your code decides which envelopes the protocol accepts. You do not implement Ed25519.

## The signature is about bytes

An object is not a unique byte sequence. These objects have the same fields but different textual order: `{"from":"a","to":"b"}` and `{"to":"b","from":"a"}`. If one implementation signs incidental JSON formatting and another reconstructs different formatting, they disagree about authentication before they even reach state.

The lab defines one byte representation. `txBytes` encodes the fixed array `["LAB:TX:1",network,from,to,amount,nonce]` as UTF-8 JSON. The prefix separates this type of signed message from a vote. The network name makes the same authorization unusable in another classroom network. The amount and nonce are integers, not numeric-looking strings. This is a small application-specific encoding, not a claim that arbitrary JSON is canonical.

Worked example: a signs a→b amount 6, nonce 0 in `classroom-v1`. The verifier reconstructs that same fixed-order array, asks the supplied cryptographic primitive to check a's public key, and gets true. If a relay changes the amount to 7, the reconstructed bytes differ. The old signature no longer authenticates them. If the relay merely changes object property order, the canonical array stays the same.

Commit a response before looking at feedback: `node lab.mjs practice 01a`, then `node lab.mjs practice 01a OPTION_NUMBER`, replacing `OPTION_NUMBER` with your chosen option number.

{{practice:01a}}

## Reject ambiguity before authentication

An otherwise valid signature does not excuse malformed fields. If one node interprets `"6"` as 6 and another rejects it, the network may split over the same message. If one ignores an extra `memo` while another treats it as meaningful, the signed meaning is unclear. Our exact-field rule chooses rejection. This is a protocol design decision; many other protocols make different explicit choices.

Use guard clauses in this order: exact field set, correct network, known sender/recipient, positive safe integer amount, nonnegative safe integer nonce, then signature shape and verification. The public contract lists the returned error codes. Do not use truthiness to validate nonce 0. Do not parse, round or coerce an amount into something the sender did not sign.

A completion problem: after field and type checks have passed, the last step is `verifyTx(tx, ctx)`. Complete the two return paths: success `{ok:true}` and failure with `SIGNATURE`. Then implement all earlier guards. Run `node lab.mjs check 01`; diagnose one failure at a time using its requirement and observed output.

{{practice:01b}}

## Checkpoint and changed case

Implement the whole validator and rerun module 01. Explain why a correctly signed amount 500 might pass this envelope layer and still fail the next layer. Authentication answers “did this key authorize these bytes?” It does not answer “can this state afford the action?”

For your changed case, consider a signed transaction whose destination account is unknown. Do not silently create that account: the lab has fixed membership. Predict the error category, test it by adapting a public fixture, and keep the original prediction in your notes. Module 02 will turn the accepted envelope into a state transition.
