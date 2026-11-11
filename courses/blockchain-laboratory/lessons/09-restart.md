# 09 · Remember your vote after a crash

The node restarts. Its signing key still works. Does it remember what it promised?

Module 07's uniqueness argument assumes that honest validators never vote for two different values at one height. A perfectly valid signature does not enforce that rule. In this extension you build the missing vote guard, crash it between effects, and connect one forgotten decision to two conflicting certificates.

This is an optional 60–90 minute project after module 07; the estimate has not been calibrated with learners. Keep your existing work/protocol.mjs. Your new artifact is work/vote-guard.mjs plus a short restart report. Only your own trusted local code belongs in this runner.

## One forgotten vote is enough to change the fault bound

Four validators are a, b, c and d; three distinct votes certify a target. Validator a deliberately signs both X and Y. Validator b sends a vote for X, crashes before remembering it durably, and then signs Y. Validator c signs only X; d signs only Y.

X now has a/b/c. Y has a/b/d. Both sets have three authentic votes. Their intersection is a/b: one malicious signer and one signer whose restart broke its promise. The original “at most one equivocator” assumption is false. The certificate checker is correct to recognize both sets; it cannot repair the history of signing.

Write those two voter sets before you code. Identify which participant's behavior you can prevent with a local journal and which behavior you cannot prevent if a participant deliberately bypasses it.

## Save the decision before it can leave

The supplied model executes an ordered list of effects. A persist effect atomically appends one record to durable history before the next effect runs. A send effect signs the record and makes the vote observable. A crash discards the remaining effects, but keeps committed history. A failed persist aborts the rest of the list. Only one request runs at a time.

Worked example: the journal is empty and the request is X at height 7. If you send first, a crash between sending and persistence leaves peers holding X while your recovered journal is empty. A later request for Y looks new. If you persist first, the same crash leaves X remembered but unsent. After recovery, resending X is safe; changing the decision to Y is not.

A stored but unsent vote may delay progress. That cost is real. Do not delete the record just because you cannot find a receipt from a peer: absence of an acknowledgement does not establish that a vote was never observed.

{{practice:09a}}

## Implement the planner

Run these commands from the course directory:

```sh
node lab.mjs lesson 09
node restart.mjs start
node restart.mjs check
```

The first check must fail with NOT_IMPLEMENTED. Edit work/vote-guard.mjs. The starter is separate so you do not have to replace or extend your earlier protocol implementation. Starting again refuses to overwrite it.

Implement planVote(journal, request), a pure function. Every vote record has exactly height and blockId. Height is a nonnegative safe integer; blockId is 64 lowercase hexadecimal characters. The journal is an array of these records for one fixed validator key on classroom-v1. It contains every committed decision; nothing is pruned in this model. Requests are assumed to name already validated blocks. You do not implement signatures or block validity again.

First validate the complete journal. Malformed history, or two different block IDs at one height, returns exactly {ok:false,code:'JOURNAL'}. Identical duplicate records are permitted, including when they are not adjacent. Inspect the whole history even if an earlier entry matches the request. Next validate the request; malformed requests return {ok:false,code:'REQUEST'}. Then apply the decision rule.

For a previously unseen height, return {ok:true,effects:[...]} with exactly two effects: persist the requested vote, then send it. Each effect is {type:'persist'|'send',vote:{height,blockId}}. For the same height and same block ID already recorded, return only the send effect; retries must not grow the journal. For the same height with a different block ID, return {ok:false,code:'CONFLICT'} with no effects. Never mutate the journal or request.

This is a map of decisions by height, not just a highest-height watermark. A new lower height is allowed if absent from the journal; an old recorded height remains protected after higher decisions. Real protocols can impose other height/round/step rules. Do not import those rules into this interface.

Start by answering three implementation questions: what data structure makes conflict lookup clear, why must journal validation finish before returning a retry, and which effect can safely occur first? The source supplies validVote and sameVote helpers in lib/restart-model.mjs if useful; using them is optional.

Run node restart.mjs check after each repair. The checks include retries, malformed recovery, write failure and all 729 three-request schedules built from three requests and three crash cuts. That is a bounded exploration, not a proof for arbitrary inputs. Receipts preserve your source before execution under work/restart-attempts/.

## Predict, crash, compare

Before running the experiment, create work/restart-report.md. Predict these three cases for X followed, after restart, by conflicting Y: crash before effect 0; crash after effect 0; finish both effects and restart. For each, write the recovered journal, emitted votes and possible certificates. Then repeat your prediction for the deliberately wrong send-before-persist planner.

```sh
node restart.mjs simulate crash
```

This uses your earlier verifyCertificate and first runs module 07's checks, including the accepted eligibility-before-dedup repair. If that prerequisite fails, the experiment stops. Inspect learner.rows and sendBeforePersistControl.rows in the receipt. With a correct guard, no crash-only row should contain two certificates. The unsafe control should expose the gap after its first effect. Explain why “allSignaturesAuthentic: true” can coexist with conflicting certificates.

The two block IDs are synthetic names. The certificate experiment does not execute their transactions or choose a head. Its evidence concerns signing discipline only. Unlike simulate transfer from module 08, this experiment is deterministic at the decision level, but each run has new ephemeral keys and signatures. Its receipt includes public keys and signed votes; it does not export private keys. Compare decisions and memberships, not signature bytes between runs.

## Changed case: the disk lies about the past

Now change one assumption: after a crash, the storage layer restores an empty old snapshot, erasing even a committed vote. The validator identities rotate to d as the malicious signer, c as the restarted signer, b voting only X and a voting only Y; the height is 19. Predict the outcome with your correct guard before running:

```sh
node restart.mjs simulate rollback
```

Find a row in which X was persisted and sent before the snapshot rollback, yet Y is later sent too. Name both quorums and their intersection. Why can't a pure function distinguish an erased empty journal from a genuinely fresh one? What assumption must a stronger system provide outside this function? Discuss a trusted non-rollbackable record or exclusive signer as an assumption to investigate, not as a security feature implemented here.

{{practice:09b}}

## Deliver evidence and state the boundary

Your report should contain the saved predictions, the source hashes and receipt paths, a concrete unsafe crash trace, a concrete safe trace, and the changed-case counterexample. Explain the difference between a duplicate retransmission and a conflicting vote. Explain why rejecting every request would satisfy silence but fail the project's progress requirements. Include one additional threat outside the model, such as two concurrent processes sharing a signing key with separate journals.

A reviewer awards 0 (missing or incorrect), 1 (partly supported), or 2 (correct with a concrete trace) for each: effect ordering and retry behavior; derivation of the two certificate sets; explanation of the rollback indistinguishability; honest distinction between modeled crashes and real persistence. The project target is passing executable checks and 2 in each reasoning dimension. It is not a validated mastery threshold.

The journal is an in-memory model, not a filesystem implementation. The fixture holds one key pair per identity across simulated crashes inside a single process, then discards it at process exit. We do not test fsync, torn writes, real power loss, key migration, concurrent signers, adversarial storage or network transport. Modules 01–08 retain their original assumptions. This extension supplies no locking across consensus rounds, proof of finality or guaranteed progress after split votes.

For context, Tendermint's documentation describes flushing its consensus write-ahead log before processing its validator's own messages to support deterministic recovery. Our much smaller decision journal isolates one ordering lesson; it is not Tendermint's WAL or signing protocol. See SOURCES.md for the reference.
