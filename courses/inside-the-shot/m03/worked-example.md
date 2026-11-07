# Before trail: a two-reading badge

Goal: explain why a count, a byte length and an absolute end position are different numbers. Read this short example, then do the practice before opening its feedback. This page teaches a *different* format; its offsets are not trail offsets.

A byte is an integer from 0 to 255. Hexadecimal writes a byte with two base-16 digits: `7f` is 127, `80` is 128, `fe` is 254. A byte offset counts from zero. A slice `raw[2:4]` includes offsets 2 and 3, stopping before 4. Its length is two, not four. Multi-byte values need a byte order: little-endian stores the least significant byte first, so `01 02` means 513, while `02 01` means 258. `signed=True` interprets the high bit as part of a two's-complement signed number; `fe` is then −2.

Our badge format begins with `42` (ASCII B), then a one-byte count, then that many signed one-byte readings. The format accepts at most four readings. The sample `42 02 7f fe` has a two-byte header and two readings. Its total length is `2 + 2 = 4`. The second byte means *two readings*, not offset two or total size two.

| Offset | Byte | Meaning in this declared badge format |
| --- | --- | --- |
| 0 | 42 | Signature B |
| 1 | 02 | Two readings |
| 2 | 7f | Reading 127 |
| 3 | fe | Reading −2 |

The complete worked implementation is `badge.py`. Read its five validation lines and run it:

```sh
python3 badge.py
```

Expected output: `[127, -2]`. It first checks that the header exists, then validates the count and exact total length, then reads values. A short slice does **not** raise by itself: `int.from_bytes(b'', 'little')` returns 0. That convenience would conceal a truncated value, so validate the envelope before decoding. An envelope is the header plus the rule relating its declarations to the actual file.

Now edit response.json: set a nonempty `claim` predicting these three cases and put the reason in `reason`. Keep question_version unchanged. Save under stage prediction with the command in START-HERE before running this practice block.

```python
from badge import decode_badge
for sample in [b'B\x03\x00\x80\x7f', b'B\x02\x00', b'B\x05\x00\x00\x00\x00\x00']:
    try:
        print(decode_badge(sample))
    except ValueError as error:
        print(type(error).__name__, str(error))
```

Predict both decoded values and error cases. Is the last case complete but forbidden, or incomplete? Put the block in `badge_practice.py` to run it. Open practice-feedback.md afterward, compare with your saved prediction, and save a new result record. If you guessed the signed reading wrong, contrast `80` as unsigned 128 with its signed interpretation; do not fix it by deleting high bytes.

For trail you will receive input domains and candidate files, rather than this badge's layout. The method transfers: identify repeatable changes, decide a field boundary using a counterexample, then check lengths before trusting values. A printed zero is evidence about a value, not proof of padding.
