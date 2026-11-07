"""Owned faulty parser. Preserve this file before making a narrow repair."""
import json
from pathlib import Path
import sys
HEADER=12
WIDTH=8
MAX_COUNT=1024
LIMIT=HEADER+WIDTH*MAX_COUNT
def inspect(raw):
    if not isinstance(raw,bytes): raise TypeError('Expected bytes')
    if len(raw)<HEADER or len(raw)>LIMIT: raise ValueError('Invalid bounded file length')
    if raw[:4]!=b'TRL1': raise ValueError('Bad magic')
    count=int.from_bytes(raw[4:6],'little')
    width=int.from_bytes(raw[6:8],'little')
    payload=int.from_bytes(raw[8:12],'little')
    if count>MAX_COUNT: raise ValueError('Count exceeds 1024')
    if width!=WIDTH: raise ValueError('Entry width must be 8')
    if payload!=count*width: raise ValueError('Count, width and payload disagree')
    if len(raw)!=HEADER+payload: raise ValueError('Declared size differs from file size')
    entries=[]
    cursor=HEADER
    end=payload  # candidate boundary; diagnose before changing it
    for index in range(count):
        if cursor+WIDTH>end:
            raise ValueError(f'entry {index}: next={cursor+WIDTH} exceeds end={end}')
        entry=raw[cursor:cursor+WIDTH]
        entries.append({'tick':int.from_bytes(entry[:2],'little'),
                        'delta':int.from_bytes(entry[2:4],'little',signed=True),
                        'tag':entry[4], 'unknown_hex':entry[5:8].hex()})
        cursor+=WIDTH
    return {'count':count,'entry_size':width,'payload_bytes':payload,'entries':entries}
def inspect_file(path):
    with Path(path).open('rb') as stream: raw=stream.read(LIMIT+1)
    return inspect(raw)
if __name__=='__main__':
    try:
        if len(sys.argv)!=2: raise ValueError('usage: inspector.py FILE')
        print(json.dumps(inspect_file(sys.argv[1])))
    except (OSError,ValueError) as error:
        print(f'Cannot inspect: {error}',file=sys.stderr); sys.exit(2)
