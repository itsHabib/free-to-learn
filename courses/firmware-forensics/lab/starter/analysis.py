"""Your implementation. No reference solution is shipped in the learner package."""


def compare_components(before, after):
    """Return name-sorted {name, status, fields_changed} records for every name.

    Inputs are unique-name lists of component dictionaries. Compare kind, version,
    sha256 and requires (dependency order is irrelevant; absent means []).
    Added/removed records have fields_changed=[]. For shared names, precedence:
    sha256 differs -> content_changed; another field differs -> metadata_changed;
    otherwise unchanged. fields_changed is alphabetically sorted.
    Ignore offsets, sizes, declared_sha256 and hash_matches for this comparison.
    """
    raise NotImplementedError("Implement component matching by name, not array position.")


def summarize_trust(report):
    """Return exactly {integrity, manifest, origin, policy} status strings.

    integrity: match/mismatch from component_hashes_match.
    manifest: absent if not manifest_present, otherwise match/mismatch.
    origin: always unverified in this hash-only slice, even for self-consistent data.
    policy: not_checked if not policy_checked, otherwise pass/fail from findings.
    These are separate axes; do not collapse them into a trusted/untrusted boolean.
    """
    raise NotImplementedError("Implement four independent evidence axes.")
