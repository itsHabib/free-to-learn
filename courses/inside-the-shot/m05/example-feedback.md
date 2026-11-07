# Printer completion feedback — open after saving

For the changed example, delivery 1 emits `[]`, with pending `02`. Delivery 2 emits `['up']`, with pending `0373`. Delivery 3 emits `['sun']`, with no pending bytes. Byte `03` in delivery 2 is the next length, not part of `up`: removing the first complete frame leaves the next frame's partial bytes.

If you emitted `sun` in delivery 2, count its promised three letters: only `s` has arrived. If you lost `03`, check whether you cleared the whole buffer after `up` instead of removing exactly the consumed prefix. If you treated each delivery as a word, the header bytes and the split `up` contradict that model.

Record this file as `hint-1` assistance with details. Retry mentally on `01 61 01 62` delivered as `01 61 01`, then `62`: after the first delivery you should have one completed word and one pending length. Check your answer using the same printer loop, save it separately, and explain the consumed prefix. These checks teach the one-byte example; you still own the real decoder's two-byte state and refusal rules.
