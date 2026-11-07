# Stream review feedback — open after saving

The first frame occupies byte offsets `[0,8)`: a two-byte header declares six bytes, `sync:5`. The second occupies `[8,17)`: a two-byte header declares seven bytes, `note:12`.

The three delivered chunks end at offsets 3, 10 and 17. After the first, the header and one payload byte are present, so the decoder returns `[]`. After the second, it returns `['sync:5']` and retains the next frame's two-byte header. After the third, it returns `['note:12']` and retains nothing. `finish()` accepts that empty remainder.

Use the actual `os_read` rows in the supplied trace for the read-boundary question; do not copy delivery offsets as if they were OS observations. A read can stop before a frame ends or span a frame boundary. The valid reconstruction comes from the length headers and complete payload bytes, independent of how the OS grouped reads.

Sequence numbers order observations within one process. The same pipe preserves its byte order. A sorted timestamp log does not by itself prove which application event caused a different process's event or measure exact transport latency: scheduling and instrumentation intervene. Name your chosen events and measured time difference, then state that limit. An answer that says “the nearest timestamp must be its cause” needs repair even if all decoded strings are correct.

Preserve the first explanation, add the actual output and feedback to a new record, and explain the precise correction if needed. This return to an earlier skill is practice; one successful later attempt does not establish durable human retention.
