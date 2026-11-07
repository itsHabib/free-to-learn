# 07 · Worked notebook

Reserve first, then settle the matching ticket. This example distinguishes a successful transport from a timeout without changing the used count.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "reserved": {
    "state": {
      "used": 1,
      "maxRequests": 2,
      "timeoutMs": 5,
      "serial": 1,
      "pending": {
        "token": 1,
        "episodeId": "notebook",
        "revision": 3,
        "deadline": 15
      },
      "armed": false
    },
    "ticket": {
      "token": 1,
      "episodeId": "notebook",
      "revision": 3,
      "deadline": 15
    }
  },
  "timely": {
    "state": {
      "used": 1,
      "maxRequests": 2,
      "timeoutMs": 5,
      "serial": 1,
      "pending": null,
      "armed": false
    },
    "accepted": true,
    "proposal": {
      "ok": true,
      "action": {
        "kind": "rest"
      }
    }
  },
  "atDeadline": {
    "state": {
      "used": 1,
      "maxRequests": 2,
      "timeoutMs": 5,
      "serial": 1,
      "pending": null,
      "armed": false
    },
    "accepted": false,
    "error": "timeout"
  }
}
```

## Complete the state transition

Start with used=1 and a matching pending ticket. Settle an unavailable response before its deadline. Fill pending, accepted and used. Then substitute a valid response: accepted must change while used stays spent.

## Independent change

Keep the revision number but change the episode ID. Show that a timely response is still stale. Finally, let fallback advance the original episode and release the old promise. Record one returned decision and one discarded late response, not two game transitions.
