# 04 · Pending is not accepted

The next transaction arrives before its predecessor. Build a bounded pending-transaction selection policy that can revisit it after state advances.

Your artifact is `selectMempool`. A mempool is local candidate storage, not agreed history. In this lab the function returns only currently executable transactions in an order that can be applied. It does not preserve a quarantine queue for everything else.

## Eligibility changes during selection

Worked example: a has nonce 0 and balance 20. Arrival order is T1=(a→c, 4, nonce 1), then T0=(a→b, 5, nonce 0). On the first pass T1 is future and cannot execute. T0 executes on the private working state, leaving a balance 15 and nonce 1. On the next pass T1 becomes eligible; selecting it leaves balance 11 and nonce 2. Stop after a pass makes no progress or the limit is reached.

This is not sorting by nonce. Two senders have independent nonce sequences, and one transaction can fund another sender. From c balance 0, c→d cannot execute until a→c funds it. Repeated eligible passes solve both examples using the transition you already wrote, without inventing a second set of state rules.

Complete the control flow: after a full pass with `progress === false`, continuing cannot change state. Break. Repeatedly retrying the same unfunded input forever is a liveness bug in the program itself.

{{practice:04a}}

## Local policy is not consensus validity

If two authentic transactions spend the same nonce, the first eligible one in this function's input wins. Another node may see the reverse order and prefer the other. Both preferences are reasonable local policies under this contract. Once a valid block chooses one, every node must execute that block in its stated order.

Use `txId` to suppress duplicate selection and retain the limit even during a pass. Never mutate the caller's state or input list. Validate malformed envelopes before computing their IDs; hostile traffic is data, not a reason to crash a whole selection pass.

This simple pool drops currently ineligible candidates from its returned set. Real systems may retain future transactions, impose per-account limits, prioritize fees or protect against resource exhaustion. Those are extra policies, with extra assumptions. Our capstone will show exactly what is lost when a candidate is dropped and no copy remains.

{{practice:04b}}

## Checkpoint and changed case

Implement repeated passes and run `node lab.mjs check 04`. Record the selected transaction IDs, not just the number selected. Selecting two conflicting messages is not equivalent to selecting a valid dependency chain of length two.

For a changed case, use pool order [c→d amount 6, a→c amount 3, b→c amount 4], all nonce 0 and a/b funded. Decide whether c's transfer can execute after one funding transaction or requires both. Then set the limit to 2 and explain why the returned list can legitimately exclude c's transfer even though enough candidates exist to enable it later. A bounded policy trades completeness for work limits.
