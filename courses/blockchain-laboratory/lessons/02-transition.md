# 02 · Apply it once

Two copies of the same authentic message arrive. Implement a transition that changes state once and makes the replay ineligible.

Your artifact is `applyTx`. A state maps each account name to a balance and nonce. A nonce is the next transaction sequence number that the sender may use. The starting balance is just a counter; it has no monetary value.

## Authorization meets current state

Worked example: a starts at `(balance 20, nonce 2)`, b at `(4,0)`. An authentic a→b amount 5, nonce 2 is eligible. Copy the input, subtract 5 from a, add 5 to b, then increment a's nonce. The result is a `(15,3)`, b `(9,0)`. The total remains 24. The original input remains unchanged so another branch can execute from it independently.

Now replay that message. Its signature still verifies, but nonce 2 differs from a's next nonce 3. Reject it without changing anything. A future nonce 4 also rejects against this state: this transition cannot assume nonce 3 will eventually arrive. Later the mempool will decide what to do with future transactions.

Complete the final step of the example: after copying and moving the counters, which account's nonce changes? Only the sender authorized an action. Receiving counters does not consume the recipient's next sending nonce.

{{practice:02a}}

## Atomic means no partial effect

Suppose a has balance 3 and tries to send 5. Checking funds after subtracting would temporarily create −2. If you return that mutated object on failure, a rejected message has changed history. Check all preconditions before touching a private copy. Either return a complete new state or a failure; never return a partially applied state.

Self-transfer exposes careless assignment order. From a `(20,2)`, sending 5 to a should leave balance 20 and advance nonce to 3. If your code reads two old balances and overwrites the same property twice, it may accidentally produce 25 or 15. Perform debit and credit on the same copied record, or handle self-transfer explicitly. The amount must still be affordable; a self-transfer is not a permission to pass nonsensical amounts.

JavaScript integers stop representing every consecutive number beyond `Number.MAX_SAFE_INTEGER`. The envelope checks the input, but arithmetic can still overflow. Check the next sender nonce and, for a distinct recipient, the resulting recipient balance. This boundary test uses a synthetic fixture outside the normal 140-counter genesis; it protects the declared function contract.

{{practice:02b}}

## Checkpoint and changed case

Write `applyTx` and run `node lab.mjs check 02`. Do not comment out authentication because module 01 already exists: every externally callable transition must enforce its contract. Keep rejected-state and successful-state mutation tests separate.

For a changed case, a and b each sign a transaction sending their entire balance to c. Their nonces are independent. Decide whether swapping their order changes the final balances and whether it changes each sender's nonce. Then contrast two same-sender transactions with the same nonce: only the first can apply. You have now built the deterministic function every branch will reuse.
