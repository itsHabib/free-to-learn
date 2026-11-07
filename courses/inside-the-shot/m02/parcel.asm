
parcel:	file format mach-o arm64

Disassembly of section __TEXT,__text:

00000001000007f0 <_initialize_parcel>:
1000007f0:     	sub	sp, sp, #0x20
1000007f4:     	str	x0, [sp, #0x18]
1000007f8:     	str	w1, [sp, #0x14]
1000007fc:     	str	w2, [sp, #0x10]
100000800:     	str	w3, [sp, #0xc]
100000804:     	ldr	w8, [sp, #0x14]
100000808:     	ldr	x9, [sp, #0x18]
10000080c:     	strb	w8, [x9]
100000810:     	ldr	w8, [sp, #0x10]
100000814:     	ldr	x9, [sp, #0x18]
100000818:     	strh	w8, [x9, #0x8]
10000081c:     	ldr	w8, [sp, #0xc]
100000820:     	ldr	x9, [sp, #0x18]
100000824:     	str	w8, [x9, #0x4]
100000828:     	add	sp, sp, #0x20
10000082c:     	ret

0000000100000830 <_adjust_credit>:
100000830:     	sub	sp, sp, #0x10
100000834:     	str	x0, [sp, #0x8]
100000838:     	str	w1, [sp, #0x4]
10000083c:     	ldr	x8, [sp, #0x8]
100000840:     	ldr	w8, [x8, #0x4]
100000844:     	ldr	w9, [sp, #0x4]
100000848:     	add	w8, w8, w9
10000084c:     	ldr	x9, [sp, #0x8]
100000850:     	str	w8, [x9, #0x4]
100000854:     	add	sp, sp, #0x10
100000858:     	ret

000000010000085c <_score_parcel>:
10000085c:     	sub	sp, sp, #0x10
100000860:     	str	x0, [sp, #0x8]
100000864:     	ldr	x8, [sp, #0x8]
100000868:     	ldr	w8, [x8, #0x4]
10000086c:     	ldr	x9, [sp, #0x8]
100000870:     	ldrh	w9, [x9, #0x8]
100000874:     	add	w0, w8, w9
100000878:     	add	sp, sp, #0x10
10000087c:     	ret

0000000100000880 <_process_parcel>:
100000880:     	sub	sp, sp, #0x20
100000884:     	stp	x29, x30, [sp, #0x10]
100000888:     	add	x29, sp, #0x10
10000088c:     	str	x0, [sp, #0x8]
100000890:     	str	w1, [sp, #0x4]
100000894:     	ldr	x0, [sp, #0x8]
100000898:     	ldr	w1, [sp, #0x4]
10000089c:     	bl	0x100000830 <_adjust_credit>
1000008a0:     	ldr	x0, [sp, #0x8]
1000008a4:     	bl	0x10000085c <_score_parcel>
1000008a8:     	ldp	x29, x30, [sp, #0x10]
1000008ac:     	add	sp, sp, #0x20
1000008b0:     	ret
