# Recovery reasoning

Assistance used:

## Application practice before the first check

Read the worked examples first. These questions practise and explain the stated contract; they are not an unseen mastery test. Record your own reasoning before implementation and compare it with post-check feedback.

1. Explain the roles of package, configuration and snapshot. What does rolling back only the package leave unresolved?
2. Release `r4` is requested but only `r1` and `r2` are present. State the exact refusal and explain why a fallback would change the request.
3. Release `r2` requires schema 2 and configuration `c9/k9`. Compare snapshots schema-2/c9/k8 and schema-1/c9/k9. Explain why changing the displayed schema is not a restore.
4. Compatible snapshots have ordinals 5 and 8; an incompatible snapshot has ordinal 13. Predict selection under two different array orders. Resolve a tie between `m-snap` and `B-snap` at ordinal 8.
5. Explain the worked baseline, narrowed-configuration candidate, code-only and full recovery outcomes for the 250 mm idle pickup.
6. Which evidence would establish successful recovery? Which evidence would be needed to claim that no acknowledged action was lost?

## First checker result and any repair

- Criterion and original result:
- Input, expected tuple/refusal and actual tuple/refusal:
- Teaching section and specific condition repaired (or why no repair was needed):
- Fresh compatibility or ordering example, with predicted output:

## Trial evidence

- Report path and candidate source identity:
- Baseline package/configuration/snapshot IDs and hashes:
- Candidate package/configuration/snapshot IDs and hashes:
- Code-only outcome and incompatible state schema:
- Selected recovery tuple:
- Baseline and recovered action results, cargo and score:
- Original tick / restored tick / discarded operations:
- Lost successful actions and score difference:
- Original and restored action lineage / input sequence:
- Highest acknowledged sequence before restore / restored last sequence / reopened range:
- Whether state was restored / whether the following action applied:
- Why recovery did not preserve all acknowledged history:
- What a recovery epoch or retained sequence floor would need to coordinate beyond this trial:

## Revision log

Append later code changes, results, reasoning and assistance. Preserve the original trial, whether it passed or failed, and the first answers above. A new successful branch does not overwrite or erase the failed candidate evidence.

## Transfer for review (not automatically graded)

A repair service changes a saved job from `{remainingTicks:4,charged:true}` to `{schedule:{remaining:4},receipt:{charged:true}}`. An older package only reads the first format. A customer payment completed after the last old-format snapshot. Describe a compatible recovery tuple, one test of resumed repair behavior, and the financial action a snapshot restore cannot undo safely by itself. State what you would refuse to claim without a transaction or compensation mechanism. Keep your first answer and append corrections.
