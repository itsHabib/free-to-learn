# Practice feedback for Project6

Open after choosing on [m06-practice.md](m06-practice.md). Preserve the original answer and any later correction.

## m06-value-correspondence

Correct choice: a.

enabled=0 implies Z=1 and bonus=2. Branch base=3*6=18; adjusted result=18+2=20. Selected form chooses w8=2 and computes madd=6*3+2=20.

- **a.** The branch takes off and adds 2 to base 18. The selected form has Z=1, chooses its first source 2, then madd combines 6*3+2. Different intermediate roles converge on return 20.

- **b.** The branch w8 holds base 18 before adjustment; selected-form w8 holds the chosen bonus 2. Follow definitions and uses rather than equating register labels.

- **c.** Comparing enabled 0 with zero sets Z=1. eq is true, so csel chooses its first source, not its second. Bonus 5 would apply to a nonzero input.

[Return to this question](m06-practice.md#m06-value-correspondence).

## m06-flags-survive-move

Correct choice: b.

cmp(0,0) yields zero and Z=1. mov w9,99 leaves Z=1. eq therefore holds, and csel copies first input w2=9.

- **a.** An ordinary mov changes a register without setting arithmetic flags. Look for cmp, subs or another actual flag producer before changing Z in your trace.

- **b.** cmp computes flags for 0-0, so Z=1. No later instruction replaces them before csel; its true eq arm copies w2=9 into w8.

- **c.** csel selects one of two values using existing flags; it does not compare its sources or produce a boolean. cset is the form that writes 0 or 1.

[Return to this question](m06-practice.md#m06-flags-survive-move).

## m06-conditional-compare

Correct choice: c.

2>3 is false. ccmp uses literal NZCV=0100, hence Z=1. ne=(Z=0) is false and cset result is 0.

- **a.** The nonzero test happens only when the preceding signed-greater condition holds. Here it does not, so flag=-1 is not compared by ccmp.

- **b.** Fallback 4 encodes the four flags, not a register result. cset writes 1 or 0 based on ne; inspect the fallback's Z bit.

- **c.** The first comparison makes gt false. Fallback binary 0100 gives Z=1; ne requires Z=0, so cset writes 0 despite the nonzero second input.

[Return to this question](m06-practice.md#m06-conditional-compare).

## m06-discriminating-probe

Correct choice: a.

n=5: min(4*5,30)=20 and min(4*5+2,30)=22. n=8 gives min(32,30)=min(34,30)=30; n=9 similarly caps 36 and 38 to 30.

- **a.** At 5, raw values 20 and 22 are both below 30, so the displays preserve their difference. This probe can reject at least one candidate if the observation matches only the other.

- **b.** At 9, raw values are 36 and 38, both capped to 30. Agreement there leaves both hypotheses possible; it does not choose A.

- **c.** A repeat may check repeatability, but both candidates already predict 30 at 8. More observations of the same nondiscriminating case do not identify which raw value was computed.

[Return to this question](m06-practice.md#m06-discriminating-probe).
