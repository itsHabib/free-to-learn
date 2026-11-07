# Practice feedback for Project1

Open after choosing on [m01-practice.md](m01-practice.md). Preserve the original answer and any later correction.

## m01-receipt-trace

Correct choice: b.

w8 = 10; w9 = 10 + 4 = 14; memory[P] = w9 = 14; w0 = w8 = 10.

- **a.** The addition puts 14 in w9, then str copies w9 to memory at P. The final mov reads w8, which still contains 10. Follow the destination on each line instead of swapping memory and return.

- **b.** The load retains old count 10 in w8. Addition produces 14 in w9; the store makes memory 14. Nothing replaces w8, so mov w0,w8 returns 10.

- **c.** The store changed memory, not w8. The add destination is w9, so the final mov reads the old 10. Returning 14 would require a different source for that mov.

[Return to this question](m01-practice.md#m01-receipt-trace).

## m01-register-width

Correct choice: c.

An ARM64 W-register write zero-extends its 32-bit result into the matching X register: x8 = zero_extend_64(2) = 2.

- **a.** A write to w8 does more than replace the low bits: ARM64 also zeros x8's upper 32 bits. Revisit the shared x8/w8 storage rule before carrying an old pointer forward.

- **b.** w8 names the low 32 bits of x8. They are not independent storage locations, so a write to w8 changes x8.

- **c.** Writing w8 puts 2 in the low 32 bits and zero in the upper 32 bits of x8. The entire x8 is therefore 2; the previous 64-bit value is gone.

[Return to this question](m01-practice.md#m01-register-width).

## m01-repeat-state

Correct choice: a.

receive(2,5) = (7,2); receive(7,5) = (12,7). Receipts are [2,7] and retained state is 12.

- **a.** The first call returns (7, 2). Feeding its new state 7 to the second returns (12, 7). The receipts report each call's input state.

- **b.** This repeats a call starting at 2 instead of carrying state 7 into the second call. Write the next input beside the first returned pair before updating again.

- **c.** The final count is right, but these receipts report the updated states. The function's second component is the old count, so read the pair's roles separately.

[Return to this question](m01-practice.md#m01-repeat-state).

## m01-distinguishing-probe

Correct choice: b.

For start 9 and delivery 2: both stored states are 11, while A returns 9 and B returns 11. For delivery 0 both returns are 9.

- **a.** With delivery zero, old and new are both 9. The receipt agrees under both explanations, so this run cannot choose between them.

- **b.** The old-count explanation predicts receipt 9 and the new-count explanation predicts 11. Observing the receipt can reject one explanation for this case.

- **c.** Both explanations store 9 + 2 = 11. They differ in the return's source, so the final stored count is the wrong observation to separate them.

[Return to this question](m01-practice.md#m01-distinguishing-probe).
