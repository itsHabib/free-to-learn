
fee-O2:	file format mach-o arm64

Disassembly of section __TEXT,__text:

00000001000004ac <_fee_example>:
1000004ac:     	mov	w8, #0x7                ; =7
1000004b0:     	mov	w9, #0x4                ; =4
1000004b4:     	cmp	w1, #0x0
1000004b8:     	csel	w8, w9, w8, eq
1000004bc:     	add	w0, w8, w0
1000004c0:     	ret
