"""Two public practice cases; run after saving your first model attempt."""

import sys


CASES = (
    ("command response", (0, 0, 1), (2, 2)),
    ("signed movement", (10, -1, 0), (9, -1)),
)
LESSON = "START-HERE.md#6-implement-and-save-the-model"


def main() -> int:
    try:
        from model import step
    except Exception as error:
        print(f"FAIL: could not load step from model.py: {type(error).__name__}: {error}")
        print(f"Define step(p, v, c), then retry. See {LESSON}.")
        return 1

    failed = False
    for name, inputs, expected in CASES:
        try:
            actual = step(*inputs)
        except Exception as error:
            failed = True
            print(f"FAIL {name}: step{inputs} raised {type(error).__name__}: {error}")
            print(f"Expected state {expected}. Complete the one-tick return; see {LESSON}.")
            continue

        valid_pair = (
            isinstance(actual, (tuple, list))
            and len(actual) == 2
            and all(type(value) is int for value in actual)
        )
        if not valid_pair:
            failed = True
            print(f"FAIL {name}: step{inputs} returned {actual!r}; expected integer pair {expected}.")
            print(f"Return (new_position, new_velocity); see {LESSON}.")
            continue

        if tuple(actual) != expected:
            failed = True
            print(f"FAIL {name}: step{inputs} returned {actual}; expected {expected}.")
            print("Compare the first differing value with your native observation and instruction trace.")
            print(f"Save your revision as a new model record. See {LESSON}.")
            continue

        print(f"PASS {name}: step{inputs} returned {actual}.")

    if failed:
        print("These are two public practice cases. Preserve this result before revising.")
        return 1

    print("Both ordinary cases match. Endpoints, repeated ticks and reasoning remain unchecked here.")
    print("Save your evidence, then use check_model.py and the fresh transfer task.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
