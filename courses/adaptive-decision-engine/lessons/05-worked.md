# 05 · Worked notebook

Compute evidence inside the requested domain. A successful population cannot certify the failing population.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "easy": {
    "lo": 0.8,
    "hi": 1.0000001,
    "n": 90,
    "yes": 90,
    "episodes": 90,
    "p": 1,
    "rowRate": 1,
    "interval": [
      0.8568435305510875,
      1
    ]
  },
  "hard": {
    "lo": 0.8,
    "hi": 1.0000001,
    "n": 10,
    "yes": 0,
    "episodes": 10,
    "p": 0,
    "rowRate": 0,
    "interval": [
      0,
      0.4294694083467376
    ]
  },
  "easyDecision": {
    "use": true,
    "reason": "supported",
    "probability": 1,
    "interval": [
      0.8568435305510875,
      1
    ],
    "episodes": 90,
    "domain": "easy"
  },
  "hardDecision": {
    "use": false,
    "reason": "uncertain",
    "probability": 0,
    "interval": [
      0,
      0.4294694083467376
    ],
    "episodes": 10,
    "domain": "hard"
  }
}
```

## Complete the grouping

Within one domain, episode A has labels [1,1,0,0] and episode B has [0]. Compute each episode fraction, then their equal-weight mean. Fill the final reduction in your calibration function. Report the pooled row mean separately and explain why it differs.

## Independent change

Replace B with twelve rows all from the same episode and unique revisions. It remains one independent episode. Duplicate one exact episode/revision record and verify that it is rejected. Use an unseen domain and record why the selector abstains.
