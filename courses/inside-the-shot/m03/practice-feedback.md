# Badge practice feedback — open after saving your prediction

The outputs are `[0, -128, 127]`, `ValueError badge length`, and `ValueError badge length`. In the second case, count 2 promises two readings but only one is present. In the third, all five readings exist but the count exceeds the supported maximum. Completeness and policy are separate checks.

If you decoded 128, the reading's declared signed interpretation was lost. If you accepted the short case, Python's short slices hid missing data. If you accepted five readings, you checked file length but forgot the bounded format. Continue to [the fresh badge retry](retry.md). That page gives only the new inputs and prediction procedure; its answers are on a separate feedback page. Save your comparison and any help used.
