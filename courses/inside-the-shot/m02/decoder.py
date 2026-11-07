"""Your baseline parcel decoder. Save an attempt before running checks."""


def decode(raw: bytes) -> dict[str, int]:
    """Decode one record to exactly kind, units and credit (all real ints).

    Accept bytes of the record's exact length, including arbitrary padding.
    Raise ValueError for any other type or length. Keep this function pure:
    no files, subprocesses, printing or state retained between calls.
    """
    raise NotImplementedError("Infer the baseline layout from your saved evidence, then implement decode(raw).")
