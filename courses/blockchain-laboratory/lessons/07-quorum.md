# 07 · What can a quorum promise?

One side of a partition repeats the same signed vote three times. Verify distinct authenticated voters and explain why safety can require waiting.

Your artifact is `verifyCertificate`. The lab has four fixed validators and asks for three distinct matching votes. A vote binds the voter, height and block ID in a separate signed message domain. This checker is not a complete consensus protocol: it contains no leader election, round changes, locking protocol or durable restart logic.

## Count identities, not packets

Worked example: votes from a, b and c for block X at height 2 form a three-voter certificate. Packets [a,a,b] do not. A vote by c for X at height 3 does not join the height-2 certificate. A vote by c for Y at height 2 does not support X. Invalid packets may be ignored; they must not prevent three other valid matching votes from forming a certificate.

Your verifier first checks that the target is a nonnegative safe integer height and a 64-character lowercase hex block ID, and that votes arrive as an array. It then checks each vote's exact shape, fixed membership, matching target and signature before adding the voter to a Set. Complete the last step: return true only if the Set has at least three names. Do not count the same key twice because the envelope was copied.

The order of those steps matters. Suppose a forged packet names a, followed by genuine matching votes from a, b and c. Reserving a's name before checking the forged signature would discard the later genuine vote and hide an available quorum. Even an authentic vote for another height must not reserve that identity for this height. Before adding an identity, decide which checks must already have succeeded. Then compare the forged-first and forged-last orders: both must recognize the same three valid voters. This prevents invalid evidence from suppressing progress; it does not create any new consensus or network-liveness guarantee.

Consider two size-three subsets of four validators. They overlap in at least 3+3−4=2 validators. If at most one validator equivocates, at least one overlapping validator is honest. If honest validators never sign competing values for the same height, two conflicting certificates at that height cannot both form. Every “if” in that sentence is part of the result.

{{practice:07a}}

## The cost of preserving the rule

In a 2+2 partition, neither side can collect three local identities. Duplicating packets would not create a quorum; lowering the threshold would change the overlap argument. Waiting preserves the declared fixed-height safety rule but prevents local progress.

Healing the partition is not by itself a complete liveness proof. If honest validators already cast incompatible votes and never change them, a three-vote certificate may remain impossible even after messages resume. Real consensus protocols need additional rules to move through rounds safely. We deliberately have not implemented those rules, so do not claim general Byzantine consensus or eventual certificate formation.

A certificate also does not replace block validity. Three keys can sign a false state claim; your node still validates the block. Conversely, a valid selected branch may have no certificate. Keep the layers separate in both code and your incident report.

{{practice:07b}}

## Checkpoint and changed case

Run `node lab.mjs check 07`. Then write two short arguments: one for fixed-height uniqueness under the stated fault bound, one showing loss of liveness in a 2+2 cut. Use identities and sets, not a vague claim that “a majority is secure.”

For a changed case, permit two equivocating validators. Construct two different sets of three voters that overlap only in those two. Each remaining honest validator can sign one value without breaking its rule, yet both certificates can form. This is a counterexample outside the original fault bound, not a contradiction of the bound. Explain why a correct cryptographic signature does not stop an authorized signer from signing incompatible messages.
