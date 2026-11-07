# Repair feedback — open after a diagnosis attempt

If the native reader accepts a file while parser-original.py rejects it at the entry-loop guard, the mismatch is inside Python's handling of a validated input. A corrupted header would fail the earlier envelope check; a negative delta is decoded only after the guard and cannot cause that earlier failure. A multi-entry file's later failure index helps distinguish a boundary error from an always-fail entry decoder.

Minimality has a domain: valid, nonempty trail files. A zero-entry file is shorter but does not reproduce this failure. A truncated one-entry file fails its envelope check, so it changes the failure. State the fixed header plus one entry as the size lower bound, and show that your candidate meets it.

For regression.py, one useful pattern is `self.assertEqual(parser.inspect_file('minimal.trail'), expected)`, with expected written independently from your recorded field map. A malformed test can read those bytes with Path, remove one byte, then call inspect inside `with self.assertRaises(ValueError):`. Test the complete return value for valid data; merely asserting “did not throw” would miss a parser returning an empty list.

If the checker reports valid-file rejection, rerun your own trace on that case. If malformed files are accepted, inspect which existing validation rule your change bypassed. If the only differences are unknown_hex, do not delete nonzero opaque data. Keep the original failed attempt and explain what changed in your next record.

## Valid-decode contract

`VALID-DECODE` means the native reader accepts the saved input. Your implementation must return all entries and their complete field values, preserving signed values and uninterpreted bytes. A ValueError on this input is also a mismatch. Compare the saved input with the expected native result in feedback.json. Review the START-HERE section on building/repairing your implementation and preserving valid cases; do not fix this by ignoring entries or returning an empty list.

## Malformed-input contract

`MALFORMED-REJECTION` means the native reader rejects the saved input. Your implementation must raise ValueError rather than returning plausible partial values. Check magic, supported count/entry width, count × width versus declared payload, and exact total size before reading entries. Keep the bounded-file read as well. Review START-HERE's envelope or malformed-input procedure; do not weaken a size check to accommodate trailing data.

The checker retains **every** failing input plus a snapshot of the submitted source and native target manifest in a new check-feedback-* folder (or your new --evidence-dir). It prints a replay command and reports expected native results in feedback.json. Those files are checker assistance. Attach feedback.json and the relevant .trail file to a new notebook record, with assistance_details explaining what the feedback revealed, before changing your implementation. Copy the feedback folder with your exported workspace. Its replay requests use the saved bytes or filenames inside that folder. Run the printed command from that folder. If you move the feedback folder, update its cd path; if you also move the original bundle, update the command's worker.py path to that bundle. Previous folders and records remain unchanged.
