# Part two: API

Every function you write, with its inputs and outputs. The course supplies the
files under `public/`, the program listings under `programs/` and the game
files under `targets/`. You write the files under "Your files". Each starter
function throws an error containing "not written yet" until you write it.

## Words used here

- An **instruction** is one entry of a function's `code` in a program listing.
- **at** is an instruction's index in its function's `code`, counted from 0.
  An instruction is named by its function index and its `at`: `(8, 112)`.
  This is part one's `pc`, one per function.
- A **tick** is one instruction executed, as in part one. A **position** is a
  moment between instructions: position `t` is the state after `t`
  instructions, so a tick number also names a position (tick 96,568 is the
  moment just after instruction 96,568). The instruction executed next is
  instruction number `t + 1`, and its event says `tick: t + 1`.
- A **call** is one call into the game from outside: `game_init`,
  `game_key`, `game_tick` or one of the getters such as `r_px`. A **game
  frame** is one call to `game_tick`, 1/60 of a second of game time. A bare
  **frame** is always a call frame: one function call in progress, an entry
  of `state.frames`.
- The game shows three pieces of text, each read from memory through a
  getter: the **status line** (`r_line_ptr`: angle, power, wind and score),
  the **message line** (`r_msg_ptr`: ROUND 1, HIT!, SHORT BY 10) and the
  **help text** (`r_help_ptr`). Lob II keeps the same three texts in memory,
  but its eight getters, `g0` to `g7`, are named so they don't say what they
  hold, and none of them returns its help text's address.
- A **run** is the calls of one recording, one after another, on one machine.
- A **write** is the bytes one store instruction changed or rewrote:
  `{ address, size, before, after }`, where `before` and `after` are arrays of
  `size` byte values.
- **Memory** is the game's linear memory, a `Uint8Array` of 131072 bytes
  (two WebAssembly pages of 64 KiB; your debugger's snapshot pages in lesson
  10 are its own, smaller choice). An **address** is an index into it.

## Supplied by the course

### programs/NAME.json and public/program.mjs

A program listing is the `.wasm` file decoded into JSON when the course was
built:

```js
{ format: 'ttd2-program-1', name, sha256,
  types: [{ params, results }],      // type names: 'i32', 'i64', 'f32', 'f64'
  imports: [{ module, name, type }], // functions only; they take indexes 0, 1, ...
  functions: [{ index, type, locals, code, offsets }],
  exports: [{ name, kind, index }],  // kind 'func' or 'memory'
  globals: [{ type, mutable, init }],
  memory: { min, max },              // in 64 KiB pages
  data: [{ offset, bytes }],         // bytes as hex text in the file
  codeSectionStart }
```

`code` holds one array per instruction, its name first and its immediates
after it: `['i32.const', 5]`, `['local.get', 2]`, `['call', 6]`,
`['br_if', 1]`, `['block', null]` (null: the block leaves no value),
`['f32.store', 2, 20]` (alignment, then offset). `offsets[k]` is the file
offset of instruction `k`'s first byte in the `.wasm` file. `locals` lists
the types of the function's locals after its parameters.

`loadProgram(json)` turns a listing into the object your machine receives. It
adds `program.func(index)`, `program.typeOf(index)` and
`program.exportIndex(name)`, turns `"42n"` constants into BigInts and data
hex into `Uint8Array`s. `readProgram('lob')` reads and loads
`programs/lob.json`.

### public/world.mjs

`makeWorld(seed)` returns `{ imports, answered }`. `imports` has the four
functions the games import: `sin(x)`, `cos(x)`, `server_round(round)` and
`server_wind()`. The two server functions answer from a seed the game never
sees, and their answers change from call to call.

### public/hash.mjs

`hashMemory(memory)` is the SHA-256 of the memory bytes as hex text. Every
recording, check and lab command uses it.

### public/sessions.mjs

`session({ seed, mode, shots, ... })` returns a list of calls,
`[{ name, args }]`, that plays a game: `game_init(seed, mode)`, then key
presses and frames. Key codes: 1 left, 2 right, 3 up, 4 down, 5 space (fire),
6 N (new round).

`mode` adds up the game's defences, tricks a real game uses: 1 asks the
server for the wind (`server_wind`), so its exact value never enters memory;
2 moves the game's state to a new address at every new round after the
first, and changes the pointer to it; 4 stores angle, power, wind and flag
combined with a key that changes every round (XOR in Lob, addition in
Lob II); 8, in Lob only, slides the flag along the ground. Mode 0 has none.

## Your files

### machine.mjs (lesson 08)

```js
export class Machine {
  constructor(program, imports)
  state                 // everything the machine knows, one plain object
  running               // true while a call is unfinished
  begin(name, args)     // start a call to an export; runs nothing yet
  step()                // run one instruction; returns its event
  invoke(name, args)    // begin, then step until the call returns; returns its result
}
```

- `program` is a listing (as JSON or as `loadProgram` returns it).
  `imports` has one function per import name.
- At the start, memory is `memory.min * 65536` zero bytes with each data
  segment copied in at its offset, and each global holds its `init`.
- `state` must hold, at least: `memory` (a `Uint8Array`), `globals` (an
  array), `frames` (one entry per function call in progress, outermost first,
  each with `func` and `at`: the function and the `at` of the next
  instruction it will run), `tick` (instructions run so far) and `calls`
  (calls begun so far). Anything else your machine needs goes in `state`
  too.
- `structuredClone(machine.state)` must work, and after
  `machine.state = copy` the machine must carry on from the copied moment
  exactly. Lessons 09 to 13 rely on this.
- `step()` returns `{ tick, func, at, op, writes }`: the tick of this
  instruction, which instruction it was, its name, and the writes it made
  (`[]` for most instructions; one write for a store). Every instruction the
  machine runs is one tick, `block`, `loop`, `br` and `end` included; a branch
  runs no instruction on its way to its target. A branch to a `loop` goes to
  the instruction after the `loop`, which doesn't run again, so the branch's
  own tick is the only one.
- `invoke` returns a number for `i32` and `f32` results, `undefined` when the
  function returns nothing. An `f32` value is a JavaScript number rounded with
  `Math.fround`. An `i32` value is signed, as Node's engine returns it, so the
  bits of 4,294,967,295 come back as -1.
- A trap (division by zero, an access outside memory) throws an `Error` whose
  message starts with `trap:`. A load or store that traps reads or writes
  nothing (check `08.memory` looks at memory afterwards). The checks start a
  new machine after a trap, so the rest of what it leaves in `state` (stack,
  frames, tick) is up to you.
- Every instruction your machine runs goes through `step()`. The checks count
  calls to `step()` to measure replay costs.

### recorder.mjs (lesson 09)

```js
export function record(program, imports, calls)          // returns a recording
export function replay(program, recording, { check })    // returns { machine, results, hashes }
export function firstDivergence(program, original, tampered)  // returns a tick or null
```

A recording is plain JSON:

```js
{ format: 'ttd2-recording-1', program, sha256,
  calls:   [{ name, args }],          // every call into the game, in order
  results: [value or null],           // what each call returned
  answers: [{ name, args, result }],  // every import call the game made, in order
  hashes:  [hex] }                    // hashMemory after each call
```

- `program` is the listing's `name` (`lob`, `lob2`, `ladder/1`), which
  `debug.mjs` uses to find `programs/NAME.json`, and `sha256` is the listing's
  `sha256`.
- `result` in an answer is what the import function returned, before your
  machine converts it to the import's type. The course's worlds return values
  that already have that type.
- A recording holds only finite numbers, as JSON does, and the checks compare
  its answers with -0 and 0 counted as one number. The world's answers are
  always finite.
- `record` runs the calls on a new machine whose imports are the given ones,
  keeping every answer they return.
- `replay` runs the recording's calls on a new machine and answers each import
  call from `answers`, in order, without any world. If the game's next import
  call does not match the next entry of `answers` (another import, or other
  arguments), `replay` throws an error with a `divergence` field
  `{ tick, call, reason }`. Its tick is the number of instructions the machine
  had finished before the call instruction that asked; that instruction's own
  event would have `tick + 1`. With `check: true` (the default) a call whose result or memory hash
  differs from the recording also throws, with the tick at which that call
  returned.
- `firstDivergence` returns the smallest tick after which the tampered
  recording's replay has different memory from the original's, or `null`
  when the two never differ, even if an answer or a call was changed (a key
  the game ignores, an answer changed to the value it had). The tick is
  counted in the tampered replay. `tampered` is a copy of `original` with some
  answers or calls changed; its `hashes` are the original's. The checks'
  tampers change memory in a way that lasts at least to the end of the call
  where it starts, so comparing hashes at the ends of calls and then
  bisecting inside the first call that ends differently finds their ticks.
  The checks count the instructions it runs. If, before memory differs, the
  tampered replay asks for an import its recording can't answer, the checks
  don't test the result. The course's worked solution then counts memory as
  different from the call instruction that asked, and returns that
  instruction's tick.

### debugger.mjs (lessons 10 and 12)

```js
export class Debugger {
  constructor(program, recording, options)
  tick                  // the current position
  end                   // the position after the run's last instruction
  seek(tick)            // move there; returns the new position
  step(n = 1)           // forward n instructions, stopping at end
  stepBack(n = 1)       // back n instructions, stopping at 0
  read(address, size)   // the memory bytes at the current position, a Uint8Array
  state()               // a structuredClone of the machine's whole state at the current position
  where()               // { tick, call, func, at }: what runs next
  continue(stops)       // forward to the next stop: { reason, tick }
  continueBack(stops)   // backward to the previous stop: { reason, tick }
  lastWrite(address)    // the last write to that byte at or before here, or null
  stack()               // lesson 12: [{ func, at }], outermost first
  stepOut()             // lesson 12: forward until the current function has returned
  snapshots             // [{ tick, pages }], see below
}
// stops = { breakpoints: [{ func, at }], watches: [{ address, size }], functions: [index] }
```

- The debugger replays `recording` with the program; it never needs a world.
- A new `Debugger` stands at position 0. `seek`, `step`, `stepBack` and
  `stepOut` return the new position. The course's worked solution throws a
  `RangeError` when `seek` is given a position outside 0 to `end`, and the
  checks never ask for one.
- The **next instruction** at position `t` is the one the run executes as
  instruction number `t + 1`. Between two calls it is the first instruction
  of the next call. `where()` names it: `{ tick, call, func, at }`, where
  `tick` is the current position `t` and `call` is the index in
  `recording.calls` of the call the next instruction belongs to. At
  `end`, `func` and `at` are `null` and `call` is `recording.calls.length`.
- Between calls no function is running: `stack()` is `[]` and `state()` is
  the machine with no frames, before the next call has begun.
- A **breakpoint** `{ func, at }` stops at a position whose next instruction is
  that one. A **function stop** (lesson 12) stops where a call to that function
  begins: the next instruction is `(func, 0)`.
- A **watch** `{ address, size }` stops right after an instruction that wrote
  at least one byte in `[address, address + size)` and changed it.
- `continue` and `continueBack` always move: they look at positions strictly
  after, or strictly before, the current one, and stop at the nearest match.
  With no match they stop at `end` (`reason: 'end'`) or at 0
  (`reason: 'start'`). Otherwise `reason` is `'breakpoint'`, `'watchpoint'`
  or `'function'`. (Part one's `run` stopped without moving when it stood on
  a breakpoint; `continue` does not.)
- Position 0 can hold a stop too. A breakpoint or a function stop on the run's
  first instruction fires there, and `continueBack` reports it rather than
  `'start'`. No watch fires at 0, because no instruction comes before it.
- When several stops fire at one position, the checks accept any of their
  reasons. The worked solution reports `'watchpoint'` first, then
  `'breakpoint'`, then `'function'`.
- `lastWrite(address)` returns `{ tick, func, at, address, size }` for the
  instruction with the greatest tick at or before the current position that
  wrote the byte at `address`, whether or not the value changed. `address` in
  the result is where that write starts. The method does not move the
  debugger; the `last-write` and `who` commands of `debug.mjs` then move to
  the write's tick, so `answer` can name it.
- **Snapshots.** `snapshots` lists the snapshots the debugger has kept, in
  order of `tick`. `pages` is an array of `Uint8Array`s whose concatenation
  is the memory at that tick. A page no instruction wrote since the previous
  snapshot must be the very same `Uint8Array` object as in the previous
  snapshot. You choose how often to take a snapshot, and the page size, up to
  16 KiB: with larger pages nearly every snapshot copies most of memory. All
  your snapshots together may hold at most a quarter of the bytes that a full
  copy of memory per snapshot would, counting a page that several snapshots
  share once.
- **stepOut between calls.** The checks test `stepOut` only inside a call.
  Between calls it's yours to define (lesson 12). The worked solution runs the
  whole next call and stops where it has returned.
- **Budgets.** Opening the debugger may replay the run at most about twice.
  After that, going back one instruction, or continuing back to a stop a few
  thousand instructions away, may replay at most 20,000 instructions, which a
  snapshot every few thousand instructions meets and a replay from the start
  does not. The checks count instructions through `step()`, and a debugger
  that stands at position `t` must have counted at least `t`.

### query.mjs (lesson 11)

```js
export function buildIndex(program, recording)   // returns an index
index.end                                         // instructions in the run
index.lastWriter(address, beforeTick)             // { tick, func, at, address, size } or null
index.sources(tick)                               // { stores, answers, args, initial }
```

- `lastWriter(address, beforeTick)` is the write to the byte at `address` made
  by the instruction with the greatest tick below `beforeTick`, or `null`.
- `sources(tick)` takes the tick of a store instruction (anything else
  throws) and returns where the value it stored came from:
  - `stores`: the ticks of every earlier store on the value's chain;
  - `answers`: indexes into `recording.answers` of import results on the chain;
  - `args`: `[call, index]` pairs, arguments of calls into the game on the chain
    (the call's index in `recording.calls`, the argument's index in its `args`);
  - `initial`: addresses of bytes on the chain that were loaded before any
    store had written them.
  Each list is sorted in increasing order, without repeats.
- The chain follows values, not addresses: a value depends on every operand
  of the instruction that produced it, except the address operand of a load
  or store. A load depends on the bytes it read, so on the stores that last
  wrote them. `local.get`, `local.set`, `local.tee`, `global.get` and
  `global.set` pass a value along unchanged, and so does a call to a defined
  function (arguments into its parameters, its result back out). A call to an
  import gives a value that depends only on that answer: its arguments are not
  followed. Constants depend on nothing.
- The rules in detail, where a case could go either way:
  - `select` depends on all three of its operands, the two values and the
    condition, whichever value it picks.
  - A store depends on its whole value operand, even when it writes only its
    low 1 or 2 bytes, and it becomes the last writer of every byte it writes,
    changed or not.
  - A load depends on each byte it reads separately: on several stores if
    several wrote those bytes, and on `initial` addresses for bytes no store
    wrote before it (zero bytes and data-segment bytes alike).
  - Comparisons, conversions and reinterpretations follow their operands like
    arithmetic.
  - Decisions are not followed: a `br_if` condition and which way a branch went
    are on no chain. A branch or `return` passes on only the values it keeps.
  - A call to a defined function makes argument `i` its local `i`; locals
    beyond the parameters, a global's starting value and constants depend on
    nothing.
  - The store asked about is not in its own `stores` list. `args` is sorted
    by call, then argument index.
- `sources` throws for a tick that is not a store's. `lastWriter` returns the
  whole write, its start and size, even for a byte inside a wider store; the
  debugger's `lastWrite` at position `p` is `lastWriter(address, p + 1)`.
- `buildIndex` may replay the recording once or twice. Answering a question
  must not replay it again; the checks count instructions.

### names.mjs (lesson 12)

```js
export function functionNames(bytes)   // { [index]: name } from the file's "name" section, {} if it has none
export function lineAt(lines, offset)  // { line, column } of the last row at or before offset, or null
```

- `bytes` is a whole `.wasm` file as a `Uint8Array`. Lesson 12 gives the
  layout of its sections and of the name section.
- `lines` is the `rows` array of a line-table file `lines/NAME.json`:
  `{ offset, line, column }` in increasing `offset`, where `offset` is a file
  offset like the listing's `offsets`.

### investigations/N.txt (lesson 13)

One debugger command per line, for `node debug.mjs`. The last `answer`
command the script runs is your answer for ladder build N.

The **first bad write** of a ladder build is the earliest store in its run
that leaves a byte of memory holding a value a correct build wouldn't hold there
at the same point of the run. In every build here, the run first goes wrong at a
store the build makes, never by leaving out a store a correct build makes. Up
to that store the build makes the same stores as a correct build, store for
store, so the same point of the run means after the same earlier stores.

### debug.mjs (lessons 10 to 13)

`node debug.mjs PROJECT TARGET [SCRIPT]` runs your files on a recording, or on
ladder build N, and `help` lists its commands. It wraps
`Machine.prototype.step`, so it counts every `step()` of every machine of your
`Machine` class, whoever makes it. That includes your Debugger's first pass,
the index that `who` and `sources` build, and the machines that `getters`,
`answer` and `writes` run on a copy of the state. The count is what `cost`
shows and what the ladder's budgets limit. `diverge` and `compare` run Node's
engine and add nothing to it.

## The 62 instructions

Both games use exactly these. `a` and `b` are the two operands, `b` the one on
top of the stack; a comparison pushes 1 or 0.

| Instructions | What they do |
| --- | --- |
| `block T`, `loop T`, `end` | open a block or a loop (`T`: `null`, or the type of the value it leaves); `end` closes the innermost one, or returns from the function at its last `end` |
| `br N`, `br_if N`, `return` | branch to the block `N` levels out (`br_if` pops a condition and branches if it is not 0); `return` leaves the function |
| `call F` | call function `F`: an import runs outside and its result is pushed; a defined function gets a new frame |
| `local.get`, `local.set`, `local.tee`, `global.get`, `global.set` | read or write a local or a global; `tee` writes and keeps the value |
| `select` | pop a condition `c`, then `b`, then `a`; push `a` if `c` is not 0, else `b` |
| `i32.const`, `i64.const`, `f32.const` | push a constant |
| `i32.load`, `f32.load`, `i32.load8_u` | load 4 bytes as an integer, 4 bytes as a float, or 1 byte as 0 to 255 |
| `i32.store`, `f32.store`, `i32.store8`, `i32.store16`, `i64.store` | store 4, 4, 1, 2 or 8 bytes, lowest byte first |
| `i32.add`, `i32.sub`, `i32.mul` | wrap to 32 bits |
| `i32.div_s`, `i32.div_u`, `i32.rem_s`, `i32.rem_u` | divide or take the remainder, signed or unsigned; divide by 0 traps, and so does `div_s` of -2,147,483,648 by -1 |
| `i32.and`, `i32.or`, `i32.xor` | bitwise |
| `i32.shl`, `i32.shr_s`, `i32.shr_u` | shift by the low 5 bits of `b`; `shr_s` copies the sign bit in, `shr_u` zeros |
| `i32.eqz`, `i32.ne` | is `a` zero; are `a` and `b` different |
| `i32.lt_s`, `i32.gt_s`, `i32.le_s`, `i32.ge_s` | signed comparisons |
| `i32.lt_u`, `i32.gt_u` | unsigned comparisons |
| `f32.add`, `f32.sub`, `f32.mul`, `f32.div`, `f32.sqrt` | 32-bit float arithmetic, rounded with `Math.fround` |
| `f32.neg` | flip the sign, so 0 becomes -0 |
| `f32.lt`, `f32.gt`, `f32.le`, `f32.ge` | float comparisons (false when either is NaN) |
| `f32.convert_i32_s`, `f32.convert_i32_u` | integer to float, reading the integer as signed or unsigned |
| `f64.promote_f32`, `f32.demote_f64` | to and from 64-bit floats, used only around `sin` and `cos` |
| `i32.reinterpret_f32`, `f32.reinterpret_i32` | keep the 32 bits, read them as the other type |
| `i32.trunc_sat_f32_s` | drop the fraction; NaN gives 0, and values beyond the `i32` range give its largest or smallest |
