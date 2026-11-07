# Practice feedback for Project2

Open after choosing on [m02-practice.md](m02-practice.md). Preserve the original answer and any later correction.

## m02-complete-fields

Correct choice: b.

bias_unsigned = 0x80 + 0xff*256 = 65408; bias_signed = 65408 - 65536 = -128; cycles = 0x00 + 0x01*256 = 256; code = 0x7f = 127.

- **a.** 65408 is the unsigned value of 80 ff. The bias is signed and its top bit is set, so subtract 65536. The cycle and code readings in this choice use the stated rules.

- **b.** Bias bits give 128 + 255 × 256 = 65408, then signed interpretation gives -128. Cycles 00 01 give 0 + 1 × 256 = 256. Code 7f is 127.

- **c.** 00 01 means 256 in little-endian order. A value of 1 reverses its byte weights. Keep the slice correct while checking the byte-order decision separately.

[Return to this question](m02-practice.md#m02-complete-fields).

## m02-probe-width

Correct choice: a.

Two-byte little-endian 255 = ff 00 and 256 = 00 01. Reading only byte 4 yields 255 and 0 instead of 255 and 256.

- **a.** At 255 to 256, the low byte wraps from ff to 00 and the next becomes 01. A predicts cycle values 255 and 0; B predicts 255 and 256. The held-fixed fields make the changed byte easier to attribute.

- **b.** Both hypotheses read 1 and 2 for these bytes because the high byte remains zero. This ordinary pair does not reject the one-byte explanation.

- **c.** Changing bias can help locate bias bytes, but the cycle value remains 1 under both cycle-width hypotheses. Choose a probe whose cycle predictions disagree.

[Return to this question](m02-practice.md#m02-probe-width).

## m02-call-versus-layout

Correct choice: c.

bias_after = -3 + 5 = 2. Return source is memory[P+4:P+6] = 01 02 = 513. T+8 = S-8, whereas caller slot is S+8; neither is P+8.

- **a.** The updated bias is 2, but the final load overwrites w0 with the cycle count 513. Follow the return register's last producer rather than the most recent memory update.

- **b.** The store base is sp, so its address is S+8 or T+8. A record offset would use P as the base. Equal displacement text does not make these addresses equal.

- **c.** The signed load and addition produce -3+5=2, stored at P. The final halfword load reads cycles 513 into w0, which the caller leaves unchanged. Since T=S-16, the two pointer slots are 16 bytes apart.

[Return to this question](m02-practice.md#m02-call-versus-layout).

## m02-reordered-record

Correct choice: b.

code = 0x81 = 129; cycles = 1 + 2*256 = 513; bias_unsigned = 0 + 128*256 = 32768; bias_signed = 32768 - 65536 = -32768. New total length is 6.

- **a.** This reads both two-byte fields in big-endian order. With the declared little-endian order, 01 02 is 513 and 00 80 has unsigned value 32768, then signed value -32768.

- **b.** The revised ranges locate code 81, cycles 01 02 and bias 00 80. Apply the surviving interpretations to those new slices: 129, 513 and -32768.

- **c.** The old exact-length guard rejects six bytes, and its field offsets refer to different locations. Types can survive while the layout and guard must change.

[Return to this question](m02-practice.md#m02-reordered-record).
