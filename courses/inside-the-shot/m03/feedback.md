# Investigation feedback — use after your own attempt

## Tick boundary

Between 255 and 256 the low byte changes from ff to 00 while the adjacent high byte changes from 00 to 01. If your “one-byte tick” predicts wrap to zero, the second change contradicts it. Find those two bytes in your output; no offset answer is needed to use this rule. A 513 marker separates byte order because its bytes are unequal.

## Lengths

The invariant prefix is not all one number. A count increases by one per added entry; a byte length increases by a whole entry. Test the proposed header length by subtracting the payload from the total in more than one file. Empty input alone cannot distinguish a zero count from a zero payload size. In an inspector, validate the declarations before a loop. Python slicing accepts an early end, so a loop that decodes slices without a global exact-length check can return invented zeros.

## Checker failures

A negative delta mismatch suggests signedness; a 255/256 mismatch suggests width or byte order. An opaque-byte mutation that rejects an otherwise valid file suggests an unjustified zero requirement. A truncated or changed-header input that returns plausible entries suggests trusting an unvalidated declaration. A trailing-byte input that succeeds suggests you used “at least long enough” where the format requires exact length. Verify the inference with a fresh native probe, save the feedback and your next hypothesis, then patch one rule.

## Transfer

Nonzero unexplained bytes need preservation, not guessed meaning. Correct output records their hex string. If you intentionally ignore their semantics, say so; “unknown” is a justified result. A passing checker supports tested behavior, while the format-note evidence supports the interpretation. These are separate claims.

## Valid-decode contract

`VALID-DECODE` means the native reader accepts the saved input. Your implementation must return all entries and their complete field values, preserving signed values and uninterpreted bytes. A ValueError on this input is also a mismatch. Compare the saved input with the expected native result in feedback.json. Review the START-HERE section on building/repairing your implementation and preserving valid cases; do not fix this by ignoring entries or returning an empty list.

## Malformed-input contract

`MALFORMED-REJECTION` means the native reader rejects the saved input. Your implementation must raise ValueError rather than returning plausible partial values. Check magic, supported count/entry width, count × width versus declared payload, and exact total size before reading entries. Keep the bounded-file read as well. Review START-HERE's envelope or malformed-input procedure; do not weaken a size check to accommodate trailing data.

The checker retains **every** failing input plus a snapshot of the submitted source and native target manifest in a new check-feedback-* folder (or your new --evidence-dir). It prints a replay command and reports expected native results in feedback.json. Those files are checker assistance. Attach feedback.json and the relevant .trail file to a new notebook record, with assistance_details explaining what the feedback revealed, before changing your implementation. Copy the feedback folder with your exported workspace. Its replay requests use the saved bytes or filenames inside that folder. Run the printed command from that folder. If you move the feedback folder, update its cd path; if you also move the original bundle, update the command's worker.py path to that bundle. Previous folders and records remain unchanged.
