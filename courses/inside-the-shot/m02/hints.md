# Optional baseline hints

These hints concern `parcel` and `decoder.py`. They do not describe the changed layout. Save your current prediction or implementation before reading more, then record the highest level used as `--assistance hint-1`, `hint-2` or `hint-3`. In `assistance_details`, name `hints.md` and that level; the recorder refuses a hint-assisted save without details. A hint-assisted revision remains useful work; it is not an unaided first attempt.

## Hint 1 — change one cause

Start with two calls differing only in kind. Put spaces between hex pairs and number bytes from zero. Compare `before` with `before` across the calls, rather than comparing only one call's `before` and `after`. Repeat for units and credit. A field that does not change during processing still belongs in the decoder.

If you are stuck on values, return to the `2c 01` example in [worked-example.md](worked-example.md). Work from bytes toward values before writing slices.

## Hint 2 — use a boundary and the pointer path

A 255/256 pair carries into a second byte, so it helps reject an undersized field guess. A −1/0 pair exposes the signed pattern. Then use the access widths in `parcel.asm` to test your proposed sizes. A load through a register containing the record pointer refers to the record; a load through `sp` refers to stack storage. Trace the pointer rather than copying the first displacement you see.

Compare `process_parcel` immediately before each `bl`: what puts the original pointer back in `x0`? In the callee, follow that pointer until a load or store uses it. Then follow `initialize_parcel`'s incoming values to its one-, two- and four-byte stores. Record each link in your own words.

## Hint 3 — assemble the decoder from evidence

Make a table of three fields with offset, width, signedness and supporting observation or instruction. There should be one one-byte unsigned field, one two-byte unsigned field and one four-byte signed field. Mark bytes not covered by these fields as padding; ignore their contents.

Use a guard for `bytes` and exact record length before any slice. A slice ends just after the field: `raw[start:start + width]`. Use `int.from_bytes` with explicit little-endian order and the field's signedness. An unchanged unsigned decode of negative credit often produces a huge positive integer; changing offsets cannot repair a signedness error. Test the repaired assumption with a new saved attempt, not by overwriting the old one.
