"""M3 starter. Infer from your saved probes; do not edit the native target."""
import json
from pathlib import Path
import sys
LIMIT=8204  # Supplied input safety limit, not an inferred offset.
def inspect(raw):
    """Return count, entry_size, payload_bytes, entries; reject malformed bytes."""
    raise NotImplementedError('Use your saved field and envelope evidence; see START-HERE.md')
def inspect_file(path):
    with Path(path).open('rb') as stream: raw=stream.read(LIMIT+1)
    return inspect(raw)
if __name__=='__main__':
    try:
        if len(sys.argv)!=2: raise ValueError('usage: inspector.py FILE')
        print(json.dumps(inspect_file(sys.argv[1])))
    except (OSError,ValueError) as error:
        print(f'Cannot inspect: {error}',file=sys.stderr); sys.exit(2)
