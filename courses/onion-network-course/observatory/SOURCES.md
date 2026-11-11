# Source grounding and scope

Consulted November 4, 2026. This is an original educational protocol, not copied Tor implementation code. No third-party code was downloaded or installed. Examples and traces are produced by this package’s executed reference using installed Node crypto.

| Source | Used for | What it does not justify |
| --- | --- | --- |
| [Tor Protocol Specification](https://spec.torproject.org/tor-spec/index.html) | The distinction between implementation specifications and a design explanation; the course is explicitly not wire-compatible. | That this toy implements the Tor specification. |
| [Tor relay-cell routing](https://spec.torproject.org/tor-spec/routing-relay-cells.html) | Directional relay processing as conceptual grounding. | Substituting the toy’s nested JSON/GCM envelopes for Tor cells. |
| [Tor Project: Counter Galois Onion](https://blog.torproject.org/introducing-cgo/) | Per-relay shared-key layers, why integrity and tag design matter, and why an old simplified account should not be represented as current Tor cryptography. | A claim that our per-layer GCM is CGO or that passing local tests establishes anonymity. |
| [Tor Project: remaining attacks](https://support.torproject.org/about-tor/security/attacks-on-onion-routing/) | The explicit limit involving an observer able to compare traffic at the client and destination/exit. | A claim that one matching short trace proves identity. |
| [Tor Project: HTTPS encryption and Tor](https://support.torproject.org/about-tor/security/https-encryption-and-tor/) | Separating relay routing privacy from endpoint content encryption and endpoint knowledge. | That this lab includes TLS, browser privacy defenses or a working Tor Browser. |
| [Node crypto documentation](https://nodejs.org/api/crypto.html) | The installed API family: createCipheriv, createDecipheriv, setAAD, setAuthTag, final and randomBytes; GCM authentication handling. | Qualification of every Node release. The local runtime is tested separately. |

The Node documentation fetched by the research tool identified v26.13.0; the actual installed implementation tested here is v26.5.1 with OpenSSL 3.6.3. The supplied adapters use the installed built-in cryptographic APIs; private instructor controls are excluded from this learner edition. There is no invented cipher, hash construction or random generator in the course.

The 0.2.0 browser successor adds the platform's built-in Web Crypto AES-GCM adapter. Offline tests use installed Node Web Crypto and compare its ciphertext/tag with native Node AES-256-GCM for a fixed ephemeral test key and context. Both implementations use the same nonce, tag length and associated-data encoding. The exact worker bundle and UI handlers are also exercised with Node worker_threads and a minimal DOM adapter. These are source/adapter checks, not actual browser, CSP, layout or accessibility acceptance. No new web fetch, library installation or external protocol test was used for this successor.

Course conventions preserve learner-owned projects, source/attempt identities, commit-before-feedback and positive learner export allowlists. These conventions are not a claim of human learning or browser acceptance.
