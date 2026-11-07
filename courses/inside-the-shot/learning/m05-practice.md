# Text practice for Project5

Read [m05.md](m05.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m05-layer-intervals

In the invented nine-byte capture, write intents are [0,3), [3,9); OS reads are [0,2), [2,3), [3,9); decoder deliveries are [0,1), [1,4), [4,9). Which claim follows from these recorded intervals?

- **a.** Delivery [1,4) contains bytes from both write intents; this capture does not guarantee the same OS reads on another run.

- **b.** Delivery [1,4) must equal one OS read because the application gave it to the decoder in one call.

- **c.** The sender made exactly two OS write calls and each became one message at the receiver.

[Feedback after choosing](m05-practice-feedback.md#m05-layer-intervals).

## m05-regroup-completion

Regroup the same toy stream 02 4f 4b 01 3f 03 52 55 4e into deliveries of 2, 4 and 3 bytes. After the SECOND delivery, what has that call returned and what remains pending? Toy lengths use one byte and allow 1..3.

- **a.** Return only OK; retain 01 3f 03 because one delivery can return at most one message.

- **b.** Return OK and ?; retain 03, the next frame's header.

- **c.** Return OK, ? and RUN; the final length byte proves the remaining letters are available.

[Feedback after choosing](m05-practice-feedback.md#m05-regroup-completion).

## m05-split-header

Use a two-byte big-endian variant of the toy protocol, allowing lengths 1..4. A fresh decoder receives 00, then 02 41. After those two feeds, what is known?

- **a.** The first feed declared forbidden length 0, so it had to fail before the second header byte arrived.

- **b.** The complete header declares length 2; one body byte A is present, so retain 00 02 41 and wait for one more body byte.

- **c.** The second feed starts a new header 02 41, declaring length 577; previous pending bytes should be discarded.

[Feedback after choosing](m05-practice-feedback.md#m05-split-header).

## m05-eof-application

Fresh application: feed toy bytes 01 58 03 59 5a. This returns X and retains 03 59 5a (length 3, only YZ present). Then call feed(b'') and finally finish(), with no further bytes. What should happen?

- **a.** The empty feed closes the stream successfully because it contains zero bytes.

- **b.** finish succeeds because X was already emitted, so all later bytes may be ignored.

- **c.** The empty feed emits nothing and leaves the suffix; finish refuses truncation because one body byte is missing.

[Feedback after choosing](m05-practice-feedback.md#m05-eof-application).

## m05-invalid-header

A fresh toy display decoder accepts lengths 1..3. Its first feed is the single byte 04, with no body. Which response follows from the protocol?

- **a.** Raise during feed: the complete header already declares 4, above the allowed maximum 3.

- **b.** Wait for four body bytes, then decide whether the length was permitted.

- **c.** Treat 04 as a body byte because the body has not yet arrived.

[Feedback after choosing](m05-practice-feedback.md#m05-invalid-header).

## m05-causal-order

One saved trace records writer intent at 100 ns, a peer read at 130 ns, and the writer's write-loop return at 160 ns. All are relative observations from one host run. Which interpretation is supported?

- **a.** The peer caused the write, since its read was logged before the writer's return.

- **b.** The read observation lies 30 ns after intent and 30 ns before return; scheduling and logging are included, so this is not an isolated transport-latency measurement.

- **c.** Exactly 60 ns of network latency occurred, and the same gap must recur under the fixed delivery schedule.

[Feedback after choosing](m05-practice-feedback.md#m05-causal-order).
