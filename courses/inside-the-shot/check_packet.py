#!/usr/bin/env python3
"""Compare an extracted course with its baseline; never execute its contents."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re


def check_packet(root, targets_only=False):
    root = Path(root).resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('schema') != 're-lab-complete-student-v1':
        raise ValueError('Not a complete course manifest')
    files = manifest.get('files')
    if not isinstance(files, dict) or not files:
        raise ValueError('Manifest has no file inventory')
    names = manifest.get('native_assets') if targets_only else list(files)
    if not isinstance(names, list) or not names or any(not isinstance(n, str) for n in names):
        raise ValueError('Manifest has no native/listing inventory for this check')
    changed = []
    for name in names:
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts or '\\' in name or name == '.':
            raise ValueError('Manifest path must stay within this packet')
        expected = files.get(name)
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-f]{64}', expected):
            raise ValueError('Invalid file fingerprint: ' + name)
        path = root / relative
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError('Manifest path must be a local regular file: ' + name)
        if not path.is_file():
            changed.append(name + ' (missing)')
            continue
        with path.open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual != expected:
            changed.append(name)
    return {'checked': len(names), 'changed': changed, 'targets_only': targets_only}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--targets-only', action='store_true',
                        help='Check supplied native/listing assets after intentional model edits')
    args = parser.parse_args()
    try:
        result = check_packet(args.root, args.targets_only)
    except (OSError, ValueError, TypeError) as error:
        print('Packet check unavailable: ' + str(error))
        return 2
    if result['changed']:
        for name in result['changed']:
            print('Packet differs: ' + name)
        return 1
    print('Native/listing assets match the manifest.' if args.targets_only
          else 'Packet files match the manifest.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
