# Input-order reasoning

Assistance used:

## Predictions before editing

For these predictions, use an unobstructed east/west path. There is no pending interaction initially, all named admissions have interact=false, and there are no other inputs except those stated. These are application practice after the worked trace, not an unseen transfer measure.

1. At T1 seq7/W is admitted from x=2000. At T3 seq6/E/interact=true arrives. Predict x, pending interaction and expiry just after T4, and explain.

2. At T2 seq3/E is admitted from x=1000. Only state reads happen after that. Predict the last moving tick and position at T8.

3. At T6 a fresh W input renews a west direction admitted at T2. Predict what happens at T7.

4. A response was lost; the same sequence is retried. Which state must remain unchanged, and should a finding be produced?

## After the tests

- First failed criterion and observed/expected evidence:
- What I changed and why:
- Which wrong implementation my scenario detected, and the state assertion that detected it:
- Which correct implementation challenged an over-specific assumption:
- What these tests do not establish:

## Transfer for review (not automatically graded)

An owned replay scrubber receives seek commands {seq, frame} instead of movement. The latest admitted command selects a frame; reading the displayed frame must not change the selected frame or the last admitted sequence. Explain which admission/observation rules transfer, which four-tick movement rule does not automatically transfer, and propose one stale-command test plus one read-only polling test. Do not invent an expiry requirement for the scrubber. Preserve your first answer and append repairs here.
