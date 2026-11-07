
parcel-shifted:	file format mach-o arm64

Disassembly of section __TEXT,__text:

00000001000007e4 <_initialize_parcel>:
1000007e4:     	sub	sp, sp, #0x20
1000007e8:     	str	x0, [sp, #0x18]
1000007ec:     	str	w1, [sp, #0x14]
1000007f0:     	str	w2, [sp, #0x10]
1000007f4:     	str	w3, [sp, #0xc]
1000007f8:     	ldr	w8, [sp, #0x14]
1000007fc:     	ldr	x9, [sp, #0x18]
100000800:     	strb	w8, [x9, #0x2]
100000804:     	ldr	w8, [sp, #0x10]
100000808:     	ldr	x9, [sp, #0x18]
10000080c:     	strh	w8, [x9]
100000810:     	ldr	w8, [sp, #0xc]
100000814:     	ldr	x9, [sp, #0x18]
100000818:     	str	w8, [x9, #0x4]
10000081c:     	add	sp, sp, #0x20
100000820:     	ret

0000000100000824 <_adjust_credit>:
100000824:     	sub	sp, sp, #0x10
100000828:     	str	x0, [sp, #0x8]
10000082c:     	str	w1, [sp, #0x4]
100000830:     	ldr	x8, [sp, #0x8]
100000834:     	ldr	w8, [x8, #0x4]
100000838:     	ldr	w9, [sp, #0x4]
10000083c:     	add	w8, w8, w9
100000840:     	ldr	x9, [sp, #0x8]
100000844:     	str	w8, [x9, #0x4]
100000848:     	add	sp, sp, #0x10
10000084c:     	ret

0000000100000850 <_score_parcel>:
100000850:     	sub	sp, sp, #0x10
100000854:     	str	x0, [sp, #0x8]
100000858:     	ldr	x8, [sp, #0x8]
10000085c:     	ldr	w8, [x8, #0x4]
100000860:     	ldr	x9, [sp, #0x8]
100000864:     	ldrh	w9, [x9]
100000868:     	add	w0, w8, w9
10000086c:     	add	sp, sp, #0x10
100000870:     	ret

0000000100000874 <_process_parcel>:
100000874:     	sub	sp, sp, #0x20
100000878:     	stp	x29, x30, [sp, #0x10]
10000087c:     	add	x29, sp, #0x10
100000880:     	str	x0, [sp, #0x8]
100000884:     	str	w1, [sp, #0x4]
100000888:     	ldr	x0, [sp, #0x8]
10000088c:     	ldr	w1, [sp, #0x4]
100000890:     	bl	0x100000824 <_adjust_credit>
100000894:     	ldr	x0, [sp, #0x8]
100000898:     	bl	0x100000850 <_score_parcel>
10000089c:     	ldp	x29, x30, [sp, #0x10]
1000008a0:     	add	sp, sp, #0x20
1000008a4:     	ret
