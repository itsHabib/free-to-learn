# Optional main-task hints

Read only the next level you need. Save your code and explanation first. Record the level plus this filename and what it revealed in `assistance_details`.

## Hint 1 — follow a value

Mark every write to `w8` in each listing. At O0 loads bring different stack values into it. At O2 its early value and late value do not have the same role. Trace `8 1 -1` without assuming a register names a permanent variable. Use entry facts and the instruction reference.

## Hint 2 — combined conditions

At O2, connect `cmp w1` to `ccmp w0` and then to `csel w10`. If the first comparison is not greater, NZCV=0100 makes the final signed-greater test false. If it is greater, the second comparison decides. Try one positive and one nonpositive coupon at the same units. The threshold compares original units, although the multiplier uses a bounded value; determine why those conditions agree in this domain.

## Hint 3 — structure before constants

Treat the calculation as a bounded unit value, a linear expression with one of two intercepts, an optional doubled-unit addition, and a final upper limit. Read constants from the listings and validate transitions with paired probes. Do not infer the input bound from final saturated outputs alone. The absence of branch instructions in O2 is your opportunity for a concrete counterexample, not evidence that it is unconditional.
