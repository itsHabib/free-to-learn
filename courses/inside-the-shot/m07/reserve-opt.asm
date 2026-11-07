
reserve-opt:	file format mach-o arm64

Disassembly of section __TEXT,__text:

00000001000007b8 <_decode_record>:
1000007b8:     	ldr	w0, [x0]
1000007bc:     	ret

00000001000007c0 <_apply_record>:
1000007c0:     	lsr	x12, x1, #16
1000007c4:     	and	w8, w1, #0xff
1000007c8:     	cmp	w8, #0x4
1000007cc:     	b.ne	0x10000081c <_apply_record+0x5c>
1000007d0:     	mov	w8, #0x0                ; =0
1000007d4:     	tst	x1, #0xff00
1000007d8:     	b.ne	0x100000814 <_apply_record+0x54>
1000007dc:     	and	w9, w12, #0xffff
1000007e0:     	cbz	w9, 0x100000814 <_apply_record+0x54>
1000007e4:     	ldr	q0, [x0]
1000007e8:     	ldr	w10, [x0, #0x10]
1000007ec:     	addv.4s	s0, v0
1000007f0:     	fmov	w11, s0
1000007f4:     	add	w10, w11, w10
1000007f8:     	add	w10, w10, w9
1000007fc:     	cmp	w10, #0x40
100000800:     	b.hi	0x100000814 <_apply_record+0x54>
100000804:     	ldr	w8, [x0]
100000808:     	add	w8, w8, w9
10000080c:     	str	w8, [x0]
100000810:     	mov	w8, #0x1                ; =1
100000814:     	mov	x0, x8
100000818:     	ret
10000081c:     	ubfx	w10, w1, #8, #8
100000820:     	sub	w9, w10, #0x5
100000824:     	cmn	w9, #0x4
100000828:     	b.hs	0x100000834 <_apply_record+0x74>
10000082c:     	mov	w0, #0x0                ; =0
100000830:     	ret
100000834:     	add	x9, x0, #0x4
100000838:     	sub	w10, w10, #0x1
10000083c:     	ldr	w11, [x9, w10, uxtw #2]
100000840:     	cmp	w8, #0x1
100000844:     	b.ne	0x100000870 <_apply_record+0xb0>
100000848:     	mov	w8, #0x0                ; =0
10000084c:     	ands	w12, w12, #0xffff
100000850:     	b.eq	0x100000814 <_apply_record+0x54>
100000854:     	cbnz	w11, 0x100000814 <_apply_record+0x54>
100000858:     	ldr	w8, [x0]
10000085c:     	subs	w8, w8, w12
100000860:     	b.lo	0x10000082c <_apply_record+0x6c>
100000864:     	str	w8, [x0]
100000868:     	str	w12, [x9, w10, uxtw #2]
10000086c:     	b	0x100000810 <_apply_record+0x50>
100000870:     	mov	w8, #0x0                ; =0
100000874:     	tst	x1, #0xffff0000
100000878:     	b.ne	0x100000814 <_apply_record+0x54>
10000087c:     	cbz	w11, 0x100000814 <_apply_record+0x54>
100000880:     	and	w8, w1, #0xff
100000884:     	cmp	w8, #0x3
100000888:     	b.eq	0x1000008a4 <_apply_record+0xe4>
10000088c:     	cmp	w8, #0x2
100000890:     	b.ne	0x10000082c <_apply_record+0x6c>
100000894:     	ldr	w8, [x0, #0x14]
100000898:     	add	w8, w8, w11
10000089c:     	str	w8, [x0, #0x14]
1000008a0:     	b	0x1000008b0 <_apply_record+0xf0>
1000008a4:     	ldr	w8, [x0]
1000008a8:     	add	w8, w8, w11
1000008ac:     	str	w8, [x0]
1000008b0:     	str	wzr, [x9, w10, uxtw #2]
1000008b4:     	b	0x100000810 <_apply_record+0x50>

00000001000008b8 <_replay>:
1000008b8:     	sub	sp, sp, #0x70
1000008bc:     	stp	x26, x25, [sp, #0x20]
1000008c0:     	stp	x24, x23, [sp, #0x30]
1000008c4:     	stp	x22, x21, [sp, #0x40]
1000008c8:     	stp	x20, x19, [sp, #0x50]
1000008cc:     	stp	x29, x30, [sp, #0x60]
1000008d0:     	add	x29, sp, #0x60
1000008d4:     	mov	x19, x0
1000008d8:     	ldr	q0, [x0]
1000008dc:     	str	q0, [sp]
1000008e0:     	ldr	x8, [x0, #0x10]
1000008e4:     	str	x8, [sp, #0x10]
1000008e8:     	cbz	w2, 0x100000964 <_replay+0xac>
1000008ec:     	mov	x20, x3
1000008f0:     	mov	x21, x1
1000008f4:     	mov	x23, #0x0               ; =0
1000008f8:     	add	x25, x4, #0x4
1000008fc:     	ubfiz	x26, x2, #2, #32
100000900:     	mov	w24, #0x1               ; =1
100000904:     	and	x8, x23, #0xfffffffc
100000908:     	add	x0, x21, x8
10000090c:     	bl	0x1000007b8 <_decode_record>
100000910:     	mov	w8, w0
100000914:     	and	x9, x22, #0xffffffff00000000
100000918:     	orr	x22, x9, x8
10000091c:     	mov	x0, sp
100000920:     	mov	x1, x22
100000924:     	bl	0x1000007c0 <_apply_record>
100000928:     	stur	w0, [x25, #-0x4]
10000092c:     	ldr	q0, [sp]
100000930:     	str	q0, [x25]
100000934:     	ldr	x8, [sp, #0x10]
100000938:     	str	x8, [x25, #0x10]
10000093c:     	cmp	w0, #0x0
100000940:     	csel	w24, wzr, w24, eq
100000944:     	add	x23, x23, #0x4
100000948:     	add	x25, x25, #0x1c
10000094c:     	cmp	x26, x23
100000950:     	b.ne	0x100000904 <_replay+0x4c>
100000954:     	cbz	w20, 0x100000964 <_replay+0xac>
100000958:     	cbnz	w24, 0x100000964 <_replay+0xac>
10000095c:     	mov	w0, #0x0                ; =0
100000960:     	b	0x100000978 <_replay+0xc0>
100000964:     	ldr	q0, [sp]
100000968:     	str	q0, [x19]
10000096c:     	ldr	x8, [sp, #0x10]
100000970:     	str	x8, [x19, #0x10]
100000974:     	mov	w0, #0x1                ; =1
100000978:     	ldp	x29, x30, [sp, #0x60]
10000097c:     	ldp	x20, x19, [sp, #0x50]
100000980:     	ldp	x22, x21, [sp, #0x40]
100000984:     	ldp	x24, x23, [sp, #0x30]
100000988:     	ldp	x26, x25, [sp, #0x20]
10000098c:     	add	sp, sp, #0x70
100000990:     	ret
