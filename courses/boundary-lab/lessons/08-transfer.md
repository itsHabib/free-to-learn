# 8. Transfer: two plugins and a delayed operation

**Goal:** adapt the authority argument when checking a request and applying its effect occur at different times.

This is a less-guided challenge. Modules 1–4 and 6–7 taught the necessary ideas: trusted principal context, live grant identity, rights/ranges, atomic effects and explicit claims. There is no repair walkthrough or answer key in the learner package.

## 8.1 The changed product

The tile studio now has two plugin principals. A plugin can submit an output operation for later execution. Between submission and commit, the application may revoke a grant, reuse a slot for another generation, or change an unrelated grant.

The required rule is precise: a revocation effective before commit prevents that operation's effect. Changes to unrelated authority must not arbitrarily stop an otherwise valid operation. A queued request cannot gain another principal's authority or silently acquire the authority of a reused handle slot.

The `Queued` value records the original principal, handle, grant epoch, operation and range. Current grants and the current global epoch are supplied at the decision point. Repair `Learner::queued` to answer whether the request may commit under the stated contract. Do not assume that every increment of the global epoch revoked this particular grant.

Generations and epochs are not globally unique grant identities. Two live grants may share a principal, generation, epoch, rights and usable range while naming different slots and objects. Revoking one must not let the other authorize a write through the revoked handle. Conversely, revoking the other slot must leave the original request usable. State which fields bind a queued request to its exact live authority before writing the predicate.

## 8.2 Your investigation

Before running the public `transfer` group, commit a prediction and draw a timeline of the events you believe matter. Name the assumption from the synchronous broker that no longer holds. Do not start from a patch you remember; start from the new claim.

The ten public Q cases are practice checks for the interface contract. They include ordinary completion, revoked authority, reused generation, an unrelated epoch change, a different principal and competing live slots with the same generation and epoch. They are inspectable and cannot be called secret or independent assessment.

After repairing the policy, propose a new schedule combining at least two changed conditions, and a second schedule in which work must still succeed. State the decision at the commit point and support it with the grant's identity and lifecycle. Do not just replace job numbers in a public case.

For each schedule, predict every object's complete final bytes. Include a live competing grant, nonzero grant windows, and an independent operation that must still succeed. Check that denial changes no bytes, permission changes exactly its intended window, and the competing object's bytes remain untouched. A vector of permission booleans alone does not establish those effects.

## 8.3 What your evidence can establish

The current portable slice evaluates the delayed-authorization decision and supplies a deterministic event driver in `schedule.rs`. Public cases Q06–Q10 queue writes, revoke an authority and commit, checking the decisions and object effects. Q08–Q10 compare every byte across three objects; they vary grant order, commit order and which slot is revoked. This is a small in-memory event model, not a production asynchronous job system. You are not responsible for building a scheduler or storage system.

An independent final assessor should derive fresh interleavings from the published requirements, without sharing their concrete instances with the lesson author or learner. The revised package still needs independent final assessment. Keep your public-practice result separate from any later fresh-case result.

**Deliver:** a revised threat model; your queued policy; first and revised attempt records; one forbidden and one permitted novel schedule; an explanation of why slot identity, generation, principal, rights and timing each do or do not affect your decision; and remaining limits.

**Completion boundary:** passing the delayed-policy checks completes this portable challenge's public checks. It does not supply the missing Linux worker, independent review, human learning evidence or live Free to Learn acceptance.
