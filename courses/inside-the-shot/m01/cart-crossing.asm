
cart-crossing:	file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000100000770 <_lab_step>:
100000770:     	sub	sp, sp, #0x20
100000774:     	str	x0, [sp, #0x18]
100000778:     	str	x1, [sp, #0x10]
10000077c:     	str	w2, [sp, #0xc]
100000780:     	ldr	x8, [sp, #0x18]
100000784:     	ldr	w8, [x8]
100000788:     	str	w8, [sp, #0x8]
10000078c:     	ldr	x8, [sp, #0x10]
100000790:     	ldr	w8, [x8]
100000794:     	ldr	w10, [sp, #0xc]
100000798:     	mov	w9, #0x2                ; =2
10000079c:     	mul	w9, w9, w10
1000007a0:     	add	w8, w8, w9
1000007a4:     	str	w8, [sp, #0x4]
1000007a8:     	ldr	w8, [sp, #0x4]
1000007ac:     	subs	w8, w8, #0x6
1000007b0:     	b.le	0x1000007c4 <_lab_step+0x54>
1000007b4:     	b	0x1000007b8 <_lab_step+0x48>
1000007b8:     	mov	w8, #0x6                ; =6
1000007bc:     	str	w8, [sp, #0x4]
1000007c0:     	b	0x1000007c4 <_lab_step+0x54>
1000007c4:     	ldr	w8, [sp, #0x4]
1000007c8:     	adds	w8, w8, #0x6
1000007cc:     	b.ge	0x1000007e0 <_lab_step+0x70>
1000007d0:     	b	0x1000007d4 <_lab_step+0x64>
1000007d4:     	mov	w8, #-0x6               ; =-6
1000007d8:     	str	w8, [sp, #0x4]
1000007dc:     	b	0x1000007e0 <_lab_step+0x70>
1000007e0:     	ldr	w8, [sp, #0x8]
1000007e4:     	ldr	w9, [sp, #0x4]
1000007e8:     	add	w8, w8, w9
1000007ec:     	str	w8, [sp]
1000007f0:     	ldr	w8, [sp, #0x8]
1000007f4:     	tbz	w8, #0x1f, 0x10000081c <_lab_step+0xac>
1000007f8:     	b	0x1000007fc <_lab_step+0x8c>
1000007fc:     	ldr	w8, [sp]
100000800:     	tbnz	w8, #0x1f, 0x10000081c <_lab_step+0xac>
100000804:     	b	0x100000808 <_lab_step+0x98>
100000808:     	ldr	x8, [sp, #0x18]
10000080c:     	str	wzr, [x8]
100000810:     	ldr	x8, [sp, #0x10]
100000814:     	str	wzr, [x8]
100000818:     	b	0x100000838 <_lab_step+0xc8>
10000081c:     	ldr	w8, [sp]
100000820:     	ldr	x9, [sp, #0x18]
100000824:     	str	w8, [x9]
100000828:     	ldr	w8, [sp, #0x4]
10000082c:     	ldr	x9, [sp, #0x10]
100000830:     	str	w8, [x9]
100000834:     	b	0x100000838 <_lab_step+0xc8>
100000838:     	add	sp, sp, #0x20
10000083c:     	ret
