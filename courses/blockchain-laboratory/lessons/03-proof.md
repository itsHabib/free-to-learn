# 03 · Prove a state claim

A peer claims c has eight counters but sends only a small proof. Compute whether the claim belongs to the exact state commitment you trust.

Your artifacts are `stateRoot` and `verifyProof`. A Merkle tree repeatedly hashes pairs of hashes into a single root. A membership proof supplies the sibling hashes needed to reconstruct that root from one claimed leaf. This saves sending every account, but it does not choose which root is authoritative.

## Commit to structure as well as content

Sort account names. Encode each account as `[name,balance,nonce]`, then call the supplied `leafHash`. Internal pairs use `branchHash`. The two helpers use different prefixes so a leaf's encoded content is not confused with an internal pair. At an odd-width level duplicate the last hash. Finally use `rootHash(count,top)` to bind the number of leaves. For the empty state, the top is SHA-256 of empty bytes.

Worked example with four leaves A, B, C, D: form AB=`branchHash(A,B)` and CD=`branchHash(C,D)`, then top=`branchHash(AB,CD)`. Wrap count 4 with that top. To prove leaf C (index 2), the proof supplies D first and AB second. Index 2 is even, so hash C on the left of D; the next index is floor(2/2)=1, so hash AB on the left of CD. Wrap count 4 and compare with the trusted root.

{{diagram:merkle}}

Complete this example before coding: for leaf B at index 1, the first sibling is A. Place A on the left, not on the side determined by arrival order. The direction follows the position.

{{practice:03a}}

## A valid proof can still be the wrong evidence

Every proof is relative to a root. An old root can honestly commit to an old balance while the currently selected history has another balance. The verifier cannot answer “latest” from the path alone. It also cannot establish that the entire hidden tree is sorted; it checks membership at the claimed position. The state-root producer's deterministic construction and the node's validation layer establish that additional context.

Check the proof's exact shape, integer index/count bounds and exact path length. Reject a missing sibling rather than substituting an empty hash. Reject extra siblings rather than stopping early. At an odd-width final position, the supplied sibling must equal the current hash because the rule duplicates it. Bind the count so a three-leaf tree and a four-leaf tree ending with a duplicate are not treated as the same commitment.

Our odd-leaf duplication and outer size commitment are classroom choices. RFC 9162 uses a different tree construction; do not claim wire compatibility. The useful shared ideas are domain-separated hashes and verifying a path against a known commitment.

{{practice:03b}}

## Checkpoint and changed case

Implement the root, then the verifier, and run `node lab.mjs check 03`. The fixture generator supplies proofs so you can focus on checking them. The frozen genesis root is a useful regression vector, but one matching root does not prove general correctness: the checks also cover three leaves, one leaf, the empty state, reordered properties, tampered claims and stale roots.

For your changed case, a branch changes only c's nonce through a self-transfer. Its balance stays the same. Predict whether a proof of the old `(balance,nonce)` record still verifies under the new root. Explain why committing only balances would hide a replay-relevant state change. Keep that argument for the capstone's stale-proof incident.
