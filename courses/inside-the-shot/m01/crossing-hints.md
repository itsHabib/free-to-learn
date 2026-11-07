# Optional hints: the third target

Read one level at a time after saving your current prediction. Record the highest level seen as `hint-1`, `hint-2` or `hint-3`; retain the earlier attempt. These hints help select evidence. The worked implementation is separate.

## Hint 1 — challenge a symmetry

In the baseline model, shifting the input position shifts the output position by the same amount. Velocity does not change just because you chose another starting location. Test that prediction with positions on different parts of the line while keeping velocity, command and one tick fixed.

Before running, calculate both baseline outputs. If the new target disagrees, write exactly which field breaks the assumption. If it agrees, that pair has not established the assumption for other positions.

## Hint 2 — keep old and proposed values apart

Take a case your current model misses. Write the old position, the velocity your ordinary update would compute, and the position that velocity would propose. Compare this with a nearby case that follows ordinary movement. Ask whether their locations at the beginning and end of the proposed move matter.

Choose cases that approach a boundary from different directions. Include an exact endpoint, not only values well beyond it. Predict the result under each candidate rule before running. Follow the comparisons in `lab_step` using those same values.

## Hint 3 — trace all tests and both returned fields

Build a small table: old position, proposed position, comparison outcomes, selected position, selected velocity. Compare a negative starting position that stays negative, one whose proposed move reaches zero, and a start exactly at zero. Include movement in the opposite direction too. This separates several superficially plausible conditions; it does not license treating every arrival at one coordinate alike.

Trace all tests that select the surprising path. Then inspect **both** final writes. A changed position does not tell you whether velocity was retained or replaced. For a multi-tick forecast, use the returned pair as the next input and reassess the conditions; do not assume a selected path becomes permanent.

If you still cannot connect the output and listing, save the uncertainty and request the separately marked worked walkthrough. Work after opening it is solution-assisted practice.
