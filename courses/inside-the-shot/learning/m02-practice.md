# Text practice for Project2

Read [m02.md](m02.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m02-complete-fields

Complete the ten-byte gauge decode for 80 ff a6 77 00 01 7f c0 77 19. Bias is signed little-endian raw[0:2], cycles is unsigned little-endian raw[4:6], and code is unsigned raw[6]. Which result follows?

- **a.** bias = 65408, cycles = 256, code = 127.

- **b.** bias = -128, cycles = 256, code = 127.

- **c.** bias = -128, cycles = 1, code = 127.

[Feedback after choosing](m02-practice-feedback.md#m02-complete-fields).

## m02-probe-width

You are investigating the gauge cycle field. Hypothesis A reads only byte 4; B reads two little-endian bytes starting at 4. Which pair most directly tests the missing high byte while keeping other field inputs fixed?

- **a.** Cycles 255 and 256: compare ff 00 with 00 01 at offsets 4–5.

- **b.** Cycles 1 and 2: compare 01 00 with 02 00 at offsets 4–5.

- **c.** Keep cycles 1 and change the bias from -1 to 0.

[Feedback after choosing](m02-practice-feedback.md#m02-probe-width).

## m02-call-versus-layout

In the worked gauge call, P points to bias -3 and cycles 513, and increment is 5. The caller's stack is S and the callee's is T = S - 16. Each saves P at its own [sp,#8]. The callee sign-loads bias, adds 5, stores a halfword at P, then loads cycles from P+4 into w0. What follows?

- **a.** Bias becomes 2, and both functions return 2 because that was the latest update.

- **b.** The saved pointer proves that bytes at record offset 8 contain P.

- **c.** Bias becomes 2; both returns carry 513; S+8 and T+8 are distinct stack slots containing P.

[Feedback after choosing](m02-practice-feedback.md#m02-call-versus-layout).

## m02-reordered-record

A revised six-byte gauge declares code at [0:1], unsigned little-endian cycles at [1:3], an ignored byte at [3:4], and signed little-endian bias at [4:6]. Decode 81 01 02 aa 00 80.

- **a.** code = 129, cycles = 258, bias = 128.

- **b.** code = 129, cycles = 513, bias = -32768.

- **c.** Reuse the original ten-byte decoder unchanged, because the field types survived.

[Feedback after choosing](m02-practice-feedback.md#m02-reordered-record).
