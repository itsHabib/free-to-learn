"""Your incremental decoder. Keep first attempts in notebook records before edits."""


class Decoder:
    def __init__(self):
        # Add your pending-byte buffer and lifecycle state here.
        pass

    def feed(self, chunk):
        """Return complete printable-ASCII payload strings from this byte chunk."""
        raise NotImplementedError("Implement Decoder.feed; follow START-HERE.md section 4.")

    def finish(self):
        """Mark EOF; reject an unfinished header or payload."""
        raise NotImplementedError("Implement Decoder.finish; follow START-HERE.md section 4.")
