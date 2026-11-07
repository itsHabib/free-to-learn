# Completion feedback — (5,0)

The increment is 4 and the output is 9. At O0 `cbz` at `0x100000558` jumps to `0x100000570`; the `add #3` at `0x100000564` is skipped. At O2 `cmp w1,#0` makes equality true, so `csel` at `0x1000004b8` chooses `w9=4`. Then 5+4 returns 9. The rule is selection by the condition, not presence or absence of a branch instruction.

If you chose 7, check the operand order: first source when `eq` is true, second source otherwise. Save your original answer beside this correction and record this page as assistance. Return to the separate practice in worked-example.md; this page gives no practice answer.
