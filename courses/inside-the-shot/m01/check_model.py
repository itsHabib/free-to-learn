#!/usr/bin/env python3
"""Public finite behavior check, not a sandbox or reasoning assessment."""
import argparse
import runpy
import json
import random
from pathlib import Path
import subprocess
import sys

# Public probes. Expected outputs come from the matching owned native target.
CASES = [(0, 0, 0), (0, 0, 1), (10, 2, 1), (10, 6, 1),
         (-4, -6, -1), (15, -2, 1), (1, 3, -1), (1000, 6, 0)]
TARGETS = {'baseline': 'cart', 'transfer': 'cart-transfer', 'crossing': 'cart-crossing'}
CROSSING_CASES = [(-1, 0, 1), (-2, 0, 1), (-3, 0, 1), (0, 0, 1),
                  (1, 0, -1), (-1, -2, 1), (-6, 6, 0), (-7, 6, 0)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', help='Your own trusted Python source; importing it executes it locally.')
    parser.add_argument('--target', choices=list(TARGETS), default='baseline')
    parser.add_argument('--seed', type=int, default=20261017, help='Seed for additional public probes, not a hidden exam.')
    parser.add_argument('--samples', type=int, default=24, help='Additional public probes, 0 through 128.')
    parser.add_argument('--ticks', type=int, default=1, help='Compare 1 through 8 consecutive updates per probe.')
    args = parser.parse_args()
    if not 0 <= args.samples <= 128:
        parser.error('--samples must be 0 through 128')
    if not 1 <= args.ticks <= 8:
        parser.error('--ticks must be 1 through 8')
    random_source = random.Random(args.seed)
    anchors = CROSSING_CASES if args.target == 'crossing' else CASES
    cases = list(anchors)
    for index in range(args.samples):
        extent = 8 if args.target == 'crossing' and index % 2 == 0 else 100
        cases.append((random_source.randint(-extent, extent), random_source.randint(-6, 6),
                      random_source.randint(-1, 1)))
    candidate = Path(args.model).resolve()
    namespace = runpy.run_path(str(candidate))
    step = namespace.get('step')
    if not callable(step):
        raise ValueError('Define step(position, velocity, command).')
    executable = Path(__file__).with_name(TARGETS[args.target])
    failures = 0
    for position, velocity, command in cases:
        result = subprocess.run([str(executable), str(position), str(velocity), str(command), str(args.ticks)],
                                check=True, capture_output=True, text=True, timeout=3)
        current = (position, velocity)
        for observed in json.loads(result.stdout):
            expected = (observed['position'], observed['velocity'])
            actual = step(*current, command)
            valid = isinstance(actual, (tuple, list)) and len(actual) == 2 and all(type(x) is int for x in actual)
            if not valid or tuple(actual) != expected:
                failures += 1
                print(f"Mismatch at p={position}, v={velocity}, command={command}, tick={observed['tick']}: native={expected}, model={actual!r}")
                break
            current = tuple(actual)
    if failures:
        print(f"{failures}/{len(cases)} public probes disagree. Preserve this attempt before revising.")
        return 1
    print(f"{len(cases)} public probes agree ({args.ticks} ticks per probe). This checks outputs only; support your rule with instruction evidence.")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, SyntaxError, ImportError, NameError, ArithmeticError, subprocess.SubprocessError) as error:
        print(f"Check could not complete: {type(error).__name__}: {error}", file=sys.stderr)
        print("If your starter is unfinished, implement step from your saved evidence. See START-HERE.md section 6; preserve the old attempt before revising.", file=sys.stderr)
        sys.exit(2)
