#!/usr/bin/env python3
"""Finite public behavior checks. Read after saving your first decoder attempt."""
import argparse
from pathlib import Path
import random
import runpy
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE if (HERE / "protocol.py").is_file() else HERE.parent / "source"
sys.path.insert(0, str(SOURCE))
from protocol import encode


def load(path):
    factory = runpy.run_path(str(path)).get("Decoder")
    if not callable(factory):
        raise ValueError("Define class Decoder with feed and finish methods.")
    instance = factory()
    if not callable(getattr(instance, "feed", None)) or not callable(getattr(instance, "finish", None)):
        raise ValueError("Decoder needs callable feed and finish methods.")
    return factory


def check_maximum_chunk(factory):
    """The maximum allowed chunk is inclusive; also preserve oversize refusal."""
    texts = ["x"] * 1364 + ["yy"]
    wire = b"".join(encode(text) for text in texts)
    if len(wire) != 4096:
        raise AssertionError("Maximum-chunk control must contain exactly 4096 bytes")
    decoder = factory()
    try:
        actual = decoder.feed(wire)
    except Exception as error:
        raise AssertionError("valid maximum 4096-byte chunk was refused") from error
    if actual != texts:
        raise AssertionError("maximum 4096-byte chunk did not emit every complete frame")
    if decoder.finish() is not None:
        raise AssertionError("maximum 4096-byte chunk did not finish successfully")
    decoder = factory()
    try:
        decoder.feed(wire + b"!")
    except ValueError:
        pass
    except Exception as error:
        raise AssertionError("4097-byte chunk must raise ValueError") from error
    else:
        raise AssertionError("4097-byte chunk was accepted")
    try:
        decoder.finish()
    except ValueError:
        pass
    except Exception as error:
        raise AssertionError("oversize failure must remain ValueError at EOF") from error
    else:
        raise AssertionError("oversize failure did not fail the instance")
    return 4


def check(factory, seed=51):
    rng = random.Random(seed)
    checks = check_maximum_chunk(factory)

    def equal(actual, expected, context):
        nonlocal checks
        checks += 1
        if type(actual) is not type(expected) or actual != expected:
            raise AssertionError(f"{context}: expected {expected!r}; observed {actual!r}.")

    def refused(function, context):
        nonlocal checks
        checks += 1
        try:
            function()
        except ValueError:
            return
        except Exception as error:
            raise AssertionError(f"{context}: raise ValueError, not {type(error).__name__}: {error}") from error
        raise AssertionError(f"{context}: input was accepted; expected ValueError.")

    def valid(function, context):
        try:
            return function()
        except NotImplementedError:
            raise
        except Exception as error:
            raise AssertionError(f"{context}: valid input raised {type(error).__name__}: {error}") from error

    def exercise(texts, sizes):
        frames = [encode(text) for text in texts]
        wire = b"".join(frames)
        ends, total = [], 0
        for frame in frames:
            total += len(frame)
            ends.append(total)
        decoder, offset, emitted = factory(), 0, 0
        equal(valid(lambda: decoder.feed(b""), "empty chunk before data"), [], "empty chunk before data")
        for size in sizes:
            chunk = wire[offset:offset + size]
            offset += len(chunk)
            ready = sum(end <= offset for end in ends)
            equal(valid(lambda: decoder.feed(chunk), f"valid chunk ending at byte {offset}"), texts[emitted:ready],
                  f"chunk ending at byte {offset}, wire {wire.hex()}")
            emitted = ready
        equal(offset, len(wire), "test consumed complete wire")
        equal(valid(decoder.finish, "complete EOF"), None, "complete EOF")
        equal(valid(decoder.finish, "repeated complete EOF"), None, "repeated complete EOF")
        refused(lambda: decoder.feed(b""), "feed after EOF")

    for texts in [[], ["x"], ["~" * 64], ["alpha", "B", "gamma"], [" " * 63, "!" * 2]]:
        length = sum(len(encode(t)) for t in texts)
        exercise(texts, [length])
        exercise(texts, [1] * length)
        for split in range(length + 1):
            exercise(texts, [split, length - split])
    for _ in range(12):
        texts = ["".join(chr(rng.randrange(32, 127)) for _ in range(rng.randint(1, 64)))
                 for _ in range(rng.randint(1, 6))]
        length = sum(len(encode(t)) for t in texts)
        sizes, left = [], length
        while left:
            size = min(left, rng.randint(1, 19))
            sizes.append(size)
            left -= size
        exercise(texts, sizes)
    for raw in [b"\x00\x00", b"\x00\x41", b"\xff\xff", b"\x00\x01\x1f", b"\x00\x01\x7f", b"\x00\x01\xff"]:
        decoder = factory()
        refused(lambda: decoder.feed(raw), f"invalid frame {raw.hex()}")
        refused(lambda: decoder.feed(encode("repair?")), "reuse after failure")
        refused(decoder.finish, "finish after failure")
    # An invalid frame must fail the whole feed call even if that same call
    # completed earlier frames. Events returned by previous calls remain valid.
    invalid_suffixes = [b"\x00\x00", b"\x00\x41", b"\xff\xff",
                        b"\x00\x01\x1f", b"\x00\x01\x7f", b"\x00\x01\xff",
                        b"\x00\x03AB\x00"]
    for texts in [["ok"], ["first", "next"]]:
        frames = [encode(text) for text in texts]
        ends, offset = [], 0
        for frame in frames:
            offset += len(frame)
            ends.append(offset)
        for malformed in invalid_suffixes:
            wire = b"".join(frames) + malformed
            for split in range(len(wire)):
                decoder = factory()
                context = f"valid-prefix + malformed frame {malformed.hex()}, split {split}"
                expected = texts[:sum(end <= split for end in ends)]
                first = valid(lambda: decoder.feed(wire[:split]), context + " before invalid suffix completes")
                equal(first, expected, context + " earlier-call events")
                refused(lambda: decoder.feed(wire[split:]), context + " must raise without a partial return")
                refused(decoder.finish, context + " finish after failure")
                refused(lambda: decoder.feed(b""), context + " empty feed after failure")
                refused(lambda: decoder.feed(encode("later")), context + " valid feed after failure")
                refused(decoder.finish, context + " repeated finish after failure")
                equal(first, expected, context + " preserves earlier-call events")
    for raw in [b"\x00", b"\x00\x01", b"\x00\x02X", encode("ok") + b"\x00"]:
        decoder = factory()
        valid(lambda: decoder.feed(raw), "incomplete frame before EOF")
        refused(decoder.finish, f"incomplete EOF {raw.hex()}")
    for value in [None, "text", bytearray(b"x"), 4, b"x" * 4097]:
        decoder = factory()
        refused(lambda: decoder.feed(value), f"invalid chunk type/size {type(value).__name__}")
        refused(decoder.finish, "finish after invalid input")
    return checks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decoder")
    parser.add_argument("--seed", type=int, default=51)
    args = parser.parse_args()
    try:
        result = check(load(args.decoder), args.seed)
    except NotImplementedError as error:
        parser.exit(2, f"Unfinished decoder: {error}\nSave your attempt, then use START-HERE.md section 4.\n")
    except AssertionError as error:
        parser.exit(1, f"Mismatch: {error}\nReview header buffering, repeated frames and EOF; save feedback before editing.\n")
    except Exception as error:
        parser.exit(2, f"Cannot check decoder: {type(error).__name__}: {error}\nSave the error and review the Decoder interface in START-HERE.md.\n")
    print(f"{result} public checks agree (seed {args.seed}). Finite behavior evidence; no reasoning or independence grade.")
