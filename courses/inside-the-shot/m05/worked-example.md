# A different example: a label printer

A printer receives labels from a process: one running program with its own memory and operating-system process ID (PID). A **pipe** connects one process's output to another's input. It carries an ordered stream of bytes, not a queue of Python strings. A **frame** is the protocol's rule for finding one message within that stream.

This example uses a **one-byte** length followed by a lowercase word. It is deliberately different from the live lab's two-byte length and printable ASCII payloads. Hex `03` means the integer 3; `63 61 74` spells `cat`. The frame `03 63 61 74` therefore carries one word. No newline is implied.

A writer sends `03 63 61 74 02 6f 78`, two frames (`cat`, `ox`). Suppose the reader receives these deliveries:

1. **Delivery 1: `03 63`.** The buffer was empty. The header promises three payload bytes, but only `63` has arrived. Emit nothing and retain `03 63`.
2. **Delivery 2: `61 74 02`.** Add this to the pending `03 63`. The first frame is now complete: emit `cat` and remove exactly `03 63 61 74`. Retain `02`, the next length header.
3. **Delivery 3: `6f 78`.** Add this to the pending `02`. Emit `ox` and remove its frame; the buffer is now empty.

A **buffer** stores bytes that arrived before a whole frame was available. An **incremental decoder** accepts a chunk, adds it to the buffer, removes every complete frame, and keeps the unfinished suffix for later. “Incremental” means it can continue from previous calls. It must loop: one delivery can finish several frames. It must also wait: one frame can span several deliveries. The length header itself can be split in the real lab.

An OS `read` asks for up to a number of bytes. On a pipe it can return fewer without marking the end of a message. Empty bytes from a blocking OS read mean EOF, the end of that stream after writers close. A decoder call with `b""` is different: our API treats it as an empty chunk; a separate `finish()` tells the decoder about EOF. The supervised lab groups OS reads into prescribed delivery sizes so the exercise is repeatable. These groups are observations at the application boundary, not claims about how the OS packetized anything.

This small printer decoder is a worked implementation, not the lab's answer. It omits the lab's two-byte header, bounds, printable-ASCII checks and lifecycle rules. Copy the block into a new file `printer_example.py`, then run it. `bytearray` is a mutable sequence of bytes; `del pending[:n]` removes its first n bytes; `.decode("ascii")` maps ASCII bytes to a Python string. The loop stops when a complete frame is unavailable.

```python
pending = bytearray()

def printer_feed(chunk):
    pending.extend(chunk)
    words = []
    while pending:
        length = pending[0]
        if len(pending) < 1 + length:
            break
        words.append(bytes(pending[1:1 + length]).decode("ascii"))
        del pending[:1 + length]
    return words

for chunk in [bytes.fromhex("03 63"), bytes.fromhex("61 74 02"), bytes.fromhex("6f 78")]:
    print(printer_feed(chunk), pending.hex())
```

```sh
python3 printer_example.py
```

Expected lines: `[] 0363`, then `['cat'] 02`, then `['ox'] ` (the last buffer is empty). Match each line to the trace before continuing.

## Complete a new trace before feedback

Use new words and new boundaries: `02 75 70 03 73 75 6e` carries two labels. Deliveries are `02`, then `75 70 03 73`, then `75 6e`. Without running code, record the output list and pending hex after each delivery. Explain why the middle delivery both completes an old frame and starts a new one. Use `purpose: printer-completion-prediction` and save a `prediction` record with the recorder command in START-HERE section 1.

Only after saving, replace the final `for` line's three chunks with those above and run `python3 printer_example.py` again. Compare your prediction with the result. Open `example-feedback.md` for the explanation, then save a new assisted observation. The normal worked trace above is teaching; the completion feedback is optional help to disclose as `hint-1` with its filename.

## Separate byte order from time

A monotonic timestamp is a clock reading whose differences are useful within one host run; it is not a date. Our child processes use `time.monotonic_ns()`, measured in nanoseconds. That unit does not guarantee nanosecond accuracy. A read observation may be logged before the writer logs its write return: the bytes reached the reader while the writer was waiting to run its next line. So do not infer “the read caused the write” from sorted log lines. Stream offsets (byte positions beginning at zero) and each process's own numbered sequence constrain the explanation.

Before the live run, say which evidence would distinguish these claims: “the third delivery completes two messages” and “the third OS read is the third message.” The first refers to complete frames within supplied groups; the second assumes an unsupported boundary. In the investigation you will inspect both logs, not just assert the principle.
