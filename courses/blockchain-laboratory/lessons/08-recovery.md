# 08 · Recover without inventing history

A partition heals after both sides executed valid but conflicting transactions. Rebuild from the winning branch and investigate the pending work that survives.

Your artifact is `reconcile`, followed by an incident report from the supplied finite scheduler. This is the integration task: every earlier mechanism is exercised, while the transport, keys and trace recorder remain supplied.

## Revalidate from the selected state

Worked example: old branch spends a nonce 0 sending 20 to b. The selected new branch spends a nonce 0 sending 30 to c. The old transaction was authentic and valid when first accepted; it is ineligible now because the new state already consumed nonce 0. Returning it to a ready pool without revalidation resurrects a conflict.

Do not reverse old balance arithmetic into whichever state happens to be current. The supplied path records already carry the deterministic result of every validated branch. Select the new tip's state, gather old-branch transactions plus pending candidates, remove transaction IDs included on the new path, then rerun the bounded mempool policy. Return a copy of the new state. Pending transfers are not yet committed balances.

Complete the final step: a still-valid orphan b→c can fund a waiting c→d. Repeated eligible selection must discover the dependency even if c→d appears earlier among candidates. This is module 04 returning inside a different problem, not a separate algorithm to improvise.

{{practice:08a}}

## Storage policy has observable consequences

The ready-only pool returns eligible candidates and drops the rest. During a sequence of intermediate head changes, a candidate may become temporarily ineligible and be forgotten. If a later state would permit it, correct validation cannot recover input that no longer exists. A separate retained candidate queue, journal or rebroadcast mechanism could address that liveness concern; our runtime does not pretend it has one.

The simulator therefore reports two observations separately: the live ready pool after all intermediate updates, and one recovery using an explicitly retained set of original candidates. Differences are evidence of the declared policy, not a reason to fabricate a successful rebroadcast. Generated ephemeral keys can change equal-height ID ties between processes; the selected final longer branch and retained-candidate result are stable, while intermediate trace details can differ.

{{practice:08b}}

## The unfamiliar transfer incident

First pass module 08: `node lab.mjs check 08`. Before running the transfer schedule, write a prediction in `work/incident.md` using the report template. Do not open instructor material. This is an unfamiliar composition of earlier mechanisms, not a hidden or source-secure examination.

Genesis is a=100, b=40, c=0, d=0, with all nonces 0. Left creates L1 containing a→b amount 30 nonce 0, then L2 containing b→c amount 8 nonce 0 followed by c→d amount 5 nonce 0. Right creates R1 containing a→c amount 50 nonce 0, R2 containing c→a amount 12 nonce 0, and R3 containing a→d amount 2 nonce 1.

Left has pending b→a amount 4 nonce 1 and c→d amount 6 nonce 1. On healing, left receives a fabricated high-height claim and a false-root claim, then R3, R2, R1 in reverse ancestry order, plus a duplicate R1. Right receives L2 before L1. A copied vote packet tries to turn two voter identities into three votes. A peer also presents a genuine proof of c's old L2 record as evidence about the current selected state.

Predict the final selected branch, all committed balances/nonces, the fate of each retained orphan/pending candidate, both false-block errors, the copied-vote decision and the stale-proof decision. State what additional condition would be needed for general progress, and why this exercise has not implemented it.

Now run `node lab.mjs simulate transfer`. Compare the receipt to your prediction, preserve every mismatch, and repair code if needed. To replay identical signed inputs and tie details, use `node lab.mjs replay work/attempts/YOUR-SIMULATION-ID/result.json`. The saved scenario contains public keys and signed messages, never private keys. The final report needs a concrete counterexample outside one declared assumption. Use the rubric in COURSE.md; a green process exit alone cannot evaluate your reasoning.

## Deliver your laboratory

Run all checks and preserve the resulting source hash. Your output is the learner-authored protocol file plus your incident report and receipts. An implementation, a reasoned trace and an honest account of assumptions together support review. They still do not establish production security, general network behavior or human learning gains.
