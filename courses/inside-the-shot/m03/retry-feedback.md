# Badge retry feedback — open after saving and running

Input A prints `A [-1]`. The header declares one reading and exactly one byte follows. That byte is ff: under the badge's signed one-byte interpretation it is −1. Treating ff as 255 would lose the declared signed interpretation.

Input B prints `B ValueError badge length`. Its count is zero, but a reading byte remains. Zero count does not authorize ignoring trailing bytes; the total must still equal two header bytes plus the declared count.

Compare these results with your saved prediction. If you missed A, name the signedness rule you changed. If you missed B, explain why an exact-size check differs from an “at least enough bytes” check. Save a new result record with the observed output and that explanation; do not rewrite the prediction.
