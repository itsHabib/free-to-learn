# Practice feedback for Project5

Open after choosing on [m05-practice.md](m05-practice.md). Preserve the original answer and any later correction.

## m05-layer-intervals

Correct choice: a.

[1,4) intersects [0,3) in [1,3), length 2, and [3,9) in [3,4), length 1. The OS read intervals are independently supplied observations; no future-read premise is given.

- **a.** Offsets 1 and 2 belong to the first intent, and offset 3 to the second. Grouping those three bytes is an application action; the read intervals describe only this capture.

- **b.** No observed read interval equals [1,4). The application can retain bytes from reads and regroup them before a decoder call.

- **c.** Write intents describe the write loop's intended ranges, not its OS call count. Messages require the framing rule; neither write count nor read count identifies them.

[Return to this question](m05-practice.md#m05-layer-intervals).

## m05-regroup-completion

Correct choice: b.

Delivery 1=[0,2): 02 4f, no complete frame. Delivery 2=[2,6): 4b 01 3f 03. Accumulated [0,6) consumes frame lengths 3+2=5, leaving 6-5=1 byte, 03. Returned payloads are OK and ?.

- **a.** After removing the completed OK frame, 01 3f is another complete frame. Continue the loop and consume it; otherwise a completed message is unnecessarily delayed.

- **b.** The first two deliveries supply offsets [0,6). Frames [0,3) and [3,5) are complete; offset 5 is 03, whose three body bytes have not arrived.

- **c.** A declared length does not supply the body. The second delivery ends at exclusive offset 6; RUN occupies offsets 6, 7 and 8 and arrives only in the third.

[Return to this question](m05-practice.md#m05-regroup-completion).

## m05-split-header

Correct choice: b.

Header width=2. After first feed, available header bytes=1<2. After second, buffer=00 02 41, length=0*256+2=2, required total=2+2=4, available=3, deficit=1 body byte.

- **a.** One byte is insufficient for this two-byte header. Interpret a length only after both bytes arrive; a leading zero can be part of a valid length.

- **b.** Combined bytes are 00 02 41. Header value is 0*256+2=2; the complete frame needs 2 header + 2 body = 4 bytes, and only 3 are available.

- **c.** Feed boundaries do not restart framing. Preserve the pending 00 and combine it with the next 02; 41 then has the body role. Discarding pending bytes loses the stream position.

[Return to this question](m05-practice.md#m05-split-header).

## m05-eof-application

Correct choice: c.

Input length=5. First frame length=1+1=2, leaving 3 bytes. Second required length=1+3=4, so deficit=4-3=1. feed(empty) adds 0; finish cannot accept a nonempty incomplete suffix.

- **a.** Only finish announces EOF in this API. An empty feed adds zero bytes and cannot turn an incomplete open stream into a cleanly closed one.

- **b.** Earlier output does not license dropping the suffix. X occupies its own complete two-byte frame; the second frame still requires three body bytes.

- **c.** Pending has 1 header + 2 body bytes, while the promised frame needs 1+3=4. Empty feed adds none, so EOF arrives with a one-byte deficit. The earlier X remains an earlier valid event.

[Return to this question](m05-practice.md#m05-eof-application).

## m05-invalid-header

Correct choice: a.

Header width=1, supplied bytes=1, declared length=0x04=4. Allowed interval is [1,3], and 4 is outside it. Refusal does not depend on body availability.

- **a.** The toy header is one byte, so its value is fully known now. Since 4>3, no later body can make this frame valid.

- **b.** Waiting is appropriate for an incomplete body under a permitted header. It is unnecessary once a complete header violates the length bound.

- **c.** At the start of a fresh stream the first byte has the header role. Arrival timing cannot change that role into payload.

[Return to this question](m05-practice.md#m05-invalid-header).

## m05-causal-order

Correct choice: b.

Recorded gaps are 130-100=30 ns, 160-130=30 ns and 160-100=60 ns. The supplied data identify endpoints only; no premise isolates transport or requires repeatable timing.

- **a.** A peer can receive bytes while the writer is still inside its loop or waiting to log return. Use byte order and each process's local sequence; return logging is not the creation of the bytes.

- **b.** 130-100=30 and 160-130=30 describe the recorded observation gaps. They do not separate buffering, scheduling, code execution and logging from transport.

- **c.** 160-100=60 is an intent-to-return observation span, not an isolated network quantity. This is a local pipe, and scripted application grouping does not fix scheduling or future timestamps.

[Return to this question](m05-practice.md#m05-causal-order).
