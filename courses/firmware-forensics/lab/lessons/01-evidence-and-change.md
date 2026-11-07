# Lesson: four questions, not one green badge

**Outcome:** make a reproducible claim about a release change, without claiming
more than the observed bytes support. Budget roughly 45–75 minutes, not a deadline.

## 1. Parse before trusting a field

A binary table is a set of claims about byte ranges. First check the fixed header,
version, count and total length. Then prove that the complete table fits. Only
then decode entries, validate names, and check payload bounds and coverage.

Why not just slice `data[offset:offset+size]`? A short slice can look like a small
component even though the table requested unavailable bytes. An overlapping range
can give two names to the same bytes. Reject such ambiguity rather than silently
repairing input. Look at `truncated.efw`, `overlap.efw` and `unsafe-name.efw`:
these are intentionally malformed controls, not hardware firmware.

## 2. A component map is not a boot trace

Inspect a valid fixture and find `boot`, `kernel`, and `config`. Each table entry
has a byte range, kind, version, and declared digest. Recompute the digest from
the payload. Use the manifest's names to join declarations to actual components,
not their positions in two arrays. Dependencies are checked for missing nodes and
cycles before offering a dependency-first ordering.

This graph says what the manifest **declares**. You did not boot anything, read a
hardware measurement register, or observe a real loader. Those would require
different evidence. No component in this exercise contains executable firmware.

## 3. Keep four evidence axes separate

| Axis | A positive result means | It does not establish |
|---|---|---|
| Component integrity | Computed payload hashes match the embedded declarations | Who wrote those declarations |
| Manifest consistency | Container/components/dependencies agree with the supplied manifest | A vendor signed or authorized them |
| Origin | Always **unverified** in this slice | Any authenticated provenance |
| Local policy | Required values/components/release floor satisfy this supplied policy | Benign behavior, hardware state, or vendor approval |

Do not replace these with `trusted = all_hashes_match`. If someone rewrites both
a payload and its digest, the relationship still holds. An external signed
manifest could help authenticate a relationship, but only with correctly verified
signatures, trusted roots and policy; none is implemented here. Even authenticated
provenance would not prove benign behavior.

Try the `hash-mismatch` fixture against the release-1 manifest: you should see a
payload inconsistency. Then inspect `release-2-observed` with its own manifest:
its hashes are internally consistent while the configuration conflicts with the
local policy. The second case is why origin, integrity and policy are separate.
Call it a **policy-inconsistent benign configuration substitution**; the evidence
alone does not identify an actor or prove vendor-unauthorized activity.

## 4. Build the comparison by identity

Turn inventories into a reliable comparison:

1. Find the union of component names. Process names in sorted order.
2. For names in only one release, emit `added` or `removed`.
3. For shared names, compare `kind`, `version`, `sha256` and `requires`.
   Dependency order does not matter; absence means an empty dependency list.
4. If `sha256` differs, report `content_changed`. Otherwise, changed metadata
   means `metadata_changed`; no differences means `unchanged`.
5. Keep all changed field names in sorted order, even when content takes priority.

Offsets and table position are not identity. A packaging reorder changes the
whole-file digest without changing a component's logical content. A version
bump with identical bytes is metadata, and a changed digest with the same version
is still a byte change. Neither fact alone explains the author's intent.

The starter docstrings are the contract; the supplied tests are feedback. Read
one failed case at a time, preserve the output, revise in a fresh attempt, then
rerun the actual selected source rather than editing a saved result.

## 5. Turn outputs into an investigation

For each claim, cite a component name plus the relevant field/digest or policy
finding. Separate three categories in your report:

- **Observed:** e.g. a digest differs, a named node is absent, a config value fails
  the supplied policy, or a declared dependency exists.
- **Inference:** e.g. a change appears consistent with repackaging. Explain which
  facts support it and what would disprove it.
- **Unknown:** origin, real boot behavior, actor intent, hardware measurements,
  and authenticated authorization are not established.

Finish the changed-release-floor challenge in the README. It adds a requirement
without changing the same baseline bytes: does your summary keep that new policy
failure separate from matching integrity evidence?
