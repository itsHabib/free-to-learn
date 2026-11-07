# Fresh badge retry — predict before running

The previous practice showed why signed values, exact lengths and maximum counts need separate checks. Apply those ideas to these two new inputs. Keep this page open; do not open retry-feedback.md until you have saved your predictions and run the check.

- Input A: `42 01 ff`.
- Input B: `42 00 ff`.

For each input, predict the complete decoded result or the error type. Explain the count, actual number of reading bytes and signed interpretation that support your decision. Put those predictions in response.json and save a **new** prediction record before running:

```sh
python3 notebook.py record --workspace work/m03 --stage prediction --response response.json --manifest manifest.json --assistance none
```

Use your actual assistance level if you have used optional hints, checker output or solutions; do not reset it to none. Put the following block in badge_retry.py, then run `python3 badge_retry.py`:

```python
from badge import decode_badge
for label,sample in [('A', b'B\x01\xff'), ('B', b'B\x00\xff')]:
    try:
        print(label, decode_badge(sample))
    except ValueError as error:
        print(label, type(error).__name__, str(error))
```

Now open [retry-feedback.md](retry-feedback.md). Compare its explanation and your actual output with the already saved prediction. Save a new result record and attach badge_retry.py. Keep the earlier record unchanged.
