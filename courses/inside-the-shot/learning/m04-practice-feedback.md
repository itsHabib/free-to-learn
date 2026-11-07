# Practice feedback for Project4

Open after choosing on [m04-practice.md](m04-practice.md). Preserve the original answer and any later correction.

## m04-preserve-predicate

Correct choice: b.

Count(2|elm,elm)=2 and the second elm is already in seen. For every valid input with fewer than 2 names, no name can repeat. The claimed measure is name count, not byte length.

- **a.** The header declares four names but supplies two, so count validation fails before the repeat guard. Regenerate dependent metadata and check the exact failure stage.

- **b.** The declared count 2 matches two names; the second elm triggers the same guard. One name cannot contain a repeat, establishing the two-name lower bound for this predicate.

- **c.** This valid one-name control is accepted by the shown loop. Minimality is constrained by retaining the failure, not just by being small and valid.

[Return to this question](m04-practice.md#m04-preserve-predicate).

## m04-first-contradiction

Correct choice: a.

Iteration indices for 2 names are 0 and 1. At index 1, elm belongs to the one-element seen set, so the shown guard raises. Since the grammar allows repetitions and 2=2 at the earlier count check, this guard is the demonstrated contradiction.

- **a.** Index 1 is the second name, not a declared count. The actual membership value explains the executed rejection; the grammar permits that occurrence, while the earlier count comparison agreed at 2.

- **b.** A zero-based index is a position. It is not the header count. The trace supplies both count values as 2; inspect their producers rather than deriving a count from an index.

- **c.** Suppressing an exception could discard the entire list. The repair must retain all permitted names and preserve other validation rules; successful termination alone cannot establish that.

[Return to this question](m04-practice.md#m04-first-contradiction).

## m04-coordinate-window

Correct choice: c.

Region=[6,6+5)=[6,11). Read=[9,9+3)=[9,12). Intersection=[9,11) has length 2; 3-2=1 read byte is outside the region.

- **a.** The access stays inside the whole buffer but exceeds the smaller region. Name the region whose bound the operation must respect.

- **b.** Offset 9 and length 5 have different origins. Convert both the region and read into file-coordinate intervals before comparing them.

- **c.** The exclusive region end is 6+5=11. The read covers 9, 10 and 11; its overlap has two bytes, leaving 3-2=1 byte beyond the region.

[Return to this question](m04-practice.md#m04-coordinate-window).

## m04-regression-controls

Correct choice: b.

2|elm,elm declares and supplies 2 names, both retained by the contract. 2|elm declares 2 but supplies 1, so 2 != 1 must still cause refusal. The pair tests acceptance with content plus an independent refusal.

- **a.** Two matching runs can share the same bug. Derive an expected value independently from the format and retain the earlier failure as a regression case.

- **b.** The valid case must retain both names, while 2|elm declares two and supplies one. Together they challenge data loss and a weakened count guard; further controls still remain useful.

- **c.** The format requires names to be returned for valid nonempty lists. A blanket empty result conceals the original loss of permitted records instead of addressing it.

[Return to this question](m04-practice.md#m04-regression-controls).
