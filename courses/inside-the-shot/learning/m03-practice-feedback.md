# Practice feedback for Project3

Open after choosing on [m03-practice.md](m03-practice.md). Preserve the original answer and any later correction.

## m03-complete-envelope

Correct choice: c.

For count 2 and width 3, expected payload is 2*3=6 and total is 7+6=13. For count 0, expected payload is 0 and total is 7.

- **a.** Width counts bytes in one entry, while declared covers all entries. The actual file also includes the seven-byte header, so it cannot be compared with payload length alone.

- **b.** Adding entry count to entry width mixes two quantities. Multiply to obtain payload bytes, then add the header bytes for total length.

- **c.** Count times bytes per entry gives expected payload bytes. Header bytes plus declared payload bytes gives the exact total, catching both truncation and trailing data.

[Return to this question](m03-practice.md#m03-complete-envelope).

## m03-unknown-evidence

Correct choice: b.

The declared reading slices exclude the unknown positions. Changing excluded bytes leaves those integer calculations unchanged. No declared rule assigns the unknown bytes a semantic role.

- **a.** Unchanged readings only show that these reading calculations did not consume the changed bytes. It does not establish padding, and deletion violates the example's requirement to retain them.

- **b.** The locations and raw values are observable. Preserving them keeps that evidence available, while the unchanged readings support only the narrower statement about these probes.

- **c.** A checksum claim needs evidence relating the bytes to protected content. Independent variation and unchanged readings do not establish that rule; retain the bytes under their unknown names.

[Return to this question](m03-practice.md#m03-unknown-evidence).

## m03-trailing-byte-test

Correct choice: a.

Original length = 7+1*3 = 10. Appended length 11 satisfies 11>=10 but fails 11==10. A removed-byte length 9 fails both comparisons.

- **a.** A valid one-entry queue has 7+3=10 bytes. Appending one makes 11 while the declaration still requires 10. A's minimum-size check accepts it; B's equality check rejects it.

- **b.** The length remains 10 and the declared format permits every unknown-byte value. Both checks still pass, so this tests preservation rather than the size-check difference.

- **c.** The file becomes 9 bytes while 10 are required. Both the minimum-size and exact-size checks reject it. Truncation is useful to test, but it does not separate these two implementations.

[Return to this question](m03-practice.md#m03-trailing-byte-test).

## m03-new-queue

Correct choice: c.

count=1; width=3; declared=3; total=7+3=10. Entry begins at 7. ff fe is 255+254*256=65279 unsigned, then 65279-65536=-257 signed. raw[9:10].hex() is d4.

- **a.** The envelope and unknown byte are right, but 65279 is the unsigned reading of ff fe. The field is signed and its top bit is set, so subtract 65536 to obtain -257.

- **b.** ff is the first byte of the two-byte reading. The entry starts at offset 7, so its unknown byte is at offset 9: d4. Recompute positions before interpreting values.

- **c.** Count 1 and width 3 require payload 3 and total 10, matching the bytes. The signed reading is 255+254*256-65536=-257. The remaining entry byte is retained as d4; the header's unknown byte is 00.

[Return to this question](m03-practice.md#m03-new-queue).
