# Optional hints — record the level and what it revealed

1. **hint-1:** Compare a zero-entry and one-entry file at the first loop guard. Which quantities are measured from the file's beginning, and which are counts within the payload?
2. **hint-2:** On a valid one-entry file, the cursor begins after the header. The proposed next offset includes that starting position. Does end use the same origin? Explain the multi-entry failure index using the same mismatch.
3. **hint-3, sibling step:** A different buffer has a region starting at offset 5 with length 3. Its exclusive end is 8, and a proposed next offset of 8 is still inside the allowed boundary. Mark the start, length and exclusive end in your trace, then decide which expression compares values measured from the same origin. Keep the independent envelope checks. Open only after saving your diagnosis.
