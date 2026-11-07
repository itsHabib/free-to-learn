# Text practice for Project3

Read [m03.md](m03.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m03-complete-envelope

Complete the queue validator after count and width have been checked. Header length is 7. Fill both blanks: if declared != ____: reject; if len(raw) != ____: reject.

- **a.** width; declared.

- **b.** count + width; 7 + count.

- **c.** count * width; 7 + declared.

[Feedback after choosing](m03-practice-feedback.md#m03-complete-envelope).

## m03-unknown-evidence

Two valid teaching queues differ only in the header unknown byte and the first entry's unknown byte. Both decoded readings stay the same. What can your inspector and format note justify?

- **a.** Delete both bytes from output because unchanged readings prove they are padding.

- **b.** Retain the new raw hex bytes and report that these probes did not change the readings; their purpose remains unknown.

- **c.** Name both bytes checksums because they can vary independently of the readings.

[Feedback after choosing](m03-practice-feedback.md#m03-unknown-evidence).

## m03-trailing-byte-test

Two queue inspectors agree on a valid one-entry file. A checks len(raw) >= 7 + declared; B checks equality. Both apply the same other guards and preserve unknowns. Which change to that valid file directly distinguishes this size-check difference?

- **a.** Append one byte without changing the header.

- **b.** Change an unknown entry byte from 00 to 90.

- **c.** Remove the last entry byte without changing the header.

[Feedback after choosing](m03-practice-feedback.md#m03-trailing-byte-test).

## m03-new-queue

Apply the declared queue format to 51 54 01 03 03 00 00 ff fe d4. After validating the envelope, which result follows for its entry?

- **a.** reading = 65279; unknown_hex = d4; total length = 10.

- **b.** reading = -257; unknown_hex = ff; total length = 10.

- **c.** reading = -257; unknown_hex = d4; total length = 10.

[Feedback after choosing](m03-practice-feedback.md#m03-new-queue).
