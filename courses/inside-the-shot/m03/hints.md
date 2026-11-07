# Optional hints — record each level used

Try your own probe first. Opening a level changes the next record's assistance to that level (and name this file in assistance_details). Further help is available without a navigation lock.

1. **hint-1, strategy:** Compare files differing in one input and compare empty/one/two entries separately. Write offsets above the hex bytes. Distinguish supplied input domains from inferences about the layout.
2. **hint-2, representation:** Two unequal marker bytes decide little-endian order; negative delta −1 fills its field with ff. Search for a fixed ASCII prefix, a count that moves by one, a width that stays fixed and a payload length that moves by an entry.
3. **hint-3, sibling step:** In a different format, a 5-byte header declares three 2-byte readings. The payload is 6 bytes and the complete file is 11 bytes. Compute the same three quantities separately for your empty, one-entry and two-entry trail probes, then test whether one relation fits all of them. Keep unexplained bytes in your output. Open only after saving your attempt.
