
fee-O0:	file format mach-o arm64

Disassembly of section __TEXT,__text:

000000010000053c <_fee_example>:
10000053c:     	sub	sp, sp, #0x10
100000540:     	str	w0, [sp, #0xc]
100000544:     	str	w1, [sp, #0x8]
100000548:     	ldr	w8, [sp, #0xc]
10000054c:     	add	w8, w8, #0x4
100000550:     	str	w8, [sp, #0x4]
100000554:     	ldr	w8, [sp, #0x8]
100000558:     	cbz	w8, 0x100000570 <_fee_example+0x34>
10000055c:     	b	0x100000560 <_fee_example+0x24>
100000560:     	ldr	w8, [sp, #0x4]
100000564:     	add	w8, w8, #0x3
100000568:     	str	w8, [sp, #0x4]
10000056c:     	b	0x100000570 <_fee_example+0x34>
100000570:     	ldr	w0, [sp, #0x4]
100000574:     	add	sp, sp, #0x10
100000578:     	ret
