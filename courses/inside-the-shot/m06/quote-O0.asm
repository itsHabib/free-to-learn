
quote-O0:	file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000100000460 <_quote>:
100000460:     	sub	sp, sp, #0x20
100000464:     	str	w0, [sp, #0x1c]
100000468:     	str	w1, [sp, #0x18]
10000046c:     	str	w2, [sp, #0x14]
100000470:     	ldr	w8, [sp, #0x1c]
100000474:     	str	w8, [sp, #0x10]
100000478:     	ldr	w8, [sp, #0x10]
10000047c:     	tbz	w8, #0x1f, 0x10000048c <_quote+0x2c>
100000480:     	b	0x100000484 <_quote+0x24>
100000484:     	str	wzr, [sp, #0x10]
100000488:     	b	0x10000048c <_quote+0x2c>
10000048c:     	ldr	w8, [sp, #0x10]
100000490:     	subs	w8, w8, #0x28
100000494:     	b.le	0x1000004a8 <_quote+0x48>
100000498:     	b	0x10000049c <_quote+0x3c>
10000049c:     	mov	w8, #0x28               ; =40
1000004a0:     	str	w8, [sp, #0x10]
1000004a4:     	b	0x1000004a8 <_quote+0x48>
1000004a8:     	ldr	w9, [sp, #0x10]
1000004ac:     	mov	w8, #0x6                ; =6
1000004b0:     	mul	w8, w8, w9
1000004b4:     	add	w8, w8, #0xb
1000004b8:     	str	w8, [sp, #0xc]
1000004bc:     	ldr	w8, [sp, #0x18]
1000004c0:     	subs	w8, w8, #0x0
1000004c4:     	b.le	0x1000004ec <_quote+0x8c>
1000004c8:     	b	0x1000004cc <_quote+0x6c>
1000004cc:     	ldr	w8, [sp, #0x10]
1000004d0:     	subs	w8, w8, #0x8
1000004d4:     	b.lt	0x1000004ec <_quote+0x8c>
1000004d8:     	b	0x1000004dc <_quote+0x7c>
1000004dc:     	ldr	w8, [sp, #0xc]
1000004e0:     	subs	w8, w8, #0x9
1000004e4:     	str	w8, [sp, #0xc]
1000004e8:     	b	0x1000004ec <_quote+0x8c>
1000004ec:     	ldr	w8, [sp, #0x14]
1000004f0:     	cbz	w8, 0x100000514 <_quote+0xb4>
1000004f4:     	b	0x1000004f8 <_quote+0x98>
1000004f8:     	ldr	w9, [sp, #0x10]
1000004fc:     	mov	w8, #0x2                ; =2
100000500:     	mul	w9, w8, w9
100000504:     	ldr	w8, [sp, #0xc]
100000508:     	add	w8, w8, w9
10000050c:     	str	w8, [sp, #0xc]
100000510:     	b	0x100000514 <_quote+0xb4>
100000514:     	ldr	w8, [sp, #0xc]
100000518:     	subs	w8, w8, #0xc8
10000051c:     	b.le	0x100000530 <_quote+0xd0>
100000520:     	b	0x100000524 <_quote+0xc4>
100000524:     	mov	w8, #0xc8               ; =200
100000528:     	str	w8, [sp, #0xc]
10000052c:     	b	0x100000530 <_quote+0xd0>
100000530:     	ldr	w0, [sp, #0xc]
100000534:     	add	sp, sp, #0x20
100000538:     	ret
