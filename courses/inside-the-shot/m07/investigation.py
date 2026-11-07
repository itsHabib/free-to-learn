"""Use only raw/mode; keep first versions in notebook records before checking."""
def decode(raw):
    """Return {'initial': int, 'records': [{'op': int, 'slot': int, 'amount': int}, ...]}.
    Raise ValueError for malformed or non-bytes input. Infer the layout.
    """
    raise NotImplementedError('Infer and implement the file decoder from evidence.')


def analyze(raw, mode='individual'):
    """Return the native events/final/committed object; mode is individual or atomic.
    Use decode(raw) and a state model. Raise ValueError for invalid input/mode.
    """
    raise NotImplementedError('Infer and implement replay; preserve rejected operations.')
