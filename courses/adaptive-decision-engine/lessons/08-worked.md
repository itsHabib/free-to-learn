# 08 · Worked notebook

Separate the altered cause from the observation method. The JSON schema below describes a testable intervention without asserting that its conclusion is correct.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "requiredFields": [
    "id",
    "hypothesis",
    "health",
    "budget",
    "damageA",
    "damageB"
  ],
  "identityRule": "unique ID and distinct normalized conditions",
  "control": "display-only changes leave the decision unchanged"
}
```

## Complete one intervention

Freeze health, budget and the previous encounter. Change only the three damage values. Record the observation and policy result before and after. If both observations change but actions do not, the evidence points at policy use rather than missing information.

## Independent change

Choose a different health or budget boundary for your second case. Reversing the first pair or copying its ID is the same experiment and is rejected. Include the original failure and one alternative explanation in REPORT.md. The code check verifies the experiment structure and actual relation; the rubric judges the explanation.
