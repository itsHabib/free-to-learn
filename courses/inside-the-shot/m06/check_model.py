#!/usr/bin/env python3
"""Compare a learner model with both delivered native builds, without a rule oracle."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess
import sys


class TargetError(ValueError):
    pass


def native(program, args):
    try:
        result = subprocess.run([str(program), *map(str, args)], capture_output=True,
                                text=True, timeout=5)
        value = json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise TargetError(f"Cannot run {program.name}: {error}. Re-extract the matching archive; see setup.md.") from error
    if result.returncode or result.stderr or set(value) != {"result"} or type(value["result"]) is not int:
        raise TargetError(f"Invalid native response from {program.name}; restore the matching package.")
    return value["result"]


def verify_targets(root):
    try:
        manifest = json.loads((root / "manifest.json").read_text())
        for key in ["O0", "O2"]:
            variant = manifest["variants"][key]
            for kind in ["binary", "assembly"]:
                path = root / variant[kind]
                if path.parent != root or path.is_symlink() or not path.is_file():
                    raise ValueError("target is not a flat regular file")
                if hashlib.sha256(path.read_bytes()).hexdigest() != variant[kind + "_sha256"]:
                    raise ValueError(f"hash mismatch: {path.name}")
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise TargetError(f"Target identity check failed: {error}. Re-extract the matching archive; see setup.md.") from error
    return [root / manifest["variants"][key]["binary"] for key in ["O0", "O2"]]


def cases(seed):
    # Public input probes, not an output table or implementation of the target.
    edges = [-100, -1, 0, 1, 7, 8, 9, 23, 24, 25, 31, 32, 33, 39, 40, 41, 100]
    probes = [(value, c, r) for value in edges for c, r in [(0, 0), (1, 0), (-1, 1), (1, -1)]]
    probes += [(8, c, r) for c in [-100, -1, 0, 1, 100] for r in [-100, -1, 0, 1, 100]]
    rng = random.Random(seed)
    probes += [tuple(rng.randint(-100, 100) for _ in range(3)) for _ in range(80)]
    return list(dict.fromkeys(probes))


def check(path, root, seed):
    targets = verify_targets(root)
    spec = importlib.util.spec_from_file_location("learner_model", path)
    if spec is None or spec.loader is None:
        raise ValueError("Expected a Python model file; see START-HERE.md.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = getattr(module, "model", None)
    if not callable(model):
        raise ValueError("Define model(units, coupon, rush); see START-HERE.md.")
    failures = []
    probes = cases(seed)
    for args in probes:
        values = [native(target, args) for target in targets]
        if values[0] != values[1]:
            raise TargetError(f"Native builds disagree at {args}; stop and retain this evidence.")
        try:
            actual = model(*args)
            if type(actual) is not int or actual != values[0]:
                failures.append(f"Mismatch at {args}: both builds={values[0]}, model={actual!r}.")
        except NotImplementedError:
            raise ValueError("Starter is unfinished. Save it first, then follow P2 in START-HERE.md.") from None
        except Exception as error:
            failures.append(f"Mismatch at {args}: both builds={values[0]}, model raised {type(error).__name__}: {error}.")
    invalid = [(True, 0, 0), (0, False, 0), (0, 0, True), (1.0, 0, 0),
               (0, "1", 0), (None, 0, 0), (-101, 0, 0), (101, 0, 0),
               (0, -101, 0), (0, 101, 0), (0, 0, -101), (0, 0, 101)]
    for args in invalid:
        try:
            model(*args)
        except ValueError:
            continue
        except Exception as error:
            failures.append(f"Invalid input {args}: expected ValueError, got {type(error).__name__}.")
            continue
        failures.append(f"Invalid input {args}: expected ValueError, model accepted it.")
    for failure in failures[:5]:
        print(failure)
    print(f"{len(probes)} native comparisons across both builds; {len(invalid)} invalid-input controls; {len(failures)} disagreements (seed {seed}).")
    print("Feedback reveals behavior: record it as checker assistance. Passing does not assess your map or explanation.")
    return not failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--seed", type=int, default=61)
    parser.add_argument("--targets", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    try:
        passed = check(args.model, args.targets.resolve(), args.seed)
    except (OSError, ValueError, ImportError, SyntaxError, TypeError) as error:
        parser.exit(2, f"Check could not complete: {error}\n")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
