# Text practice for Project6

Read [m06.md](m06.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m06-value-correspondence

Complete the display example for n=6, enabled=0. It computes 3*n plus bonus 2 for zero enabled, otherwise 5. Which trace agrees in both schematic forms?

- **a.** Branch w8 reaches 20; selected-form w8 is bonus 2 before madd, whose return is 6*3+2=20.

- **b.** Both w8 registers must hold 18 at the selection stage, because equal register names identify equal source values.

- **c.** The selected form returns 23 because csel always chooses its second source after any comparison.

[Feedback after choosing](m06-practice-feedback.md#m06-value-correspondence).

## m06-flags-survive-move

Fresh register trace: initially w1=0, w2=9, w3=14. Execute cmp w1,#0; mov w9,#99; csel w8,w2,w3,eq. What is w8, and why?

- **a.** 14: mov of nonzero 99 must clear the zero flag.

- **b.** 9: cmp sets Z=1, mov leaves flags unchanged, and eq selects the first source w2.

- **c.** 0: csel compares w2 with w3 and returns a boolean equality result.

[Feedback after choosing](m06-practice-feedback.md#m06-flags-survive-move).

## m06-conditional-compare

Apply cmp w0,#3; ccmp w1,#0,#4,gt; cset w8,ne to n=2, flag=-1. Fallback #4 is NZCV=0100. What does w8 become?

- **a.** 1, because flag=-1 is nonzero, regardless of the first comparison.

- **b.** 4, because cset copies the fallback number directly.

- **c.** 0: signed 2 is not greater than 3, so ccmp supplies Z=1 and ne is false.

[Feedback after choosing](m06-practice-feedback.md#m06-conditional-compare).

## m06-discriminating-probe

An indicator returns min(raw,30). Candidate A uses raw=4*n; candidate B uses raw=4*n+2. You observed display 30 at n=8. Which new input best separates these candidates?

- **a.** n=5: candidate A predicts 20, candidate B 22.

- **b.** n=9: candidate A predicts 30, candidate B 30, so equal outputs prove A.

- **c.** n=8 again: repeating the same saturated result identifies the hidden raw value.

[Feedback after choosing](m06-practice-feedback.md#m06-discriminating-probe).
