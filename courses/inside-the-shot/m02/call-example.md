# One pointer, two stack frames

This separate temperature example shows how to trace a call. It does not use the parcel record or reveal its layout. Read the register vocabulary in section 4 of `START-HERE.md` first.

Memory at address **P** holds the integer **6**. `visit_cell` receives P in `x0`, then calls `warm_cell` with P in `x0` and the increment **1** in `w1`. `warm_cell` updates the integer through P and returns the updated value. P is a symbolic address, not the number 6.

These are actual instructions from the course's separately compiled demonstration. You do not need another executable. Addresses label instructions in this build; they are not the data address P.

## Follow the caller into the call

```asm
0000000100000494 <_visit_cell>:
100000494: sub sp, sp, #0x20
100000498: stp x29, x30, [sp, #0x10]
10000049c: add x29, sp, #0x10
1000004a0: str x0, [sp, #0x8]
1000004a4: ldr x0, [sp, #0x8]
1000004a8: mov w1, #0x1
1000004ac: bl 0x100000460 <_warm_cell>
1000004b0: ldp x29, x30, [sp, #0x10]
1000004b4: add sp, sp, #0x20
1000004b8: ret
```

The first instruction reserves 32 bytes (`0x20`) of stack storage. Call the resulting stack address **S**. The store at `1000004a0` copies P to memory at S + 8; it does not copy the integer 6 there. The following load restores that pointer to `x0`. `mov` puts 1 in `w1`. The call at `1000004ac` therefore passes a pointer and a number, not two numbers describing temperatures.

`bl` also records where execution should resume in `x30`: here, instruction `1000004b0`. The caller saved its own incoming `x30` before making that call. `stp` and `ldp` store and load a pair of registers; the saved `x29` supports this function's stack frame. For this trace, follow the pointer and argument first, while checking that the saved registers and stack are restored before returning.

## Follow the callee's separate storage

```asm
0000000100000460 <_warm_cell>:
100000460: sub sp, sp, #0x10
100000464: str x0, [sp, #0x8]
100000468: str w1, [sp, #0x4]
10000046c: ldr x8, [sp, #0x8]
100000470: ldr w8, [x8]
100000474: ldr w9, [sp, #0x4]
100000478: add w8, w8, w9
10000047c: ldr x9, [sp, #0x8]
100000480: str w8, [x9]
100000484: ldr x8, [sp, #0x8]
100000488: ldr w0, [x8]
10000048c: add sp, sp, #0x10
100000490: ret
```

The callee reserves another 16 bytes (`0x10`). Its stack pointer is now **T = S − 16**. Both functions use `[sp, #0x8]`, but the caller means S + 8 and the callee means T + 8. Those are different memory locations containing copies of the same P. Match addresses and values; matching offset text alone cannot connect two stack slots.

| Instruction | State after the instruction |
| --- | --- |
| `100000464`, `100000468` | Callee memory at T + 8 holds P; T + 4 holds the increment 1. Memory at P still holds 6. |
| `10000046c` | `x8` holds P, an address. |
| `100000470` | `w8` holds 6, loaded from P. Writing `w8` replaces the prior pointer in `x8`; do not keep treating that register as P. |
| `100000474`, `100000478` | `w9` holds 1; addition makes `w8` hold 7. Memory at P still holds 6 until the store. |
| `10000047c`, `100000480` | `x9` reloads P; the four-byte store changes memory at P to 7. The stack copy of P is unchanged. |
| `100000484`, `100000488` | `x8` reloads P; `w0` receives 7 from that address. |
| `10000048c`, `100000490` | The callee restores `sp` to S and returns to `1000004b0`, carrying 7 in `w0`. |
| `1000004b0` through `1000004b8` in the caller | The caller restores its saved registers and stack, then returns 7 in `w0`. It does not perform another temperature update. |

The demonstration prints `temperature=7 return=7`. A sound trace connects that output to the store and both returns. Simply listing `ldr`, `add` and `ret` would not explain which memory changed or what returned.

## Complete a different starting state

Now suppose memory at P starts at **4**, with the same call and increment. Before running the check below, write four missing trace entries in your notes: the contents of `x8` after `10000046c`, of `w8` after `100000478`, of memory at P after `100000480`, and of `w0` at each `ret`. Also explain why the caller and callee's `[sp, #0x8]` slots differ.

Save the notes before checking. The first entry is an address; the remaining entries are integer values. This Python model checks only the arithmetic and returned value, not your explanation of registers or stack frames:

```python
old, increment = 4, 1
updated = old + increment
print("stored:", updated, "callee return:", updated, "caller return:", updated)
```

If your numbers disagree, locate the addition and store again. If the numbers agree but your pointer or stack explanation is unclear, retrace S, T and P separately. Then return to section 4 of `START-HERE.md` and apply the same procedure to the parcel listing.
