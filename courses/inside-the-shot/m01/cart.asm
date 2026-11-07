
cart:	file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000100000770 <_lab_step>:
100000770:     	sub	sp, sp, #0x20
100000774:     	str	x0, [sp, #0x18]
100000778:     	str	x1, [sp, #0x10]
10000077c:     	str	w2, [sp, #0xc]
100000780:     	ldr	x8, [sp, #0x10]
100000784:     	ldr	w8, [x8]
100000788:     	ldr	w10, [sp, #0xc]
10000078c:     	mov	w9, #0x2                ; =2
100000790:     	mul	w9, w9, w10
100000794:     	add	w8, w8, w9
100000798:     	str	w8, [sp, #0x8]
10000079c:     	ldr	w8, [sp, #0x8]
1000007a0:     	subs	w8, w8, #0x6
1000007a4:     	b.le	0x1000007b8 <_lab_step+0x48>
1000007a8:     	b	0x1000007ac <_lab_step+0x3c>
1000007ac:     	mov	w8, #0x6                ; =6
1000007b0:     	str	w8, [sp, #0x8]
1000007b4:     	b	0x1000007b8 <_lab_step+0x48>
1000007b8:     	ldr	w8, [sp, #0x8]
1000007bc:     	adds	w8, w8, #0x6
1000007c0:     	b.ge	0x1000007d4 <_lab_step+0x64>
1000007c4:     	b	0x1000007c8 <_lab_step+0x58>
1000007c8:     	mov	w8, #-0x6               ; =-6
1000007cc:     	str	w8, [sp, #0x8]
1000007d0:     	b	0x1000007d4 <_lab_step+0x64>
1000007d4:     	ldr	w8, [sp, #0x8]
1000007d8:     	ldr	x9, [sp, #0x10]
1000007dc:     	str	w8, [x9]
1000007e0:     	ldr	x8, [sp, #0x18]
1000007e4:     	ldr	w8, [x8]
1000007e8:     	ldr	w9, [sp, #0x8]
1000007ec:     	add	w8, w8, w9
1000007f0:     	ldr	x9, [sp, #0x18]
1000007f4:     	str	w8, [x9]
1000007f8:     	add	sp, sp, #0x20
1000007fc:     	ret
