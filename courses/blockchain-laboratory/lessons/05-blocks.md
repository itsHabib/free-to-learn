# 05 · A block is a claim

A peer advertises a long history with a convincing-looking hash. Validate the claimed child from its accepted parent before letting it compete for selection.

Your artifact is `validateBlock`. The supplied runtime stores validated records and buffers children whose parents have not arrived. Your function owns the boundary between an untrusted block object and a record fork choice may inspect.

## Recompute instead of believing

A block supplies a parent ID, height, ordered transactions and claimed state root. Work from the accepted parent's state. Check that the parent ID matches and the child height is exactly one greater. Apply each transaction in order through `applyTx`. Compute `stateRoot` from the resulting state and compare it with the claim. Only then compute the block's ID and return a validated record.

Worked example: parent P is height 2 with a=(12,1), b=(3,0). Its child claims height 3 and contains a→b amount 4, nonce 1. Execution yields a=(8,2), b=(7,0). A matching commitment authenticates that deterministic result relative to the input parent. If the child instead supplies the root for a=(12,1), b=(3,0), its claim is false even though the transaction signature is real.

Complete the final step: when recomputed root differs, return `ROOT` without inserting any record into the accepted history. A hash-shaped string is not evidence that computation occurred.

{{practice:05a}}

## Missing evidence and invalid evidence differ

A child can arrive first because messages were reordered. That does not prove the child is invalid. The runtime buffers it outside fork choice, then retries it when a valid parent arrives. If the parent is rejected, the child never becomes a validated descendant. The supplied scheduler does this plumbing so your task remains protocol validation.

A block may include transactions your local pool did not prefer. Validate them against the common parent state, not your arrival order. By contrast, two same-sender/same-nonce transactions in one block cannot both execute: after the first, the second is a replay. The entire block rejects; the parent state remains available unchanged.

The 16-transaction bound is a classroom resource bound. Reject malformed block shapes and oversized arrays before execution. There is no claimed proof-of-work, proposer identity or reward. Anyone in this controlled fixture can propose a block; that fact sharply limits what the later fork rule can promise.

{{practice:05b}}

## Checkpoint and changed case

Implement and run `node lab.mjs check 05`. Check error categories as well as acceptance: a false height and a false state root violate different preconditions. Neither is “just a fork we dislike.”

For a changed case, an invalid high-height block and a valid shorter block arrive together. Explain which one is even eligible for fork choice. Then consider a child of the invalid block. It cannot borrow the other block's state merely because the heights match. Parent identity links a specific transition history, not a generic height bucket.
