# Original deterministic VM: frozen behavioral contract v1

Learner contract v1, adopted 2026-10-27. Implement the debugger behavior defined here over the supplied original VM. This course does not access native processes.

## VM

State is `{pc,tick,regs:{a,b,c,d},mem,output,halted}`. Initially pc=0, tick=0, all four registers and all eight memory cells are 0, output=[], halted=false. Registers hold JavaScript safe integers; overflow raises an execution error before state changes. Memory addresses are integer 0–7. Programs have 1–256 instructions. No clock, randomness, I/O inputs or external side effects.

Operands called `value` are a safe integer literal or one of the register names. Instructions:

- `{op:"set",reg:"a",value:3}` assigns an operand.
- `{op:"add",reg:"a",value:-1}` adds an operand.
- `{op:"load",reg:"b",address:0}` copies a memory cell into a register.
- `{op:"store",address:0,value:"a"}` writes an operand to a memory cell.
- `{op:"jnz",value:"a",target:2}` jumps if the operand is nonzero; target is an in-program instruction index.
- `{op:"emit",value:"a"}` appends the operand to output.
- `{op:"halt"}` sets halted=true.

Every executed instruction increments tick once. Normally pc advances by one; taken jnz replaces that next pc. Halt also advances pc and tick. Falling off a program without halt raises an error. A halted step is a no-op returning null.

## Debugger interface and boundaries

Construct `new Debugger(program)`. The program and returned observations are deep copies. `inspect()` returns the detached current state. `step()` bypasses breakpoints, executes one instruction and returns its event, or null if already halted.

`addBreakpoint({pc,condition?})` adds a breakpoint. Conditions are `{kind:"reg",name:"a",equals:2}` or `{kind:"mem",address:0,equals:2}`. `run(limit=1000)` checks breakpoints **before** execution, including at the current pc. A false condition does not stop. An immediate rerun at the same breakpoint stops again; step bypasses it. Explicit run limit is integer 1–10000 and counts only instructions executed by that call.

`watch(address)` stops **after** a store changes that watched cell. Same-value stores are events but do not stop. Stops are `{reason,tick,pc}` where reason is breakpoint, watchpoint, halt or limit. A watchpoint additionally has `write:{address,before,after}`. A run executing halt reports halt even if halt was the last budgeted instruction. Already halted run reports halt without execution. Watchpoint pc is the next instruction, and tick includes the store.

Events are `{tick,pc,op,writes,emitted}`. Event tick is the post-instruction tick; event pc is the executed instruction's pre-state pc. A store includes one `{address,before,after}` even for a same-value store. Only emit populates emitted. `trace()` returns detached events from the farthest recorded frontier in tick order. Seeking does not shrink that frontier; re-executing known ticks does not duplicate events.

## Replay, checkpoints and sessions

`checkpoint(nonemptyLabel)` stores an internal deep snapshot and returns `{label,tick,state}` detached from it. `seek(tick)` accepts integer 0 through recorded frontier inclusive, replays from an internal checkpoint or genesis, replaces current state and returns detached state. Seeking beyond recorded history is an error. A checkpoint is an observation, not a portable restore token. No external checkpoint/session import API exists.

`reverseFind(condition,beforeTick=currentTick)` searches strictly **earlier** ticks in descending order, including tick0. Valid explicit bound is 0 through frontier+1. It returns the nearest matching tick and positions the debugger there. With no match it returns null and preserves the state before the call. It uses the same condition forms as breakpoints.

Each debugger instance owns its program, trace and checkpoints. A new instance starts at genesis and cannot consume another instance's session. No persisted execution sessions, source replacement or branching external input are supported in v1. The supported interface cannot import an external session. Learner check receipts separately bind exact solution and assessment hashes and label changed source historical.

There is no dedicated reverse-last-write method. A debugger user can search the detached trace backwards for a write to an address and seek to the event tick minus one to inspect the cause. reverseFind is not an event/write search.

## Tiny supplied program for independent fixture design

This is original public input, with no answer trace:

```json
[
  {"op":"set","reg":"a","value":2},
  {"op":"store","address":3,"value":"a"},
  {"op":"add","reg":"a","value":-1},
  {"op":"jnz","value":"a","target":1},
  {"op":"emit","value":"a"},
  {"op":"halt"}
]
```

Use exact command sequences and observed states in your report. These requirements define the project, not a guarantee that finite checks prove correctness or learning.
