# 06 · Worked notebook

Audit completeness before calculating a score. The defeat below is an explicitly constructed authority-bypass control, so its violations must remain visible.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "counted": {
    "survival": 1,
    "completion": 1,
    "distance": 0.10833333333333339,
    "playedDistance": 0.10833333333333334,
    "challenge": 0.5,
    "proposalViolations": 6,
    "executedViolations": 0,
    "fallbacks": 12,
    "calls": 12,
    "latencyMs": 69,
    "duplicateEffects": 0,
    "staleEffects": 0
  },
  "defeat": {
    "survival": 0,
    "completion": 0,
    "distance": 0.7541666666666668,
    "playedDistance": 0.26249999999999996,
    "challenge": 0.3333333333333333,
    "proposalViolations": 3,
    "executedViolations": 3,
    "fallbacks": 0,
    "calls": 4,
    "latencyMs": 8,
    "duplicateEffects": 0,
    "staleEffects": 0
  },
  "healthyPrefixRejected": "invalid episode: nonterminal prefix is not a complete episode"
}
```

## Complete the accounting

For two decision records with calls [2,1], latency [8,5], and only the second containing a proposal violation, fill the three independent totals. A fallback that executes legally still leaves that proposal violation in the report.

## Independent change

Remove the last two rounds of a healthy complete trace without changing final. Predict the audit error, then run it. Now alter final to agree with the short prefix while leaving it nonterminal. That second version must still be rejected. A matching array length is not a termination condition.
