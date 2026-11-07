# 04 · Worked notebook

Follow the complete request → response → binding → proposal path on a small encounter choice. The local request retains its question identity before any response is read.

This output was executed with the author demonstration. It is not your submission.

```json
{
  "questionNames": [
    "encounter"
  ],
  "offered": [
    "rest",
    "scout",
    "swarm",
    "brute"
  ],
  "binding": {
    "requestId": "311e4f6d",
    "stateHash": "5704c776",
    "revision": 0
  },
  "selected": "scout",
  "valid": {
    "ok": true,
    "action": {
      "kind": "scout"
    },
    "distribution": {
      "rest": 0.09999999999999999,
      "scout": 0.7,
      "swarm": 0.09999999999999999,
      "brute": 0.09999999999999999
    },
    "score": 0.68,
    "binding": {
      "stateHash": "5704c776",
      "questionHash": "ff03c5e8",
      "episodeId": "binding-notebook",
      "revision": 0,
      "allowed": [
        "rest",
        "scout",
        "swarm",
        "brute"
      ],
      "model": "fixture-v1",
      "host": "offline",
      "adapterVersion": "beacon-adapter/1",
      "requestId": "311e4f6d"
    },
    "origin": "synthetic-fixture"
  },
  "wrongQuestion": {
    "ok": false,
    "error": "invalid-response"
  }
}
```

## Complete the interpretation

Keep the same request, but move its encounter answer under a different name. Before checking, write which field proves that the answer no longer belongs to the requested question. Fill only the named-answer lookup in your adapter, then handle the missing answer with an explicit error.

## Independent change

Offer only rest and scout at a later revision. Preserve the body and its binding before constructing a response. Reverse the response key order, then replace its model with another name. Your valid ordering change must pass; the model mismatch must fail. Explain why returning rest as if the model selected it would erase the failure.
