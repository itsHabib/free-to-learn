# A small comparison: optional handling fee

Goal: follow one value through an unoptimized branch and an optimized selection. Your saved P0 calculation uses the taught fee rule for `amount=5, urgent=1`. Run the smaller program only now:

```sh
./fee-O0 5 1
./fee-O2 5 1
```

Both print `{"result":12}`. Put this next to your prediction and save a new `prediction` record. Recall the rule taught in P0: start with amount+4; if urgent is nonzero, add 3. It does not describe `quote`. For 5 and 1, base fee is 9, the optional addition is 3 and the result is 12.

Open `fee-O0.asm` and `fee-O2.asm`. These are actual compiled listings. The wrapper passes amount in `w0`, urgent in `w1`. The focused listing excludes input parsing/printing. At O0 the function reserves 16 bytes on the stack; `[sp,#0x4]` stores the running fee. At O2 the function needs no stack slot for that value. The compiler combines the two additions into a choice of 4 or 7.

Follow the same four roles in each listing:

1. **Prepare the fee.** O0's `0x10000054c add w8,w8,#4` makes 9, and `0x100000550 str` saves it. O2's `0x1000004ac mov w8,#7` and `0x1000004b0 mov w9,#4` prepare alternative additions, not complete fees.
2. **Test urgent.** O0's `0x100000558 cbz w8,...` skips the extra addition only if urgent is zero. O2's `0x1000004b4 cmp w1,#0` records equality in the flags.
3. **Apply the optional effect.** O0's `0x100000564 add w8,w8,#3` makes 12. O2's `0x1000004b8 csel w8,w9,w8,eq` chooses 7 when unequal.
4. **Return.** O0's `0x100000570 ldr w0,[sp,#4]` reloads 12. O2's `0x1000004bc add w0,w8,w0` computes 7+5=12.

`csel` means conditional select: when its condition is true choose the first input, otherwise the second. At `0x1000004b8`, equality means urgent is zero, so it chooses `w9=4`; otherwise it chooses `w8=7`. It changes a value without changing the next instruction address. Fewer branches do not imply fewer conditional behaviors.

At O0 `w8` means amount (5) after `0x100000548`, base fee (9) after `0x10000054c`, and urgent (1) after `0x100000554`. Each write replaces the previous value. At O2, `w8` at `0x1000004ac` is an increment (7), not a fee. Matching “w8 to w8” would connect unlike values. Match definitions, uses and conditions instead.

## Completion: choose the increment

For `(5,0)`, fill in these three blanks in `response.json` before running: which increment does O2 select, which O0 instruction is skipped, and what result leaves `w0`? Record stage `prediction`, then run both fee programs with `5 0`. Open only [completion-feedback.md](completion-feedback.md) after saving your answer. Record the observed result and correction as `example-feedback` with details.

## Practice: sign is not truth

For `(-6,-2)`, predict both outputs, the selected increment, and the path at O0's `cbz`. Explain whether negative urgent means “no fee.” Save first, then run both programs with `-6 -2`. Open [practice-feedback.md](practice-feedback.md) afterward. Save its help with `example-feedback`. This is a practice check, not a held-out assessment.

## Carry the method into P2

For each function: start with entry values, follow writes, record condition outcomes, and track the value that reaches the return. When a compiler combines operations, match the combined expression's role instead of requiring one instruction for each source line. Return to P2 in START-HERE. The main function's interacting conditions require more evidence than these two fee examples.
