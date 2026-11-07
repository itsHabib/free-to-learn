# Baseline hints — choose one level after saving

Record the highest level read as `hint-1`, `hint-2` or `hint-3` and name this file in `assistance_details`. Completion-example feedback also uses `hint-1`; name both files if you used both. Save earlier attempts before help. These hints are not a substitute for your timeline.

## Level 1: identify the boundary

Number the response bytes from zero. Draw one row per delivery: incoming interval, old pending bytes, completed payloads, new pending bytes. Decode a length only when both header bytes exist. A complete header without its payload emits nothing. Start from the different printer example if this still feels unclear.

## Level 2: preserve the suffix

After removing one complete frame, check whether at least two bytes remain for another header. Do not return after the first message. Do not clear the entire buffer. `int.from_bytes(two_bytes, "big")` is the supplied length operation. Check the 1..64 bound before waiting for its payload.

## Level 3: track lifecycle

Keep pending bytes and an open/failed/finished state in the instance. Validate chunk type and size before adding it. A header defines exactly how many payload bytes belong to this frame; check every completed payload byte is between 32 and 126. EOF with pending bytes is an error, not a successful shorter message. Mark failures so the caller must make a new decoder. Test an empty chunk separately from EOF.
