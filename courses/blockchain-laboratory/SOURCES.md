# Sources and model boundaries

Inspected November 4, 2026. These are technical references, not copied curricula. No third-party code was imported.

* [RFC 8032, Edwards-Curve Digital Signature Algorithm](https://www.rfc-editor.org/rfc/rfc8032), especially sections 5.1 and 7: Ed25519 signing/verification and test vectors. The lab calls Node's implementation; learners never implement curve arithmetic. Authentication of bytes does not establish transaction validity or signer honesty.
* [Node.js Crypto documentation](https://nodejs.org/api/crypto.html), `generateKeyPairSync`, `sign` and `verify`: the supplied runtime uses Ed25519 with `null` as the algorithm argument and SHA-256 for commitments. Installed runtime actually tested: Node 26.5.1. Current online documentation can describe later versions.
* [RFC 9162, Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162), section 2.1: domain-separated Merkle tree leaves/branches and inclusion proofs. This lab borrows those concepts but uses odd-leaf duplication and a count-bound outer root. It is deliberately not an RFC-compatible implementation, append-only log, or nonmembership proof system.
* [Gilbert and Lynch, Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer6.pdf): the formal model matters when discussing consistency, availability and partitions. The lab's finite deterministic schedule illustrates tradeoffs; it is neither a proof of a general consensus protocol nor a faithful model of every assumption in that paper.

The 3-of-4 intersection argument is derived directly: for subsets Q1 and Q2 of a four-member set, `|Q1∩Q2| ≥ |Q1|+|Q2|−4 = 2`. With at most one equivocator and honest non-equivocation for one height, conflicting certificates are excluded at that height. This does not supply cross-height locking, round changes, durable votes or liveness after split votes.

The synthetic highest-height fork order is an instructional total order over validated histories. It has no proof-of-work, stake weight, Sybil resistance, leader protocol or transaction finality. No security conclusion about Bitcoin, Ethereum, Avalanche or another live network follows from its behavior.

Canonical transaction encoding here starts from supplied JavaScript data objects with an exact field schema. It is not a raw network JSON parser and does not detect duplicate keys erased by another parser. It is not RFC 8785 JSON canonicalization. These boundaries belong in any attempted extension.

Course architecture follows inspected Ivy guidance on cumulative learner-owned projects, distinct source/attempt identities, positive export allowlists and honest test scope. No existing accepted course implementation or private instructor material was copied into this course.

## Module 09 reference, inspected November 5, 2026

[Tendermint Core v0.34: Running in production, Consensus WAL](https://docs.tendermint.com/v0.34/tendermint-core/running-in-production.html#consensus-wal) describes writing consensus messages and flushing before processing the validator's own messages, allowing deterministic crash recovery. Module 09 draws the ordering lesson from this source. Its vote-decision journal is an original, smaller teaching model; it does not implement Tendermint's WAL, height/round/step rules, key storage or operational recovery procedure. The conflict examples are derived directly from the course's existing 3-of-4 quorum rule. No external code or live-node instructions are needed.
