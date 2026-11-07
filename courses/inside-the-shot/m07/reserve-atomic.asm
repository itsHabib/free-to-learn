
reserve-atomic:	file format mach-o arm64

Disassembly of section __TEXT,__text:

0000000100000964 <_decode_record>:
100000964:     	sub	sp, sp, #0x10
100000968:     	str	x0, [sp]
10000096c:     	ldr	x8, [sp]
100000970:     	ldrb	w8, [x8]
100000974:     	strb	w8, [sp, #0xc]
100000978:     	ldr	x8, [sp]
10000097c:     	ldrb	w8, [x8, #0x1]
100000980:     	strb	w8, [sp, #0xd]
100000984:     	ldr	x8, [sp]
100000988:     	ldrb	w8, [x8, #0x2]
10000098c:     	ldr	x9, [sp]
100000990:     	ldrb	w9, [x9, #0x3]
100000994:     	orr	w8, w8, w9, lsl #8
100000998:     	strh	w8, [sp, #0xe]
10000099c:     	ldr	w0, [sp, #0xc]
1000009a0:     	add	sp, sp, #0x10
1000009a4:     	ret

00000001000009a8 <_apply_record>:
1000009a8:     	sub	sp, sp, #0x20
1000009ac:     	mov	x8, x1
1000009b0:     	str	w8, [sp, #0x18]
1000009b4:     	str	x0, [sp, #0x10]
1000009b8:     	ldrb	w8, [sp, #0x18]
1000009bc:     	subs	w8, w8, #0x4
1000009c0:     	b.ne	0x100000a74 <_apply_record+0xcc>
1000009c4:     	b	0x1000009c8 <_apply_record+0x20>
1000009c8:     	ldr	x8, [sp, #0x10]
1000009cc:     	ldr	w8, [x8]
1000009d0:     	str	w8, [sp, #0xc]
1000009d4:     	str	wzr, [sp, #0x8]
1000009d8:     	b	0x1000009dc <_apply_record+0x34>
1000009dc:     	ldr	w8, [sp, #0x8]
1000009e0:     	subs	w8, w8, #0x4
1000009e4:     	b.hs	0x100000a1c <_apply_record+0x74>
1000009e8:     	b	0x1000009ec <_apply_record+0x44>
1000009ec:     	ldr	x8, [sp, #0x10]
1000009f0:     	add	x8, x8, #0x4
1000009f4:     	ldr	w9, [sp, #0x8]
1000009f8:     	ldr	w9, [x8, x9, lsl #2]
1000009fc:     	ldr	w8, [sp, #0xc]
100000a00:     	add	w8, w8, w9
100000a04:     	str	w8, [sp, #0xc]
100000a08:     	b	0x100000a0c <_apply_record+0x64>
100000a0c:     	ldr	w8, [sp, #0x8]
100000a10:     	add	w8, w8, #0x1
100000a14:     	str	w8, [sp, #0x8]
100000a18:     	b	0x1000009dc <_apply_record+0x34>
100000a1c:     	ldrb	w8, [sp, #0x19]
100000a20:     	cbnz	w8, 0x100000a4c <_apply_record+0xa4>
100000a24:     	b	0x100000a28 <_apply_record+0x80>
100000a28:     	ldrh	w8, [sp, #0x1a]
100000a2c:     	cbz	w8, 0x100000a4c <_apply_record+0xa4>
100000a30:     	b	0x100000a34 <_apply_record+0x8c>
100000a34:     	ldr	w8, [sp, #0xc]
100000a38:     	ldrh	w9, [sp, #0x1a]
100000a3c:     	add	w8, w8, w9
100000a40:     	subs	w8, w8, #0x40
100000a44:     	b.ls	0x100000a54 <_apply_record+0xac>
100000a48:     	b	0x100000a4c <_apply_record+0xa4>
100000a4c:     	str	wzr, [sp, #0x1c]
100000a50:     	b	0x100000bc8 <_apply_record+0x220>
100000a54:     	ldrh	w10, [sp, #0x1a]
100000a58:     	ldr	x9, [sp, #0x10]
100000a5c:     	ldr	w8, [x9]
100000a60:     	add	w8, w8, w10
100000a64:     	str	w8, [x9]
100000a68:     	mov	w8, #0x1                ; =1
100000a6c:     	str	w8, [sp, #0x1c]
100000a70:     	b	0x100000bc8 <_apply_record+0x220>
100000a74:     	ldrb	w8, [sp, #0x19]
100000a78:     	subs	w8, w8, #0x1
100000a7c:     	b.lt	0x100000a94 <_apply_record+0xec>
100000a80:     	b	0x100000a84 <_apply_record+0xdc>
100000a84:     	ldrb	w8, [sp, #0x19]
100000a88:     	subs	w8, w8, #0x4
100000a8c:     	b.le	0x100000a9c <_apply_record+0xf4>
100000a90:     	b	0x100000a94 <_apply_record+0xec>
100000a94:     	str	wzr, [sp, #0x1c]
100000a98:     	b	0x100000bc8 <_apply_record+0x220>
100000a9c:     	ldr	x8, [sp, #0x10]
100000aa0:     	add	x8, x8, #0x4
100000aa4:     	ldrb	w9, [sp, #0x19]
100000aa8:     	subs	w9, w9, #0x1
100000aac:     	add	x8, x8, w9, sxtw #2
100000ab0:     	str	x8, [sp]
100000ab4:     	ldrb	w8, [sp, #0x18]
100000ab8:     	subs	w8, w8, #0x1
100000abc:     	b.ne	0x100000b2c <_apply_record+0x184>
100000ac0:     	b	0x100000ac4 <_apply_record+0x11c>
100000ac4:     	ldr	x8, [sp]
100000ac8:     	ldr	w8, [x8]
100000acc:     	cbnz	w8, 0x100000af8 <_apply_record+0x150>
100000ad0:     	b	0x100000ad4 <_apply_record+0x12c>
100000ad4:     	ldrh	w8, [sp, #0x1a]
100000ad8:     	cbz	w8, 0x100000af8 <_apply_record+0x150>
100000adc:     	b	0x100000ae0 <_apply_record+0x138>
100000ae0:     	ldrh	w8, [sp, #0x1a]
100000ae4:     	ldr	x9, [sp, #0x10]
100000ae8:     	ldr	w9, [x9]
100000aec:     	subs	w8, w8, w9
100000af0:     	b.ls	0x100000b00 <_apply_record+0x158>
100000af4:     	b	0x100000af8 <_apply_record+0x150>
100000af8:     	str	wzr, [sp, #0x1c]
100000afc:     	b	0x100000bc8 <_apply_record+0x220>
100000b00:     	ldrh	w10, [sp, #0x1a]
100000b04:     	ldr	x9, [sp, #0x10]
100000b08:     	ldr	w8, [x9]
100000b0c:     	subs	w8, w8, w10
100000b10:     	str	w8, [x9]
100000b14:     	ldrh	w8, [sp, #0x1a]
100000b18:     	ldr	x9, [sp]
100000b1c:     	str	w8, [x9]
100000b20:     	mov	w8, #0x1                ; =1
100000b24:     	str	w8, [sp, #0x1c]
100000b28:     	b	0x100000bc8 <_apply_record+0x220>
100000b2c:     	ldr	x8, [sp]
100000b30:     	ldr	w8, [x8]
100000b34:     	cbz	w8, 0x100000b48 <_apply_record+0x1a0>
100000b38:     	b	0x100000b3c <_apply_record+0x194>
100000b3c:     	ldrh	w8, [sp, #0x1a]
100000b40:     	cbz	w8, 0x100000b50 <_apply_record+0x1a8>
100000b44:     	b	0x100000b48 <_apply_record+0x1a0>
100000b48:     	str	wzr, [sp, #0x1c]
100000b4c:     	b	0x100000bc8 <_apply_record+0x220>
100000b50:     	ldrb	w8, [sp, #0x18]
100000b54:     	subs	w8, w8, #0x2
100000b58:     	b.ne	0x100000b7c <_apply_record+0x1d4>
100000b5c:     	b	0x100000b60 <_apply_record+0x1b8>
100000b60:     	ldr	x8, [sp]
100000b64:     	ldr	w10, [x8]
100000b68:     	ldr	x9, [sp, #0x10]
100000b6c:     	ldr	w8, [x9, #0x14]
100000b70:     	add	w8, w8, w10
100000b74:     	str	w8, [x9, #0x14]
100000b78:     	b	0x100000bb4 <_apply_record+0x20c>
100000b7c:     	ldrb	w8, [sp, #0x18]
100000b80:     	subs	w8, w8, #0x3
100000b84:     	b.ne	0x100000ba8 <_apply_record+0x200>
100000b88:     	b	0x100000b8c <_apply_record+0x1e4>
100000b8c:     	ldr	x8, [sp]
100000b90:     	ldr	w10, [x8]
100000b94:     	ldr	x9, [sp, #0x10]
100000b98:     	ldr	w8, [x9]
100000b9c:     	add	w8, w8, w10
100000ba0:     	str	w8, [x9]
100000ba4:     	b	0x100000bb0 <_apply_record+0x208>
100000ba8:     	str	wzr, [sp, #0x1c]
100000bac:     	b	0x100000bc8 <_apply_record+0x220>
100000bb0:     	b	0x100000bb4 <_apply_record+0x20c>
100000bb4:     	ldr	x8, [sp]
100000bb8:     	str	wzr, [x8]
100000bbc:     	mov	w8, #0x1                ; =1
100000bc0:     	str	w8, [sp, #0x1c]
100000bc4:     	b	0x100000bc8 <_apply_record+0x220>
100000bc8:     	ldr	w0, [sp, #0x1c]
100000bcc:     	add	sp, sp, #0x20
100000bd0:     	ret

0000000100000bd4 <_replay>:
100000bd4:     	sub	sp, sp, #0x70
100000bd8:     	stp	x29, x30, [sp, #0x60]
100000bdc:     	add	x29, sp, #0x60
100000be0:     	stur	x0, [x29, #-0x8]
100000be4:     	stur	x1, [x29, #-0x10]
100000be8:     	stur	w2, [x29, #-0x14]
100000bec:     	stur	w3, [x29, #-0x18]
100000bf0:     	stur	x4, [x29, #-0x20]
100000bf4:     	ldur	x8, [x29, #-0x8]
100000bf8:     	ldr	q0, [x8]
100000bfc:     	str	q0, [sp, #0x20]
100000c00:     	ldr	x8, [x8, #0x10]
100000c04:     	str	x8, [sp, #0x30]
100000c08:     	mov	w8, #0x1                ; =1
100000c0c:     	str	w8, [sp, #0x1c]
100000c10:     	str	wzr, [sp, #0x18]
100000c14:     	b	0x100000c18 <_replay+0x44>
100000c18:     	ldr	w8, [sp, #0x18]
100000c1c:     	ldur	w9, [x29, #-0x14]
100000c20:     	subs	w8, w8, w9
100000c24:     	b.hs	0x100000ccc <_replay+0xf8>
100000c28:     	b	0x100000c2c <_replay+0x58>
100000c2c:     	ldur	x8, [x29, #-0x10]
100000c30:     	ldr	w10, [sp, #0x18]
100000c34:     	mov	w9, #0x4                ; =4
100000c38:     	mul	w9, w9, w10
100000c3c:     	mov	w9, w9
100000c40:     	add	x0, x8, x9
100000c44:     	bl	0x100000964 <_decode_record>
100000c48:     	str	w0, [sp, #0x14]
100000c4c:     	ldr	w8, [sp, #0x14]
100000c50:     	str	w8, [sp, #0x8]
100000c54:     	ldr	x1, [sp, #0x8]
100000c58:     	add	x0, sp, #0x20
100000c5c:     	bl	0x1000009a8 <_apply_record>
100000c60:     	ldur	x8, [x29, #-0x20]
100000c64:     	ldr	w9, [sp, #0x18]
100000c68:     	mov	x10, #0x1c              ; =28
100000c6c:     	mov	x11, x10
100000c70:     	umull	x9, w9, w11
100000c74:     	str	w0, [x8, x9]
100000c78:     	ldur	x11, [x29, #-0x20]
100000c7c:     	ldr	w8, [sp, #0x18]
100000c80:     	mov	x9, x10
100000c84:     	umaddl	x9, w8, w9, x11
100000c88:     	ldr	q0, [sp, #0x20]
100000c8c:     	stur	q0, [x9, #0x4]
100000c90:     	ldr	x8, [sp, #0x30]
100000c94:     	stur	x8, [x9, #0x14]
100000c98:     	ldur	x8, [x29, #-0x20]
100000c9c:     	ldr	w9, [sp, #0x18]
100000ca0:     	umull	x9, w9, w10
100000ca4:     	ldr	w8, [x8, x9]
100000ca8:     	cbnz	w8, 0x100000cb8 <_replay+0xe4>
100000cac:     	b	0x100000cb0 <_replay+0xdc>
100000cb0:     	str	wzr, [sp, #0x1c]
100000cb4:     	b	0x100000cb8 <_replay+0xe4>
100000cb8:     	b	0x100000cbc <_replay+0xe8>
100000cbc:     	ldr	w8, [sp, #0x18]
100000cc0:     	add	w8, w8, #0x1
100000cc4:     	str	w8, [sp, #0x18]
100000cc8:     	b	0x100000c18 <_replay+0x44>
100000ccc:     	ldur	w8, [x29, #-0x18]
100000cd0:     	cbz	w8, 0x100000ce4 <_replay+0x110>
100000cd4:     	b	0x100000cd8 <_replay+0x104>
100000cd8:     	ldr	w8, [sp, #0x1c]
100000cdc:     	cbz	w8, 0x100000cfc <_replay+0x128>
100000ce0:     	b	0x100000ce4 <_replay+0x110>
100000ce4:     	ldur	x9, [x29, #-0x8]
100000ce8:     	ldr	q0, [sp, #0x20]
100000cec:     	str	q0, [x9]
100000cf0:     	ldr	x8, [sp, #0x30]
100000cf4:     	str	x8, [x9, #0x10]
100000cf8:     	b	0x100000cfc <_replay+0x128>
100000cfc:     	ldur	w8, [x29, #-0x18]
100000d00:     	mov	w9, #0x1                ; =1
100000d04:     	str	w9, [sp, #0x4]
100000d08:     	cbz	w8, 0x100000d24 <_replay+0x150>
100000d0c:     	b	0x100000d10 <_replay+0x13c>
100000d10:     	ldr	w8, [sp, #0x1c]
100000d14:     	subs	w8, w8, #0x0
100000d18:     	cset	w8, ne
100000d1c:     	str	w8, [sp, #0x4]
100000d20:     	b	0x100000d24 <_replay+0x150>
100000d24:     	ldr	w8, [sp, #0x4]
100000d28:     	and	w0, w8, #0x1
100000d2c:     	ldp	x29, x30, [sp, #0x60]
100000d30:     	add	sp, sp, #0x70
100000d34:     	ret
