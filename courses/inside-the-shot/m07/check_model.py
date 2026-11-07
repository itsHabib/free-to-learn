#!/usr/bin/env python3
"""Finite native comparisons on YOUR probe files and seeded byte mutations.

Contains no reservation rule or file-layout answer. Feedback is assistance.
This runs learner Python locally, not in a sandbox. It checks decoder shape,
not isolated field correctness; private assessment checks that separately.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile


def load(path):
    spec = importlib.util.spec_from_file_location('learner_model', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def strict_equal(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(right, dict):
        return left.keys() == right.keys() and all(strict_equal(left[k], right[k]) for k in right)
    if isinstance(right, list):
        return len(left) == len(right) and all(strict_equal(a, b) for a, b in zip(left, right))
    return left == right


def decoder_shape(value, events):
    if type(value) is not dict or set(value) != {'initial', 'records'}:
        raise ValueError('decode must return exactly initial and records')
    if type(value['initial']) is not int or not 0 <= value['initial'] <= 64:
        raise ValueError('decode initial must be an int in 0..64')
    rows = value['records']
    if type(rows) is not list or len(rows) != len(events):
        raise ValueError('decode record list must match the native event count')
    for row in rows:
        if type(row) is not dict or set(row) != {'op', 'slot', 'amount'}:
            raise ValueError('decoded record requires exactly op, slot and amount')
        if any(type(row[k]) is not int for k in row):
            raise ValueError('decoded fields must be ints, not bools')
        if not 1 <= row['op'] <= 4 or not 0 <= row['slot'] <= 4 or not 0 <= row['amount'] <= 64:
            raise ValueError('decoded field outside supplied value bounds')


def native(binary, raw, path):
    path.write_bytes(raw)
    result = subprocess.run([str(binary), str(path)], capture_output=True, text=True, timeout=5)
    if result.returncode == 2 and not result.stdout and result.stderr.startswith('refused:'):
        return None
    if result.returncode != 0 or result.stderr:
        raise RuntimeError(f'Target evidence failed: exit {result.returncode}: {result.stderr[:200]}')
    return json.loads(result.stdout)


def verify_target(root, target):
    manifest = json.loads((root / 'manifest.json').read_text())
    info = manifest['variants'][target]
    binary = root / info['binary']
    if hashlib.sha256(binary.read_bytes()).hexdigest() != info['binary_sha256']:
        raise RuntimeError('Target hash differs from manifest; re-extract the original bundle.')
    return binary.resolve()


def check(model_path, corpus, root, target, seed=20261018):
    binary = verify_target(root, target)
    model = load(model_path)
    mode = 'atomic' if target == 'atomic' else 'individual'
    paths = sorted(corpus.glob('*.bin'))
    if not 1 <= len(paths) <= 24:
        raise ValueError('Corpus needs 1..24 regular .bin files.')
    probes = []
    for path in paths:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 73:
            raise ValueError('Probe must be a regular file of at most 73 bytes.')
        probes.append(path.read_bytes())
    rng = random.Random(seed)
    cases = set(probes)
    cases.update((b'', b'\0' * 8, b'X' * 73))
    for raw in probes:
        cases.update(raw[:i] for i in range(len(raw)))
        cases.add(raw + b'\0')
        if raw:
            for _ in range(100):
                mutant = bytearray(raw)
                mutant[rng.randrange(len(raw))] = rng.choice([0, 1, 2, 3, 4, 16, 64, 65, 127, 255])
                cases.add(bytes(mutant))
    valid = refused = 0
    accepted_seen = rejected_seen = False
    with tempfile.TemporaryDirectory(prefix='m07-public-') as folder:
        probe_path = Path(folder) / 'probe.bin'
        for raw in sorted(cases):
            expected = native(binary, raw, probe_path)
            if expected is None:
                refused += 1
                for function, args in [(model.decode, (raw,)), (model.analyze, (raw, mode))]:
                    try:
                        function(*args)
                    except ValueError:
                        continue
                    except Exception as error:
                        raise AssertionError(f'Malformed bytes must raise ValueError, got {type(error).__name__}: {raw.hex()}') from error
                    raise AssertionError(f'Malformed bytes must raise ValueError: {raw.hex()}')
                continue
            valid += 1
            decoder_shape(model.decode(raw), expected['events'])
            observed = model.analyze(raw, mode)
            if not strict_equal(observed, expected):
                raise AssertionError(f'Behavior mismatch for {raw.hex()}\nexpected {expected}\nobserved {observed}')
            accepted_seen |= any(e['accepted'] for e in expected['events'])
            rejected_seen |= any(not e['accepted'] for e in expected['events'])
    for invalid in (None, 'bytes', bytearray(b''), 1):
        for function, args in [(model.decode, (invalid,)), (model.analyze, (invalid, mode))]:
            try:
                function(*args)
            except ValueError:
                continue
            except Exception as error:
                raise AssertionError(f'Non-bytes input must raise ValueError, got {type(error).__name__}') from error
            raise AssertionError('Non-bytes input must raise ValueError')
    try:
        model.analyze(probes[0], 'unknown')
    except ValueError:
        pass
    else:
        raise AssertionError('Unknown mode must raise ValueError')
    if not valid or not refused or not accepted_seen or not rejected_seen:
        raise ValueError('Add probes with at least one accepted and one rejected event; this corpus cannot check both.')
    return {'valid': valid, 'refused': refused, 'seed': seed, 'target': target,
            'notice': 'Finite behavior and decoder-shape checks only; reasoning and isolated field correctness need review.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--target', choices=['individual', 'atomic', 'optimized'], default='individual')
    parser.add_argument('--seed', type=int, default=20261018)
    args = parser.parse_args()
    print(json.dumps(check(args.model.resolve(), args.corpus, Path(__file__).resolve().parent,
                           args.target, args.seed), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, AssertionError, RuntimeError, ImportError, AttributeError,
            NotImplementedError, TypeError, KeyError, IndexError, RecursionError, subprocess.TimeoutExpired) as error:
        print(f'Check incomplete or disagreed: {error}', file=sys.stderr)
        sys.exit(1)
