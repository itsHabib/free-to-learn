# Text practice for Project4

Read [m04.md](m04.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m04-preserve-predicate

The gardening format permits repeated names. The faulty parser rejects repeats after validating the count. Starting with 4|oak,elm,elm,ash, which result is minimal by number of names while preserving this failure?

- **a.** 4|elm,elm: it is short, and an exception is sufficient.

- **b.** 2|elm,elm: it is valid, reaches the repeat guard, and a repeat needs at least two names.

- **c.** 1|elm: it is the smallest nonempty valid list, whether or not the rejection remains.

[Feedback after choosing](m04-practice-feedback.md#m04-preserve-predicate).

## m04-first-contradiction

A saved trace for 2|elm,elm shows declared count=2, parsed names=2, index 0 adds elm, then index 1 has name=elm, seen={elm}, membership=true and raises. Repeated names are valid. Which causal explanation fits?

- **a.** The membership guard rejects a permitted second occurrence; the passed count check contradicts a count-mismatch explanation for this case.

- **b.** The header must have declared 1 because the final exception occurred on index 1.

- **c.** Any change that prevents ValueError fixes the parser, regardless of the returned names.

[Feedback after choosing](m04-practice-feedback.md#m04-first-contradiction).

## m04-coordinate-window

Complete the region analysis. An 18-byte buffer contains a region starting at file offset 6 with length 5. A three-byte read starts at file offset 9. How many bytes of this read lie outside that region?

- **a.** 0: the whole buffer has 18 bytes, so the region guard must accept.

- **b.** 3: comparing the starting offset 9 with region length 5 shows the whole read is outside.

- **c.** 1: the region is [6,11), while the read is [9,12); offsets 9 and 10 are inside and 11 is outside.

[Feedback after choosing](m04-practice-feedback.md#m04-coordinate-window).

## m04-regression-controls

A proposed gardening-parser repair makes 2|elm,elm terminate. Which regression pair supplies the most relevant additional evidence?

- **a.** Call the repaired parser twice on 2|elm,elm and use the first output as the expected second output.

- **b.** Require the full list [elm, elm] for 2|elm,elm from the format rule, and require count refusal for 2|elm.

- **c.** Require an empty list for every input so a blanket catch can satisfy the tests.

[Feedback after choosing](m04-practice-feedback.md#m04-regression-controls).
