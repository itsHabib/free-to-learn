# Optional changed-layout hints

Read this only when working on `parcel-shifted`. First save your transfer prediction and preserve `decoder.py`. Record the highest level read as `--assistance transfer-hint-1`, `transfer-hint-2` or `transfer-hint-3`. Name `transfer-hints.md` and that level in `assistance_details`; the recorder requires details for hint-assisted saves. If both hint files informed this attempt, name both files and levels. Separate files keep baseline hints from giving the changed offsets in advance; they do not enforce a secure exam.

## Hint 1 — hold values fixed

Run a shifted case with the same arguments as one saved baseline case. Equal field values and total do not imply equal byte positions. Compare record length, then compare the location of each distinctive byte pattern. Write what you can keep and what needs new evidence.

## Hint 2 — revisit untouched fields

The update can leave fields unchanged even when their locations move. Repeat an ordinary one-input pair to locate those fields, then a boundary pair to check width and byte order. Compare the two `score_parcel` listings: find a load whose displacement changes and one whose displacement stays the same. Do not treat an unchanged credit update as evidence that the entire old decoder still works.

## Hint 3 — separate the contract from the layout

Keep the same three keys, types, byte order and error behavior. Re-derive the offsets and required length from the shifted target. Draw eight numbered byte slots and place each field once, using the probes and access widths as evidence. Leave the remaining slot unassigned and accept any value in it. Keep the new decoder in `decoder_shifted.py`, then save and check it independently.
