# Marker feedback — open after saving

The marker returns `(2, 4)`. With `flip = 0`, the condition is false, so velocity stays `4`; adding it to `-2` gives position `2`. If you negated velocity, check which input makes the condition true. If you left position at `-2`, notice that the addition is outside the `if` and runs in either case.

For a repair, compute the marker's result for `p = 3`, `v = -2`, `flip = 0`, and explain whether the addition runs. Then check your reasoning by executing the small marker function above. Keep the original answer in the saved record and save the repair as another prediction record.
