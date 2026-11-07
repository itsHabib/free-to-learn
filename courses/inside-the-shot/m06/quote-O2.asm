
quote-O2:	file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000100000460 <_quote>:
100000460:     	bic	w8, w0, w0, asr #31
100000464:     	mov	w9, #0x28               ; =40
100000468:     	cmp	w8, #0x28
10000046c:     	csel	w8, w8, w9, lt
100000470:     	mov	w9, #0x6                ; =6
100000474:     	cmp	w1, #0x0
100000478:     	ccmp	w0, #0x7, #0x4, gt
10000047c:     	mov	w10, #0xb               ; =11
100000480:     	mov	w11, #0x2               ; =2
100000484:     	csel	w10, w11, w10, gt
100000488:     	madd	w9, w8, w9, w10
10000048c:     	lsl	w8, w8, #1
100000490:     	cmp	w2, #0x0
100000494:     	csel	w8, wzr, w8, eq
100000498:     	add	w8, w9, w8
10000049c:     	mov	w9, #0xc8               ; =200
1000004a0:     	cmp	w8, #0xc8
1000004a4:     	csel	w0, w8, w9, lo
1000004a8:     	ret
