#!/usr/bin/env python3
"""Public finite behavior checks; importing your trusted source executes it locally.

This is not a sandbox, secure exam or assessment of your explanation.
Native cases exercise real before/after records. Constructed cases additionally
cover full field widths and arbitrary padding beyond the native CLI's range.
The selected target's layout is inferred from controlled native probes, not
stored here. Running the checker provides checker assistance; inspecting this
source counts as solution assistance.
"""
import argparse
import json
from pathlib import Path
import random
import runpy
import subprocess
import sys

TARGETS = {"baseline": "parcel", "shifted": "parcel-shifted"}
# Width, byte order and signedness are supplied decoder-contract facts.
FIELDS = {"kind": (1, False), "units": (2, False), "credit": (4, True)}
CASES = [(0, 0, 0, 0), (255, 65535, -1, 1), (1, 256, -1000000, -10000),
         (128, 32768, 1000000, 10000), (37, 513, -257, 19), (254, 65534, 0, -1)]


class TargetEvidenceError(ValueError):
    """The supplied native target could not provide usable calibration evidence."""


def fields(kind, units, credit):
    return {"kind": kind, "units": units, "credit": credit}


def field_bytes(name, value):
    width, signed = FIELDS[name]
    return value.to_bytes(width, "little", signed=signed)


def packed(layout, expected, padding):
    raw = bytearray([padding] * layout["size"])
    for name, value in expected.items():
        offset = layout["offsets"][name]
        encoded = field_bytes(name, value)
        raw[offset:offset + len(encoded)] = encoded
    return bytes(raw)


def native_output(executable, probe):
    result = subprocess.run([str(executable), *map(str, probe)], check=True, capture_output=True,
                            text=True, timeout=3)
    output = json.loads(result.stdout)
    if not isinstance(output, dict) or set(output) != {"before", "after", "total"}:
        raise ValueError("Native target returned an unexpected JSON object.")
    _, units, credit, delta = probe
    if type(output["total"]) is not int or output["total"] != credit + delta + units:
        raise ValueError("Native total disagrees with the CLI contract.")
    snapshots = {}
    for phase in ["before", "after"]:
        value = output[phase]
        if not isinstance(value, str) or not value or len(value) > 8192:
            raise ValueError("Native snapshots must be bounded, nonempty lowercase hex strings.")
        raw = bytes.fromhex(value)
        if raw.hex() != value or len(raw) < sum(width for width, _ in FIELDS.values()):
            raise ValueError("Native bytes do not match the lowercase hex/field-width contract.")
        snapshots[phase] = raw
    return snapshots


def marker_position(executable, size, name, value):
    selected = fields(0, 0, 0)
    selected[name] = value
    snapshots = native_output(executable, (*selected.values(), 0))
    raw = snapshots["before"]
    if len(raw) != size or snapshots["after"] != raw:
        raise ValueError(f"Cannot infer layout: {name} marker changed length or changed without delta.")
    pattern = field_bytes(name, value)
    matches = [offset for offset in range(len(raw) - len(pattern) + 1)
               if raw[offset:offset + len(pattern)] == pattern]
    if len(matches) != 1:
        raise ValueError(f"Cannot infer layout: {name} marker pattern is missing or ambiguous.")
    offset = matches[0]
    if raw != bytes(offset) + pattern + bytes(len(raw) - offset - len(pattern)):
        raise ValueError(f"Cannot infer layout: {name} marker changed bytes outside its unique field.")
    return offset


def infer_layout(executable):
    """Locate each field using zero plus two isolated nonzero markers per field.

    Require a unique contiguous pattern, stable length, unchanged surrounding
    bytes and no field overlap. A combined update then checks the inferred
    positions together. Refuse unusable evidence before testing learner code.
    """
    zero = native_output(executable, (0, 0, 0, 0))
    if zero["before"] != zero["after"] or any(zero["before"]):
        raise ValueError("Cannot infer layout: the zero probe must produce identical all-zero snapshots.")
    layout = {"size": len(zero["before"]), "offsets": {}}
    markers = {"kind": (0xA7, 0x53), "units": (0x5AC3, 0xC35A),
               "credit": (-0x12345, -0x54321)}
    occupied = set()
    for name, values in markers.items():
        positions = [marker_position(executable, layout["size"], name, value) for value in values]
        if positions[0] != positions[1]:
            raise ValueError(f"Cannot infer layout: {name} marker positions disagree.")
        offset = positions[0]
        used = set(range(offset, offset + FIELDS[name][0]))
        if occupied & used:
            raise ValueError("Cannot infer layout: inferred fields overlap.")
        occupied.update(used)
        layout["offsets"][name] = offset
    probe = (markers["kind"][0], markers["units"][0], markers["credit"][0], 13)
    snapshots = native_output(executable, probe)
    for phase, credit in [("before", probe[2]), ("after", probe[2] + probe[3])]:
        if snapshots[phase] != packed(layout, fields(probe[0], probe[1], credit), 0):
            raise ValueError("Cannot infer layout: combined native probe contradicts the isolated markers.")
    return layout


def native_cases(executable, layout, seed):
    rng = random.Random(seed)
    probes = CASES + [(rng.randrange(256), rng.randrange(65536),
                       rng.randint(-1000000, 1000000), rng.randint(-10000, 10000))
                      for _ in range(16)]
    for kind, units, credit, delta in probes:
        args = [str(kind), str(units), str(credit), str(delta)]
        snapshots = native_output(executable, (kind, units, credit, delta))
        for phase, value in [("before", credit), ("after", credit + delta)]:
            expected = fields(kind, units, value)
            raw = snapshots[phase]
            if raw != packed(layout, expected, 0):
                raise ValueError("Native snapshots contradict the inferred layout or initialization contract.")
            yield f"native {phase} args={' '.join(args)}", raw, expected


def width_cases(layout):
    values = [(0, 0, -2147483648), (255, 65535, 2147483647),
              (128, 32768, -1), (1, 256, 0), (254, 513, -65537), (37, 255, 65536)]
    for kind, units, credit in values:
        expected = fields(kind, units, credit)
        for padding in [0, 0xA5, 0xFF]:
            yield (f"full-width/padding kind={kind} units={units} credit={credit} padding={padding:02x}",
                   packed(layout, expected, padding), expected)


def malformed_cases(layout):
    size = layout["size"]
    lengths = sorted({0, 1, size - 1, size + 1, 2 * size})
    return [None, 7, True, "00" * size, bytearray(size), memoryview(bytes(size)),
            [0] * size, {"raw": bytes(size)}, *[bytes(n) for n in lengths]]


def compare(decode, label, raw, expected):
    try:
        actual = decode(raw)
    except NotImplementedError:
        raise
    except Exception as error:
        print(f"Mismatch at {label}: valid bytes={raw.hex()}, expected={expected!r}; "
              f"decoder raised {type(error).__name__}: {error}")
        return False
    valid = (isinstance(actual, dict) and set(actual) == set(expected)
             and all(type(value) is int for value in actual.values()))
    if valid and actual == expected:
        return True
    print(f"Mismatch at {label}: expected={expected!r}, decoder={actual!r}.")
    return False


def check(decode, executable, target, seed):
    try:
        layout = infer_layout(executable)
    except (OSError, ValueError, TypeError, subprocess.SubprocessError) as error:
        raise TargetEvidenceError(str(error)) from error
    failures = 0
    checked = 0
    for label, raw, expected in native_cases(executable, layout, seed):
        checked += 1
        failures += not compare(decode, label, raw, expected)
        # Mutate padding in real native records without changing any fields.
        used = {index for name, offset in layout["offsets"].items()
                for index in range(offset, offset + FIELDS[name][0])}
        mutated = bytes(byte if index in used else 0xD3 for index, byte in enumerate(raw))
        checked += 1
        failures += not compare(decode, f"{label}, mutated padding", mutated, expected)
    for label, raw, expected in width_cases(layout):
        checked += 1
        failures += not compare(decode, label, raw, expected)
    for raw in malformed_cases(layout):
        checked += 1
        try:
            decode(raw)
        except ValueError:
            continue
        except Exception as error:
            print(f"Malformed input {type(raw).__name__} must raise ValueError; got {type(error).__name__}.")
        else:
            print(f"Malformed input {type(raw).__name__} must raise ValueError; decoder returned normally.")
        failures += 1
    if failures:
        print(f"{failures}/{checked} public checks disagree. Preserve this attempt before revising.")
        print("See START-HERE.md for the decoder contract and the procedure for checking field evidence.")
        return 1
    print(f"{checked} public checks agree for {target} (seed {seed}): native before/after, full widths, padding and malformed inputs.")
    print("These finite checks assess behavior only. Support your layout and calling-convention explanation with evidence.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", help="Your own trusted Python source; importing it executes it locally.")
    parser.add_argument("--target", choices=TARGETS, default="baseline")
    parser.add_argument("--seed", type=int, default=20261017, help="Reproducible public probes, not a hidden exam.")
    args = parser.parse_args()
    namespace = runpy.run_path(str(Path(args.model).resolve()))
    decode = namespace.get("decode")
    if not callable(decode):
        raise ValueError("Define decode(raw).")
    return check(decode, Path(__file__).with_name(TARGETS[args.target]), args.target, args.seed)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except TargetEvidenceError as error:
        print(f"Target evidence check could not complete: {error}", file=sys.stderr)
        print("Keep saved work. Re-extract the original bundle into a new folder and check its target hashes "
              "against manifest.json before editing the decoder.", file=sys.stderr)
        sys.exit(2)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, SyntaxError,
            ImportError, NameError, ArithmeticError, LookupError, subprocess.SubprocessError) as error:
        print(f"Check could not complete: {type(error).__name__}: {error}", file=sys.stderr)
        print("Implement decode(raw) using your saved evidence. See START-HERE.md; preserve the old attempt before revising.", file=sys.stderr)
        sys.exit(2)
