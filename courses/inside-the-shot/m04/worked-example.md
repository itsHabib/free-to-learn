# Before the parser: ends, counts and useful reductions

Goal: distinguish the number of bytes in a region from its position in a file, then reduce a failure without replacing it with a different failure. This example uses a plain byte window and a string predicate, not trail.

`b'abcXY'` has five bytes. The region `XY` starts at offset 3 and contains 2 bytes. Its exclusive end is offset 5: `start + count`. The slice is `raw[3:5]`. Using `raw[3:2]` does not mean “take two bytes”; it yields an empty result. Every number can be correct in one coordinate system and wrong in another.

| Quantity | Value | Measured from |
| --- | --- | --- |
| start | 3 | Beginning of file |
| count | 2 | Beginning of region |
| exclusive end | 5 | Beginning of file |

Read `take_window` in window.py. It refuses a negative start/count and a region extending past the available bytes. The guard is checked **before** slicing. Run the worked example:

```sh
python3 window.py
```

The first line is `b'XY'`. The remaining lines belong to the reduction example below. Now predict the result and validity of three different windows before running the following practice. Save a prediction with the notebook command from START-HERE.

```python
from window import take_window
for raw,start,count in [(b'.....cat',5,3),(b'.....cat',5,4),(b'ab',2,0)]:
    try:
        print(take_window(raw,start,count))
    except ValueError as error:
        print(type(error).__name__,str(error))
```

Put this in window_practice.py and run it after saving. Open practice-feedback.md afterward. The empty region at the file's exclusive end matters; a guard that changes `>` to `>=` can reject it incorrectly.

## Reduce the same failure

A reproducer is an input and command that makes the observed failure happen again. A minimal reproducer removes irrelevant material while retaining that failure. Minimal always needs a stated rule: shortest text, fewest records, or smallest valid file. It is not enough that “something still goes wrong.”

Suppose the failure predicate is “adjacent A followed by Z.” In window.py, `contains_pair` tests exactly this. `pAZq` reproduces it. Remove `p`: `AZq` still reproduces. Remove `q`: `AZ` still reproduces. Remove either remaining character: `A` and `Z` each fail to reproduce. The remaining two-character input is minimal for this predicate because fewer than two characters cannot contain an adjacent pair. The window.py run records True, True, True, False, False. A different exception or different predicate would not establish the same reduction.

For binary files, deleting bytes can break a count or length before the parser reaches the original failure. Prefer an owned writer that regenerates consistent headers as entries are removed. Keep the original bytes and every candidate with its actual result. A structurally minimal *valid* file is often larger than an invalid fragment that crashes somewhere else.

Practice: save a prediction about reducing `ZAQAZB`. Which adjacent pair must survive, and why is `ZA` the wrong two-character result? Run `contains_pair` yourself and save the result. The answer is in practice-feedback.md.
