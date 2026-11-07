# Text practice for Project1

Read [m01.md](m01.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m01-receipt-trace

Complete the receipt-counter trace with memory at P initially 10 and w1 = 4. The instructions are ldr w8,[x0]; add w9,w8,w1; str w9,[x0]; mov w0,w8; ret, with x0 initially P. What are the final count in memory and the returned receipt?

- **a.** Count 10; receipt 14.

- **b.** Count 14; receipt 10.

- **c.** Count 14; receipt 14.

[Feedback after choosing](m01-practice-feedback.md#m01-receipt-trace).

## m01-register-width

A separate instruction sequence starts with x8 = 0x0000000100000007, then executes mov w8,#2. What does x8 hold afterward?

- **a.** 0x0000000100000002: the old upper half is preserved.

- **b.** 0x0000000100000007: w8 is a separate register.

- **c.** 0x0000000000000002: the write also clears the upper half.

[Feedback after choosing](m01-practice-feedback.md#m01-register-width).

## m01-repeat-state

Apply receive(count, delivered), which returns (count + delivered, count), twice. Start with count 2 and use delivery 5 on both calls, carrying the new state forward. Which sequence is produced?

- **a.** Receipts 2 then 7; final count 12.

- **b.** Receipts 2 then 2; final count 7.

- **c.** Receipts 7 then 12; final count 12.

[Feedback after choosing](m01-practice-feedback.md#m01-repeat-state).

## m01-distinguishing-probe

Two candidate counter functions both add the delivery to the stored count. A returns the old count; B returns the new count. Which single observation distinguishes them?

- **a.** Start at 9, deliver 0, and inspect the receipt.

- **b.** Start at 9, deliver 2, and inspect the receipt.

- **c.** Start at 9, deliver 2, and inspect only the final stored count.

[Feedback after choosing](m01-practice-feedback.md#m01-distinguishing-probe).
