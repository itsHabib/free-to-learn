# 4. Make authority explicit

**Goal:** implement a broker decision that binds a request to the correct job, live handle, right and complete object range.

Prerequisites: modules 1–3. Repair `Learner::authorize`; keep the actual job argument and untrusted request fields distinct.

## 4.1 Handles are not global object names

The guest sends a small integer handle. The broker owns grants that interpret that handle. A handle combines a 16-bit slot with a 16-bit generation. The same local handle can exist in two jobs without naming the same object.

The trusted caller supplies `actual_job`. The request also carries `claimed_job`, which the guest can influence. Choosing a grant table from the claim lets one principal ask the broker to exercise another principal's authority. That is a confused-deputy problem: the broker has access, but it is using that access on the wrong caller's behalf.

Worked sibling: a photo application gives its previewer handle 4 for a thumbnail. A backup component also has handle 4 for an archive. An incoming preview message saying “I am backup” does not become a backup request. The trusted communication context must bind the request to the previewer.

Predict the result of C02 before running `authority`. The correct result is defined by the trusted context; the request's self-description cannot change it. Record how this differs from simply rejecting every unusual claim.

## 4.2 Rights, ranges and identity over time

A matching job and slot are only part of the decision. A reused slot can belong to a new generation. A read grant does not imply write permission. An object may contain more bytes than the grant permits the guest to use. Every part must match the requested operation.

The grant's base and length define a window into its object. The request's offset is relative to that window. First establish authority for the complete relative range. The runtime's physical object-slice check is a separate safety backstop, not permission to use the entire object.

A zero-byte operation still needs a live handle and the right. It transfers no data, but skipping authority checks would make the API's semantics depend on a special size value and could create a surprising side channel or future extension hazard. This course's contract explicitly keeps those checks.

Repair authorization without keying it to fixture order or constant handle numbers. The two reference-worthy approaches you should be able to imagine are a per-job table and an explicit search constrained by the trusted job. You need not use either exact representation; the observable rule is what matters.

## 4.3 Do not let the broker become a deputy

The broker can access all synthetic objects because it owns the application state. That does not mean every request can use every object. Keep names, paths, claimed principals and direct object indices out of the authority decision unless the public contract deliberately grants them meaning.

The core broker reads an immutable input object and stages writes to a distinct output object. It copies a stable request's bytes as one operation. If authority is denied, no prefix of a write is allowed. Later, module 6 distinguishes this per-operation atomicity from publication of the whole job.

The capability idea is grounded in work on explicit authority and compartmentalization; our job-local grant table is an educational model, not an implementation of kernel capabilities. [Capsicum primary paper](https://www.cl.cam.ac.uk/research/security/capsicum/papers/2010usenix-security-capsicum-website.pdf).

**Checkpoint:** all authority cases pass, both legitimate local handles still work, and the identity/negative filters retain their expected outputs. In your report, explain why matching a slot, matching an object index and matching a live grant are three different claims.

**Fresh application:** a plugin receives permission to read a selected rectangle of a larger image object. A proposed shortcut checks only that the requested pixels fit somewhere in the full image. Describe the authority it has accidentally added, then design one permitted request and one forbidden request that distinguish the shortcut from the public contract. Do not use real private images.
