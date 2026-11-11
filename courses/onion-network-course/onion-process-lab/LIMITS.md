# What this build can and cannot demonstrate

You can demonstrate independent relay heaps and process lifetimes, local circuit installation, layered authenticated encryption, asynchronous request/reply forwarding, replay control, failure ambiguity and fresh circuit recovery.

You cannot infer anonymity from these demonstrations:

- One local operator controls the client, routing broker, relay programs, keys and complete traces. Same-user processes are not an adversarial security boundary.
- The qualified links are IPC messages routed by that operator. They have no Internet latency, route diversity, independent administration, congestion model or link authentication.
- Even the optional TCP path remains on one loopback host with trusted IPC key provisioning. Running a socket would not fix the trust model.
- Setup gives the client and relay raw fresh secrets; there is no authenticated key exchange, directory consensus, guard choice, telescoping handshake, TLS or independent identity verification.
- All hops use the same circuit ID and sequence. Combined observer logs can link traffic directly. Sizes and times are visible; packets are variable-size JSON, without padding or mixing. Encrypted contents do not hide traffic patterns.
- The exit sees archive requests and replies. There is no application end-to-end encryption beyond the exit. The archive is fictional and internal.
- Restarting a process loses replay and circuit state. Recovery uses new keys; there is no durable replay protection or restoration of old sessions.
- Fresh keys on rebuild do not establish forward secrecy. Secrets and key copies can remain in JavaScript/native memory. Closing is resource management, not verifiable erasure.
- Losing a reply cannot establish that an application action did not occur. The lab repeats only safe read-only lookups. It provides no exactly-once guarantee.
- The lab has no public exits, SOCKS proxy, onion services, general destination access or Tor interoperability. Do not use it for private communications or real anonymity.

The original course's synthetic timing-correlation exercise remains useful. It is a separate exercise: this build's shared circuit labels and operator trace already reveal more than timing alone. Do not use local timestamps to claim a realistic traffic-analysis benchmark.

The first loopback startup in the authoring environment failed before readiness. The initial driver preserved the generic exit but not the underlying listener error code. It was not retried or worked around through a permission change. Accordingly, TCP runtime behavior remains unverified; IPC evidence must not be relabeled as a network-socket test.
