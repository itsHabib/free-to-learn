#!/usr/bin/env python3
"""Create a NEW bounded binary probe from hex, or change one byte in an existing probe."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--hex')
    source.add_argument('--source', type=Path)
    parser.add_argument('--offset', type=int)
    parser.add_argument('--value', type=int)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.source:
        if args.source.is_symlink() or not args.source.is_file():
            parser.error('source must be a regular file, not a symlink')
        with args.source.open('rb') as stream:
            raw = bytearray(stream.read(74))
        if len(raw) > 73:
            parser.error('source exceeds 73-byte probe bound')
        if args.offset is None or args.value is None or not 0 <= args.offset < len(raw) or not 0 <= args.value <= 255:
            parser.error('mutation needs an in-range --offset and --value 0..255')
        raw[args.offset] = args.value
    else:
        if args.offset is not None or args.value is not None:
            parser.error('offset/value are for --source only')
        if len(args.hex) > 512:
            parser.error('hex text too long')
        try:
            raw = bytes.fromhex(args.hex)
        except ValueError:
            parser.error('hex needs complete byte pairs')
        if len(raw) > 73:
            parser.error('probe exceeds 73-byte bound')
    try:
        with args.out.open('xb') as stream:
            stream.write(raw)
    except OSError as error:
        parser.error(str(error))
    print(f'Wrote {len(raw)} bytes to {args.out}')


if __name__ == '__main__':
    main()
