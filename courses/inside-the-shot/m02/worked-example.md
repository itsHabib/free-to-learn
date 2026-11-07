# Worked example — read a seven-byte sensor record

A sensor sends seven bytes, but a display needs three integers. You will turn that record into a Python dictionary while keeping byte positions, byte order and signed values distinct. The first example is worked through below. Each later exercise has its own feedback page; open only that exercise's feedback after saving its prediction.

This invented wire format is a teaching example, not the native parcel's layout. It has a one-byte channel at offset 0, a two-byte unsigned reading at offset 1, two padding bytes at offsets 3–4, and a two-byte signed drift at offset 5. **Unsigned** integers represent zero and positive values; **signed** integers also represent negative values. Padding is unused space that the decoder ignores. A **byte** contains eight binary digits, or bits; two hexadecimal digits represent one byte. Hexadecimal counts 0–9 then a–f, so `ff` represents 255.

## Read positions before values

An offset counts from zero. A Python slice `raw[1:3]` takes byte 1 and byte 2; the end position 3 is excluded. That makes the two-byte reading occupy `[1:3]`, not `[1:2]`.

Little-endian means the byte with the smallest place value comes first. `2c 01` represents 44 + 1 × 256 = 300. Reversing those bytes gives 1 + 44 × 256 = 11265. Width and byte order are separate choices: both examples still contain two bytes.

This record's bytes are `07 2c 01 aa 55 fe ff`. Before reading the next section, write the three values you expect in `response.json`, using an extra field named `sensor_prediction`. If signed drift is unfamiliar, record it as unknown for now. Use `claim` to explain which bytes belong to each field. Save before revealing the decoded result:

```sh
python3 notebook.py record --workspace work/m02 --stage prediction --response response.json --manifest manifest.json --assistance none
```

## Interpret the sign and decode the record

Your prediction should use `07` for channel and `2c 01` for reading. The padding `aa 55` belongs to neither value. Drift uses `fe ff`, with the low byte first.

**Two's complement** is the signed-integer encoding used here. For two bytes, first read the bits as an unsigned integer. The top bit is the bit with the largest place value; in little-endian order it belongs to the last byte. If the top bit is zero, the signed value is the same. If the top bit is one, subtract 65536, the number of possible two-byte patterns. `fe ff` is unsigned 65534, so its signed value is 65534 − 65536 = −2. The nearby `ff 7f` is 32767, while `00 80` is −32768. One bit pattern can have different values under signed and unsigned interpretation.

`bytes.fromhex` turns readable pairs into Python bytes. `int.from_bytes` reads a slice with an explicit order and signedness. This complete example checks the type and exact length first, because a short slice can otherwise decode successfully while silently omitting bytes.

```python
def decode_sensor(raw):
    if not isinstance(raw, bytes) or len(raw) != 7:
        raise ValueError("sensor record must be bytes of length 7")
    return {
        "channel": raw[0],
        "reading": int.from_bytes(raw[1:3], "little", signed=False),
        "drift": int.from_bytes(raw[5:7], "little", signed=True),
    }

sample = bytes.fromhex("07 2c 01 aa 55 fe ff")
print(decode_sensor(sample))
```

Save this code as `sensor_example.py` in the bundle folder and run `python3 sensor_example.py`. It prints:

```text
{'channel': 7, 'reading': 300, 'drift': -2}
```

Compare that result with `sensor_prediction`, then add the actual result and your explanation under `sensor_observation`. Save a new `prediction` record. The saved original remains your first attempt; the output resolves it without erasing it.

## Complete one case, then decode a new one

First complete these three values without running Python: `reading = int.from_bytes(bytes.fromhex("00 02"), "little", signed=False)`, `drift = int.from_bytes(bytes.fromhex("01 80"), "little", signed=True)`, and the number of bytes in the slice `[5:7]`. Put your answers in `sensor_completion`, then save a `prediction` record with the earlier command.

After saving, add this below the example code and run it. Each comparison prints whether your recorded numeric answer matches the computed value; replace the three `None` placeholders with your own numbers before running.

```python
my_reading, my_drift, my_width = None, None, None
reading = int.from_bytes(bytes.fromhex("00 02"), "little", signed=False)
drift = int.from_bytes(bytes.fromhex("01 80"), "little", signed=True)
width = len(sample[5:7])
print("completion:", my_reading == reading, my_drift == drift, my_width == width)
print("actual:", reading, drift, width)
```

After saving your answers, run the checks and use [the completion feedback](completion-feedback.md) to diagnose a difference. Add the result and any repair to your response.

Now independently predict all three decoded fields for `09 ff 00 00 00 00 80`. Also decide whether `09 ff 00 00 00 00` should produce a dictionary or an error. Put both decisions and their reasons in `sensor_practice`, and save before using the following checks:

```python
practice = bytes.fromhex("09 ff 00 00 00 00 80")
print("practice:", decode_sensor(practice))
for invalid in (practice[:-1], practice + b"\x00", "09 ff 00 00 00 00 80"):
    try:
        decode_sensor(invalid)
    except ValueError as error:
        print(type(error).__name__, str(error))
```

After saving and running the practice checks, compare with [the practice feedback](practice-feedback.md). Keep the initial answer even if you revise it.

Finally, predict whether replacing padding `aa 55` with `00 ff` changes the first dictionary. Save that prediction, then check it with:

```python
print("padding ignored:", decode_sensor(sample) == decode_sensor(bytes.fromhex("07 2c 01 00 ff fe ff")))
```

After saving and checking your padding prediction, read [the padding feedback](padding-feedback.md). Native programs can contain padding too, but their offsets come from their actual layout. Return to [START-HERE.md](START-HERE.md) and infer those offsets from the parcel's probes and listing; do not copy the sensor offsets.
