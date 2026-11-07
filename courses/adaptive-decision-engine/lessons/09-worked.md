# 09 · Worked notebook

Save the state that affects the next decision and keep network arming separate from saved progress.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "before": {
    "round": 3,
    "memory": {
      "recovering": true
    },
    "used": 3,
    "pending": true,
    "armed": true
  },
  "restored": {
    "round": 3,
    "memory": {
      "recovering": true
    },
    "used": 3,
    "pending": null,
    "armed": false
  },
  "nextDecisionEqual": true
}
```

## Complete the restore

Keep the saved memory and spent allowance, but clear a pending request and disarm transport. Fill these fields before checking next-action equality. A next-action check alone cannot detect a refunded request budget.

## Independent change

Export your current browser or terminal work, extract it and use ./work directly. Status must retain the old attempts before you run a new check. Run exactly one check and export again: the old attempts remain byte-for-byte, followed by the new attempt. Repeat with the legacy root-only session layout.

## Preserve an already-selected encounter

The earlier table tests the pure checkpoint function. Runtime recovery has another obligation: preserve a decision that was already selected. The following executed control increments memory on every selection. Re-evaluating it during resume would change both the counter and the pending encounter.

```json
{
  "before": {
    "round": 0,
    "encounter": "scout",
    "memory": {
      "recovering": false,
      "calls": 1
    }
  },
  "afterResume": {
    "round": 0,
    "encounter": "scout",
    "memory": {
      "recovering": false,
      "calls": 1
    }
  },
  "afterResolve": {
    "round": 1,
    "encounter": "rest",
    "memory": {
      "recovering": false,
      "calls": 2
    }
  }
}
```

The saved scout and counter 1 survive resume without another policy call. Resolving scout advances the game once, then a single new selection produces rest and counter 2. Complete your own table for two consecutive resumes before the player acts. The counter and selected encounter must remain unchanged. Older checkpoints did not save the selection; they can restore state and memory, but must clearly request an explicit new selection instead of pretending to reconstruct the missing one.
