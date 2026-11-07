# Baseline hints — open one level at a time

First preserve your hypotheses and current code. Record the highest level read as `hint-1`, `hint-2` or `hint-3`; give the filename and what it revealed in `assistance_details`. These hints guide evidence selection without providing the completed transition table.

## Hint 1 — separate three failures

A helper may refuse to overwrite a filename. A target may refuse an entire malformed file. A valid target run may report an unaccepted event. Which happened in your case? Keep the whole output and process exit status. Compare byte lengths with an empty and nonempty supplied specimen before treating a refusal as a business rule.

## Hint 2 — choose a probe with two possible outcomes

Repeat the same entry before and after an entry that uses the same slot. If your model only tracks a grand total, it cannot explain why two slots with different histories behave differently. Keep the amount fixed while changing only the slot. For a boundary, compare a request equal to current free quantity with one above it, while keeping the input syntactically valid.

## Hint 3 — trace guards before stores

Within apply_record, follow a path to its returned zero and check whether it passed any stores through the state pointer. Distinguish stack stores from state stores. Then trace a later entry: does replay stop after that zero? To understand a quantity ceiling, identify every term included in a comparison rather than assuming it tests only the displayed free count.
