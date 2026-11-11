# Design lineage and sources

The earlier Circuit Observatory 0.3.0 component supplied transport and placed relays in one process; its protocol described forward movement as function calls. The process project extends that model with learner-owned relay handlers and circuit installation. Earlier editions and histories remain separate; no automatic source conversion or history migration is performed.

The supplied crypto wrapper derives from that course's `runtime/crypto.mjs`. The protocol label is changed to `onion-process-lab-v1`; fresh-secret/import functions are added for trusted parent-child provisioning. The teaching model retains separate directional keys, sequence-scoped GCM nonces, expected-request reply binding and authenticate-before-replay-state mutation. No upstream file is overwritten.

- [Node crypto documentation](https://nodejs.org/api/crypto.html): supplied AES-GCM APIs. The wrapper calls authentication finalization before exposing plaintext; the protocol learner does not implement a cryptographic primitive.
- [Tor circuit-creation specification](https://spec.torproject.org/tor-spec/creating-circuits.html): Tor creates and extends circuits with handshakes and protocol cells. This lab's direct controller installation and JSON packets are deliberately different and provide none of those protocol compatibility claims.

Documentation reviewed 2026-11-05. Public documentation was read for grounding; no experiment sent data to those sites, public Tor, or any external destination. Runtime test traffic stayed in local IPC. The included loopback adapter remains unqualified.
