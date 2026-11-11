# Course contract

**Goal:** Given a new partition/reorganization trace, implement and defend a node's accept/reject, state, pending-transaction and certificate decisions under explicit assumptions.

Audience: programmers comfortable with JavaScript, maps, immutable data and tests, who know basic distributed-system delay/failure concepts and the distinction between hashes, public keys and signatures. Probability is useful for later consensus study, but this laboratory does not derive probabilistic finality. A learner unable to explain “a signature authenticates a message but does not decide whether the spend is valid” should begin with module 01's worked example.

Estimated study budget is 6–9 hours including implementation and report writing, not a tested duration. The course authoring sprint is separate from learner time. Modules 01–03 are procedures, 04–06 combine procedures with principles, and 07–08 require reasoning under assumptions. Difficulty is expected to rise with the number of interacting invariants: 01 shape+identity; 02 identity+nonce+balance; 03 encoding+position+path; 04 dependency+policy+state; 05 parent+transactions+commitment; 06 validation+order; 07 membership+identity+intersection; 08 all earlier mechanisms under reordered delivery. Human calibration remains unperformed.

## Supplied and built

Supplied: Node's Ed25519 and SHA-256 implementation, ephemeral fixture keys, a canonical byte encoder, signed example creation, a deterministic message scheduler, text/HTML readers, attempt recording and checks. None of this is an assignment to implement cryptography, networking, persistence infrastructure or UI.

Built by the learner: envelope rules, pure transition, Merkle root and verifier, bounded dependency-aware mempool, block validation, fork choice, distinct-voter certificate verification and reorganization. Every function is used again in a later exercise or the final node simulation. No fee market, proof of work, peer discovery, anonymous networking, wallet interface or production consensus is taught. This deliberately avoids the separate Swarm/Messenger ownership areas. No reusable implementation from those courses is assumed or copied.

## Progression and evidence

Read a worked example, commit the local practice answer, implement the current function, inspect the first diagnostic and repair. Each lesson ends with a changed case and a checkpoint. Navigation is always open. Practice questions test reasoning separately from executable checks. Passing code tests establishes the enumerated behaviors only; prose is assessed with the rubric below, not keyword scoring.

For the final report, preserve your prediction before running `simulate transfer`. Record the actual selected history, two rejected claims, final balances/nonces, a stale proof decision, pending transaction decisions and the exact assumption required for a certificate to be unique. Identify one change to the network/adversary model that breaks your claim. Include the source hash printed by your run. A structurally changed incident is supplied, but it is part of the delivered course, not a secret held-out measurement.

## Report rubric (human/reviewer evaluated)

1. **Validity:** explains a concrete rejection using the appropriate layer; distinguishes authentic, valid, selected and certified.
2. **State:** derives balances/nonces in order, conserves the initial 140 counters and ties a proof to its exact root.
3. **Recovery:** revalidates orphan transactions against the new head; does not resurrect a conflicting nonce or drop a newly ready dependency.
4. **Consensus:** distinguishes deterministic agreement after common delivery from irreversible finality. Derives the 3-of-4 intersection and states the honest non-equivocation and fixed-height limits.
5. **Evidence:** prediction, actual trace, mismatch explanation, repair and source identity remain separate. Names simulation and browser limits accurately.

Each dimension is 0 (absent/incorrect), 1 (partly supported), or 2 (correct with a concrete trace or counterexample). Readiness for a target-learner trial requires all executable checks and 2 in every dimension. This is a local project criterion, not a validated mastery threshold. Independent fresh instances and human learning evidence are still needed before a mastery claim.

## Optional extension: vote memory across restart

Module 09 makes one previously assumed invariant executable: a fixed validator must remember its decision before a signed vote becomes observable. Learners add a separate pure vote planner and test persistence/send ordering, idempotent retry, malformed history and a bounded crash schedule. They then rotate identities and intentionally roll back storage to explain where that guarantee stops. It depends on module 07; modules 01–08 and their existing completion checks are unchanged. Allow an additional uncalibrated 60–90 minutes. The lesson includes a separate four-dimension report rubric.

This does not introduce real disk durability, a production signer or a complete consensus protocol. The supplied in-memory model executes effect plans serially and atomically preserves each committed journal entry across modeled crashes. Rollback deliberately violates that assumption. Fixed validator keys persist only inside the fixture for one process and are never exported.

## Scope reconciliation

This constructs the previously undated “behind-the-scenes crypto” idea under the user's later launch instruction. The original content gate is superseded for this isolated build; its no-real-assets and no-publication boundaries remain. The referenced Todoist item is unchanged. Existing Ivy and slate sources/catalogs are read-only reference material. Course integration remains owned by the existing integration lead.
