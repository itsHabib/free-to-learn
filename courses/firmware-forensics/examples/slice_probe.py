"""Unit 01 slice experiment: inert bytes, intentionally missing bounds checks.

Run from the course root. Copy this file into an attempt before repairing it.
This is a range probe, not an EDUFW1 parser or a trust decision.
"""
import argparse
import importlib.util
from pathlib import Path


# BEGIN TAUGHT SLICE
def read_payload(data, table_end, offset, size):
    """Precondition: bytes data; integer fields; 0 <= table_end <= len(data).

    Return exactly size bytes after the table, or raise ValueError for a bad
    range. A payload must be nonempty. This starter deliberately breaks that
    contract: add validation BEFORE slicing in your own copy.
    """
    return data[offset:offset + size]
# END TAUGHT SLICE


# A miniature buffer, not a valid container: first eight bytes stand for a table.
DATA = b"TABLE___abcdef"
CASES = (
    ("exact-end", 8, 6, b"abcdef"),
    ("inside-payload", 9, 2, b"bc"),
    ("past-end", 8, 7, None),
    ("offset-past-end", 15, 1, None),
    ("inside-table", 7, 2, None),
    ("empty-payload", 8, 0, None),
    ("negative-offset", -2, 1, None),
    ("negative-size", 8, -1, None),
)


def check(read):
    failures = 0
    for name, offset, size, expected in CASES:
        try:
            actual = read(DATA, 8, offset, size)
        except ValueError:
            passed = expected is None
            observed = "ValueError"
        except Exception as error:
            passed = False
            observed = type(error).__name__
        else:
            passed = expected is not None and actual == expected
            observed = repr(actual)
        wanted = "ValueError" if expected is None else repr(expected)
        print(f"{'PASS' if passed else 'FAIL'} {name}: expected {wanted}; got {observed}")
        failures += not passed
    print(f"{len(CASES) - failures}/{len(CASES)} range cases passed")
    return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="your local copy of this probe")
    args = parser.parse_args()
    read = read_payload
    if args.source:
        spec = importlib.util.spec_from_file_location("learner_slice", args.source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        read = module.read_payload
    return check(read)


if __name__ == "__main__":
    raise SystemExit(main())
