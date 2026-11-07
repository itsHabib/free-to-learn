"""Your changed-layout parcel decoder. Save a fresh prediction first."""


def decode(raw: bytes) -> dict[str, int]:
    """Return exactly kind, units and credit as real ints; ignore padding.

    Accept bytes of the changed record's exact length. Raise ValueError for
    other types or lengths. Use no files, subprocesses or retained state.
    """
    raise NotImplementedError("Infer the changed layout from new evidence, then implement decode(raw).")
