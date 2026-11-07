# Transfer hints — open after the transfer prediction

Opening this page makes the current case assisted practice. Keep the earlier prediction unchanged. A later claim of independent transfer needs another case whose guidance and answer you have not seen.

Record the highest level as `transfer-hint-1`, `transfer-hint-2` or `transfer-hint-3`, with this filename and what it revealed in `assistance_details`. Keep baseline help separately identifiable.

## Level 1

The protocol is unchanged; only a request payload and the boundaries used to deliver replies change. An implementation based on declared lengths should not need hard-coded delivery sizes.

## Level 2

Count printable ASCII characters in the new ACK payload, then include its two header bytes. Compare the sum of reply frame sizes with the delivery sizes. The saved prediction should say which delivery can complete each frame, not just list the final messages.

## Level 3

After a header-only delivery, preserve both bytes. The next delivery can complete its payload exactly. Later a single header byte arrives, followed by a chunk that completes that header and starts the body. Reuse your byte-offset table; a changed split should not require a changed parser.
