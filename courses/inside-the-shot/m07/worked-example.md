# A tiny count file, completely worked

Goal: read raw bytes, check a declared length, and turn fixed-size entries into values. This example is a separate invented format, not the reservation program. It teaches I/O vocabulary so capstone time is spent choosing evidence rather than guessing commands.

A **file** is a named byte sequence. Python `Path.read_bytes()` reads it as `bytes`; no text decoding occurs. Hex displays one byte as two digits: `51` is one byte, not decimal 51. An **offset** starts at zero. A **header** describes the following data. A **count** declares how many entries to expect; it does not make missing bytes exist.

The toy count format begins with byte `51`, then a one-byte count no larger than three, then that many unsigned two-byte little-endian values. Little-endian puts the least significant byte first: `01 02` is 1 + 2×256 = 513. Reject wrong magic, excessive count, missing bytes and trailing bytes before decoding values. The decoder consumes a complete bounded file; it does not treat one OS read as one record.

Here is the complete example. It prints `[1, 513]` followed by `refused`:

```python
from pathlib import Path
from tempfile import TemporaryDirectory


def decode_counts(raw):
    if type(raw) is not bytes or not 2 <= len(raw) <= 8:
        raise ValueError('expected 2..8 bytes')
    if raw[0] != 0x51 or raw[1] > 3 or len(raw) != 2 + 2 * raw[1]:
        raise ValueError('magic, count or length mismatch')
    return [int.from_bytes(raw[i:i + 2], 'little') for i in range(2, len(raw), 2)]


with TemporaryDirectory() as folder:
    path = Path(folder) / 'counts.bin'
    path.write_bytes(bytes.fromhex('51 02 01 00 01 02'))
    print(decode_counts(path.read_bytes()))
    try:
        decode_counts(path.read_bytes()[:-1])
    except ValueError:
        print('refused')
```

`bytes.fromhex` converts printed hex to bytes; spaces only improve readability. `[i:i + 2]` slices exactly two bytes. `range(2, len(raw), 2)` steps past the header two bytes at a time. `[:-1]` removes the final byte. `raise ValueError` stops on invalid data; the `try`/`except` here displays that expected refusal. A temporary directory is automatically cleaned up only for this toy example. Your capstone evidence uses persistent files.

Before opening feedback, edit `response.json` to add `count_practice`: predict `decode_counts(bytes.fromhex('51 02 00 01 80 00'))`, then predict the result after appending `00`. Explain what would go wrong if the count were trusted without a length check. Save:

```sh
python3 notebook.py record --workspace work/m07 --stage orientation --response response.json --manifest manifest.json --assistance none
```

If you used help, replace `none` with the actual category and fill `assistance_details`. Now read [practice-feedback.md](practice-feedback.md), compare it with the saved answer, and save a second orientation record describing any revision. Do not delete the first.

For persistent capstone probes, `write_hex.py --hex TEXT --out FILE` creates a **new** file. Its mutation mode copies an existing file and changes one byte; it refuses to overwrite an existing filename. Use a new name for a revision. This is evidence custody, not security: the file's owner could still edit it manually. `--offset` and `--value` use decimal integers. The helper can write malformed probes up to 73 bytes, one more than the target's maximum, but it does not know or check the reservation format. A helper success only confirms the file was written.

The count example is fully explained. The capstone is deliberately less directed: choose a question, make a prediction, preserve it, then run a probe capable of disproving it. [START-HERE.md](START-HERE.md) supplies the process and interface, not the hidden transition rule.
