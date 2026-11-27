# Sightline: API

Every function you write, with its exact signature, inputs and outputs, and
the rules the checks hold it to. The course supplies `host.mjs`, `models.mjs`
and `levels.mjs`, and `lab.mjs` runs everything; you write the nine files
under "Your files". `opcodes.mjs` comes finished, and `lift.mjs` and
`engine.mjs` start with some parts written. Each starter function throws an
error containing "not written yet" until you write it. Helpers of your own
are fine: the checks call only the functions named here.

## Words used here

- **Memory** is the game's memory, a `Uint8Array`. An **address** is a
  position in it, counted in bytes from 0.
- A **slot** is 4 bytes at an address that is a multiple of 4. Slot `s` starts
  at address `4 * s`. A slot can be read as a 32-bit float (`'f32'`) or a
  signed 32-bit integer (`'i32'`), little-endian. Its 32 bits read as an
  integer are its **word**.
- **Candidates** are slots that might hold a value:
  `{ f32: Uint32Array | null, i32: Uint32Array | null }`, each array holding
  slot numbers in increasing order. `null` means that type is not being searched.
- A **key name** is one of `'ArrowLeft'`, `'ArrowRight'`, `'ArrowUp'`,
  `'ArrowDown'`, `'Space'`, `'KeyN'`.
- A **pace** is the game's unit of distance. The field is 960 paces wide.
- A **frame** is one call to `host.tick(1)`, 1/60 of a second of game time.
- A **build** is a game run with one set of defences, its `mode`.
- A **round** starts when the new-round key is pressed. A **shot** is a press
  of the fire key that sends a shell flying. The **scored rounds** are the
  ten rounds `playRounds` plays at the end of a level. The referee scores the
  last ten shots that land on a level, which are the shots of those rounds.
- A level's **budget** is the rounds and shots the whole level may use, the
  scored rounds included. The **allowance** is what the budget leaves for
  learning: the budget less ten rounds and ten shots.
- The **status line** is the line of text that shows the angle, the power,
  the wind and the score, such as `ANGLE 45  POWER 60  WIND +3.7  SCORE 0/0`.
  The **message** is the line that shows `ROUND 2`, `HIT!` or `SHORT BY 149`.
- The **kit** is everything the engine has learned so far, as one plain object
  (see "The kit" under engine.mjs). It is carried from level to level.
- A **part** is a piece of the kit that aims or reads the game: the **fit**,
  the **physics**, the **reader** or the **flag motion**.
- A **hypothesis** is something a search or a pass found that has not been
  tested. A **test** runs it against the game, and it is then **confirmed**
  or **refuted**. A **judge** is a test that decides whether a part goes into
  the kit: the fit's judge (`judgeFit`), the check shots (`learnPhysics`), the
  screen check (`checkReader`) and the motion judge (`judgeMotion`).
- **Evidence** is something the engine saw on this level that rules options
  out: `'exact'` (the level's radius is under 12 paces), `'arrows'` (the
  status line shows only wind arrows), `'moves'` (addresses a search found
  stopped holding the values a round later) and `'flag-moves'` (the flag
  moves on its own).
- A **menu** is a list of **options** the engine's code wrote. A **picker**
  answers a menu with the index of one option: your heuristic, option 0, a
  random pick, or a **decision model**, a small language model (a program
  that reads text and writes text) asked for an option's number.
- The page calls two of the game's functions: `game_key(code)` when a key is
  pressed, with a number for the key (its **key code**), and `game_tick()`
  once a frame. They are the **key handler** and the **frame function**.
- A **struct** is a group of values kept side by side in memory and reached
  through one address, its base. A **field** is one of them, named by its
  offset from the base, such as `+16`. A word that holds an address is a
  **pointer**.
- An **expression** is a plain object for a value the code works out (the
  kinds are under lift.mjs). To **lift** a function is to follow its
  instructions with a stack of expressions instead of numbers, so that each
  store it makes becomes an expression for the value, the place and the guard.
- A **place** is an address expression and an offset: where a load reads or a
  store writes. Field +16 of the struct whose base is kept at `0x13120` is the
  place (the load of `0x13120`, 16), printed `*0x13120+16`.
- A **guard** is the list of branch conditions under which a store runs, each
  `{ cond, holds }`: the condition and whether it must be true or false.
- A **phi** is an expression whose value depends on the path the code took to
  reach it: `{ op: 'phi', paths: [{ when, value }] }`, where each `when` is a
  guard.
- A **pass** is an analysis over lifted code: cross-references, constant
  tracking, slicing, and finding a shape such as the launch or the flight.
- A **slice** of a list of stores, for some places, is the stores that write
  those places, then the stores to every place those read, until nothing is
  added.
- A **stepper** is a store in the key handler that puts back a value plus or
  minus 1, kept within a bound, under one key code.
- The **launch** is what the key handler stores when the shell is fired.
  Among those stores is a word set to 1 that the frame function puts back to
  0 when the shell comes down, the **flying flag**. The
  **flight** is the frame function's stores that move the shell. The
  **landing** is the float the frame function stores when the shell comes
  down. The **hit test** is the frame function's comparison of the landing's
  distance from the flag with the hit radius, the distance within which a
  shot counts as a hit. The **flag motion** is the frame function's stores
  that move the flag.

## Supplied by the course

### host.mjs

`makeHost({ game = 'lob', mode = 0, seed = 1 })` returns a **host**, the only
thing your engine may touch. An engine may make these six calls and no others:

- `host.binary()`: a `Uint8Array`, a copy of the game's `.wasm` file.
- `host.memory()`: a `Uint8Array`, a live view of the game's memory.
- `host.screen()`: `{ width: 960, height: 540, data }`, the RGBA pixels of the
  current frame.
- `host.write(addr, type, value)`: writes one slot; `type` is `'f32'` or
  `'i32'`.
- `host.press(key)`: presses one key (a key name).
- `host.tick(frames = 1)`: advances the game.

`game` is `'lob'` or `'lob2'`: Lob, or Lob II, another game of the same kind
that your engine has never seen. `mode` is a sum of defences: 1 server wind,
2 moving state, 4 scrambled values, 8 moving flag. `seed` picks the memory
layout and the rounds. Two hosts with the same game, mode and seed behave
identically. On screen, the flag's cloth is the only pixels with red above 190
and green and blue below 120.

**The engine never runs the game file.** It may read the bytes
`host.binary()` gives, decode and lift them, and evaluate what it lifted on a
copy of memory. It may not use `WebAssembly` at all: no
`WebAssembly.Module`, `Instance`, `instantiate` or `compile`. Running a copy
would answer every question without understanding any of them, and the
referee's rules forbid it. Check `08-no-run` fails a file that uses
`WebAssembly`, looks a name up on `globalThis` by a computed key, or imports
`vm`, `worker_threads`, `child_process`, `cluster` or `wasi`, and the checks
run your files with `WebAssembly` removed from the global object.

### models.mjs

The engine reaches its picker through `env.models`. Every picker has one call:

```js
await picker.decide(text, labels, options)
// resolves to { choice, ms, model }
```

`text` says what the engine is stuck on, `labels` are the options in words,
and `options` are the option objects themselves, which only the pickers that
are not models look at. `choice` should be an index into `labels`, but check
it. `ms` is how long the answer took. A picker can throw: a model that is not
running is not available.

- `first`: always option 0, the menu's own order. On a menu of repairs with
  more than one option, that is the way that needs no reading of the code,
  which the menus list first and which is not always the way that works.
- `random(seed = 1)`: a random pick, the same sequence for the same seed.
- `rule(engine)`: your heuristic. On a menu whose options carry a `problem`
  (a menu of repairs) it answers `engine.heuristic(problem, options)`; on any
  other menu, option 0.
- `scripted({ decide, decideMs = 3, repeat = false })`: replays choices for
  the checks. `decide` is a list of choices replayed in order, or a function
  `(text, labels, n, options) => choice` (the default answers 0); an entry
  `'unavailable'` throws, as a model that is not running does. `decideMs` is
  what each answer is said to take: a number, or a list used in turn. When the
  list of choices runs out the picker is unavailable, unless `repeat` is true
  (the last entry is given again). `calls` records every question.
- `live(model)`: a decision model on Ollama at `http://127.0.0.1:11434` (or
  `OLLAMA_HOST`), `llama3.2:1b` unless you name another or set
  `SIGHTLINE_DECISION_MODEL`. It asks at temperature 0, the setting that
  makes a model give the same answer to the same question, for a JSON answer
  that holds one whole number in range; a reply that does not parse is option 0.
  `unload()` frees the model when a run is over. No check uses it.

### levels.mjs

`LEVELS` holds the ten levels, each
`{ n, name, game, mode, seed, rounds, radius, pass, budget, about }`.
`rounds` is 10 on every level. `radius` is how close a shot must land to
count, in paces, and `pass` how many of the last `rounds` shots must count.
`budget` is `{ rounds, shots }`: the rounds and shots the whole level may use,
the scored rounds included.

```
 n  name                    game  mode  pass  radius  budget
 1  Open range              lob      0     7      12  28 rounds 30 shots
 2  Bullseye                lob      0     9       3  24 rounds 16 shots
 3  Moving memory           lob      2     9      12  18 rounds 12 shots
 4  Scrambled               lob      6     9      12  16 rounds 12 shots
 5  Wind off the client     lob      7     8      12  16 rounds 12 shots
 6  Moving flag             lob     14     9      12  16 rounds 12 shots
 7  Everything at once      lob     15     8      12  16 rounds 12 shots
 8  A new game              lob2     0     8      12  24 rounds 16 shots
 9  A new game, hidden      lob2     6     8      12  18 rounds 12 shots
10  A new game, everything  lob2     7     7      12  16 rounds 12 shots
```

`runLevel(engine, level, kit, env)` starts the level's game, hands your
`playLevel` a host that a referee is watching, and returns
`{ hits, rounds, fired, over, used, pass, misses, level, seen, error }`. The
referee measures every shot on the game itself, with the flag where it is at
the moment of landing, and scores the last `rounds` shots that land: `hits`
of them landed within `radius`, and `misses` holds their distances from the
flag. `fired` is how many shots landed in all. The referee counts a round
each time `KeyN` is pressed while no shell is flying, and a shot each time a
shell starts to fly; `used` is `{ rounds, shots }`. A level that uses more
than its budget is not passed, and `over` is true. A shot does not count if
anything was written into the game's memory with `host.write` after its
round began: write-tests made during a search come before the scored rounds,
so they cost nothing. `error` is what your engine threw, or `null`. The lab
and the checks call `runLevel`; you don't write it.

### lab.mjs

Run the lab from the course folder, the folder that holds `lab.mjs`. Every
command that names `./work` reads your files from that folder. Add `--help`
after any command for its details.

```
node lab.mjs start ./work
node lab.mjs serve [PORT]
node lab.mjs lesson NN ./work [--part K [--whole] | --next | --all
                              | --section HEADING [--whole]] [--sections]
node lab.mjs question ID ./work
node lab.mjs answer ID ANSWER ./work
node lab.mjs check NN ./work [--only IDS] [--help-used TEXT] [--json]
node lab.mjs check all ./work [--json]
node lab.mjs status ./work [--answers] [--json]
node lab.mjs strings ./work [--mode N] [--seed S]
node lab.mjs find ./work [--mode N] [--seed S]
node lab.mjs listing NAME ./work [--game lob|lob2]
node lab.mjs lift NAME ./work [--place LIST] [--find TEXT] [--full]
                             [--game lob|lob2]
node lab.mjs xrefs ./work [--game lob|lob2]
node lab.mjs level N ./work [--picker P] [--model M] [--fresh]
node lab.mjs climb ./work [--picker P] [--model M]
node lab.mjs measure ./work [--pickers LIST] [--runs N] [--model M]
node lab.mjs sweep ./work [--level N] [--seed S]
node lab.mjs watch N ./work
```

- `start ./work` creates `work/` with the nine starter files you write and
  `opcodes.mjs`, the one finished file. A file that already exists is left
  as it is.
- `serve` serves the lessons, the practice questions and this page at
  `http://127.0.0.1:PORT/`, on a free port when PORT is left out. Only this
  computer can connect. Practice answers are kept in your browser's storage.
- `lesson NN ./work` prints lesson NN as Markdown in the terminal, one part
  at a time. A part ends at a prediction, and the next part opens once every
  question of that prediction has an answer in `work/.practice.json`. With
  no option it prints the newest open part, after a first line that says
  which part of how many it is and a list of its sections. `--part K` prints
  part K if it is open, `--all` every open part, and `--section "HEADING"`
  one section of an open part. A section with subsections prints its text
  up to the first of them and then lists them, each printable with its own
  `--section`; `--whole` after `--section` prints the section with all its
  subsections. `--sections` prints only the first line and the headings. A
  part longer than 12,000 characters prints only its first section and says
  how to go on: `--next` prints the section after the one printed last for
  that lesson, kept in `work/.reading.json`, and goes on to the next open
  part at the end of one; `--whole` without `--section` prints the whole
  part. Each practice item is printed as the
  `question` command that asks it. The work folder need not exist yet.
- `question ID ./work` prints the next question of practice item ID that has
  no committed answer, and the kind of answer it wants, or says that every
  question of ID is answered.
- `answer ID ANSWER ./work` commits ANSWER to that question, prints the
  verdict and the reason as the browser does, saves the answer in
  `work/.practice.json` and prints the next question of ID. After the last
  one it prints `Every question of ID is answered.` A committed answer is
  never replaced, and an answer that can't be read is not saved. Each commit
  keeps the question's prompt, the kind of answer it asked for and a version
  of the question; an answer to an older wording is kept as it was, the
  commands say so, and the question as it is now counts as unanswered. The
  browser keeps its own record, separate from this file, so use one or the
  other.
- `check NN ./work` runs the checks of module NN (01 to 08) against your
  files, each in its own process with a time limit, and `check all ./work`
  runs every module. `--only` runs the named checks of one module, separated
  by commas, as in `--only 03-test-shot,03-fit`. A failed check says what was
  checked, the input, what your code did, what was required and the lesson
  section that teaches it. Every run is saved under `work/.attempts/`, and
  `--json` prints the record instead of sentences. `--help-used "TEXT"`
  saves a note with the attempt saying what helped, such as a supplied
  file or an AI tool. It changes nothing about the checks.
- `status ./work` lists each module's latest check run, whether it passed,
  and whether your files have changed since. Then it counts the practice
  answers committed with `answer` and lists the items still waiting for one.
  `--answers` also lists every committed answer, and `--json` prints all of
  it.
- `strings ./work` starts a fresh game and prints every string your
  `findStrings` finds in its memory, with its address.
- `find ./work` starts a fresh game, runs your `findValues` with the controls
  as the game's help text gives them, so that it needs no kit, and prints the
  addresses it found and how many experiments and new rounds it took. Your
  engine never reads the help text; `learnControls` works the controls out.
- `listing NAME ./work` prints your listing of the game function NAME, such as
  `game_tick`; `funcN` names any function by its index. Once your `lift.mjs`
  is written, each store gets a note: what your lifter says it writes.
- `lift NAME ./work` lifts NAME with your `lift.mjs` and prints every store
  it makes, as `showStore` prints it, then how many stores inside loops it
  left as unknown. A line over 160 characters is cut, with its length;
  `--full` prints every line whole. `--place` keeps the stores to the places
  it lists, separated by commas, each a whole place such as `*0x13120+40` or
  a field such as `+40` through any pointer (`+0` and `*0x13120+0` name
  field +0, which `place` prints as `*0x13120`), and `--find TEXT` the stores
  whose line contains TEXT. With a filter, a line says how many of the
  stores were shown; the last line always counts them all.
- `xrefs ./work` lifts every function and prints your cross-references for
  each field the code reaches through a pointer: its offset, the functions
  that read it and the functions that write it, or
  `no store through this pointer` when no store the lifter can place writes
  it.
- `level N ./work` plays level N with your engine and prints every step it
  took: what code did, what it tested, each pick and what it cost. Level N
  starts from the kit level N - 1 left in `work/kits/`, saved each time a
  level is passed, so play the levels in order. Level 1 starts with an empty
  kit, and `--fresh` starts any level with one. `--picker` says who answers
  the menus: `rule` (your heuristic, the default), `first` (always option 0),
  `random` or `live`; `--model` names the Ollama model for `live`. `--seed S`
  plays the level's build with seed S, or with `--picker random` seeds the
  picks.
- `climb ./work` starts with an empty kit and plays the levels in order until
  one is not passed.
- `measure ./work` climbs all ten levels once for each picker, from an empty
  kit each time, carrying on past a level that is not passed, and prints the
  levels passed, the hits, and the rounds and shots used. `--pickers` takes
  any of `rule`, `first`, `random` and `live`, separated by commas
  (`rule,first,random` unless you say); `random` climbs `--runs` times (5
  unless you say), each with its own seed. It ends with how many menus of
  repairs each picker answered and how many of its picks were unlike your
  heuristic.
- `sweep ./work` plays level 6 (or `--level N`) with the kit that level left
  when it was passed, with the shot leaving 1, 2, 3, 4, 6, 9, 12, 18, 30 and
  54 frames after the plan. Each delay is played twice, once with the plan
  made for it and once with the plan made for 1 frame, so that the rest of
  it is a surprise. Each row gives the delay, in frames and in milliseconds,
  and the hits in two columns, `hits, delay planned for` and
  `hits, delay unplanned`.
- `watch N ./work` plays level N as `level` does and writes
  `work/watch-N.html`, a page that replays the run in a browser.

## Given files and parts

`node lab.mjs start` puts `opcodes.mjs` in your work folder finished, beside
the nine files you write:

- `opcodes.mjs`: `PLAIN` (opcode byte to name, for every instruction with no immediates), `NUMERIC` (the arithmetic, comparison and conversion part of it), `UNARY` (the `NUMERIC` opcodes that take one operand), `OPERANDS` (name to the number of values a `NUMERIC` or saturating instruction takes off the stack; it always pushes one), `LOADS` and `STORES` (opcode byte to name; their immediates are the alignment and the offset), `SATURATING` (the names for `0xFC 0` to `0xFC 7`).

`lift.mjs` starts with its expression table, its arithmetic and its printers
written, and `engine.mjs` with its constants, `gameId` and the budget. Both
are described under their files below.

## Your files

### scan.mjs (modules 01 and 02)

```js
snapshot(bytes)                      // Uint8Array copy of bytes
findStrings(bytes, minLen = 4)       // [{ addr, text }]
readCString(bytes, addr, max = 256)  // string
wordy(text)                          // boolean
changedStrings(before, after)        // [{ addr, text }]
changedLabel(beforeLine, afterLine)  // string | null
parseStatus(line)    // { angle, power, wind, wind_arrows }
viewsOf(bytes)       // { f32: Float32Array, i32: Int32Array }
allSlots(bytes)      // Uint32Array [0, 1, ..., n - 1]
count(cands)         // number of candidates
list(cands)          // [{ type, slot, addr }], f32 first
filterDelta(cands, before, after, delta)  // candidates
filterUnchanged(cands, before, after)     // candidates
filterChanged(cands, before, after)       // candidates
scanNear(bytes, value, tol)               // Uint32Array of f32 slots
filterNear(cands, bytes, value, tol)      // candidates, f32 only
lineFit(xs, ys)                  // { slope, intercept, worst }
findRed(screen)                  // { x, pixels } | null
```

Module 01 teaches the first seven, module 02 the rest. `before` and `after`
are snapshots.

- `findStrings`: a string is a run of at least `minLen` printable bytes (32 to
  126, or 10 for a newline) that ends in a zero byte. A run that ends any
  other way, or reaches the end of memory first, is not a string. `addr` is
  the run's first byte, and `text` has one character per byte.
- `readCString` returns the text from `addr` up to the first zero byte, at
  most `max` bytes, and stops at the end of memory.
- `wordy(text)` is true when `text` has at least 6 characters and three letters
  in a row.
- `changedStrings(before, after)` finds the strings in each snapshot and
  returns the strings of `after` whose address is also a string in `before`,
  whose text differs, and that are wordy, in order of address.
- `changedLabel("ANGLE 45  POWER 60", "ANGLE 45  POWER 61")` is `"power"`.
  Both lines are split into words at spaces: spaces at either end are
  dropped and a run of spaces counts as one break, so no word is empty and
  `"ANGLE 45  POWER 60"` is four words. The words are compared position by
  position, as far as the shorter line goes; at the first word that differs,
  the answer is the nearest word before it that is made only of letters,
  lower-cased. `null` when no word differs or no such word comes before it.
- `parseStatus(line)` reads the whole number after `ANGLE` and after `POWER`,
  and after `WIND` either a number with a sign, such as `+3.7`, or arrows:
  `>` is one arrow right, `<` one arrow left and `~` no arrows, and
  `wind_arrows` is the count of `>` less the count of `<`. A line with arrows
  has `wind: null`, a line with a number has `wind_arrows: null`, and
  anything the line does not show is `null`.
- `viewsOf` gives two views of the same bytes, not copies, with one element
  per slot.
- `filterDelta` keeps f32 slots whose value is a finite number that rose by
  `delta` within 0.001, and i32 slots whose value rose by exactly `delta`.
  `filterUnchanged` and `filterChanged` compare the slot's 32 bits, never the
  float value. A `null` half stays `null`.
- `scanNear` returns the f32 slots whose value is within `tol` of `value`.
  `filterNear` keeps the f32 candidates that are, and sets `i32` to `null`.
- `lineFit` is the least-squares line `y = slope * x + intercept`, by the
  formulas in lesson 02, with slope 0 when every x is the same. A point's
  residual is `y - (slope * x + intercept)`, and `worst` is the largest
  residual with its sign dropped, the worst residual.
- `findRed` returns `{ x, pixels }`: `x` is the middle of the leftmost and
  rightmost columns that hold a pixel of the flag's cloth, and `pixels` is how
  many cloth pixels there are. `null` when there are none. Pixel (x, y) starts
  at `data[(y * width + x) * 4]`, rows from the top.

### find.mjs (module 02)

```js
experimentMenu(state)          // [{ kind, target, label }]
writeTest(host, cands)         // [{ type, addr, held }]
async findValues(host, controls, { decide } = {})
// resolves to { angle, power, wind, flag, statusLine, message,
//               rounds, experiments }
```

- `state` is `{ angle, power, wind, flag, lineFound }`. `angle`, `power`,
  `wind` and `flag` are each a candidate count, `'found'` or `null` (not
  scanned yet), and `lineFound` is true once the status line's address is
  known. For angle and then for power, the menu offers key presses while the
  value has more than two candidates, has none, or has not been scanned: one
  option for the up key and one for the down key. It offers a write-test once
  the value has one or two candidates, and the new-round key only after the
  status line is found and while the wind or the flag is not found. It never
  offers anything else, and never more than 5 options. `kind` is `'press'`
  or `'write'`. For a press, `target` is a control name (`'angle_up'`,
  `'angle_down'`, `'power_up'`, `'power_down'`, `'new_round'`); for a
  write-test it is `'angle'` or `'power'`. The labels are
  `Press the angle up key: angle should go up by 1` (and the same for down and
  for power), `Write-test the 2 angle candidates to see which one the game uses`
  (with the count and the value's name; the words stay the same for one
  candidate, `Write-test the 1 angle candidates to see which one the game uses`),
  and `Press the new-round key: the wind and the flag move`.
- `writeTest`, for each candidate in `list` order, writes the slot's value
  rounded to a whole number plus 7 (minus 7 when the value is 50 or more),
  ticks 2 frames, reads it back, writes the original value back and ticks 2
  frames again, so a copy the game rebuilds holds the original before the next
  candidate. `held` is true when the written value is still there, within
  0.000001.
- `findValues` returns `{ addr, type }` for angle, power, wind and flag, the
  addresses of the status line and the message, `rounds` (how many new rounds
  it started) and `experiments` (how many experiments it ran).
  `decide(text, labels)` returns the index of the experiment to run, or a
  promise of one; the default takes option 0, and an index that is not on the
  menu counts as 0. `text` is one line that describes the state, such as
  `angle: 2, power: found, wind: not scanned, flag: not scanned`, and `labels`
  are the menu's labels.
- The status line is the first changed string, after a press of an angle or
  power key, on which `changedLabel` (of its text before and after) names
  `angle` or `power`. It is not always the first changed string. The message
  is the first changed string, other than the status line, whose text starts
  with a capital letter and has no lower-case letter, seen after a press of
  the new-round key.
- For the angle and for the power, while the value is not found, a press of
  its up key filters its candidates with `filterDelta` and +1, a press of its
  down key with −1, and a press of any other key, the new-round key
  included, with `filterUnchanged`. When a value's candidates fall to 0, it
  starts again from every slot. When a write-test holds for no candidate, the
  value also starts again from every slot. When it holds for more than one,
  the f32 candidate is taken if there is one, otherwise the first.
- The wind comes from the number the status line shows after each new round:
  the first time, every f32 slot within 0.051 of it; after that, the
  candidates still within 0.051 of the new number. Presses that start no
  round keep only the unchanged ones. The wind is found when one candidate is
  left, and is scanned afresh at the next round when none is.
- The flag: after each new round with the cloth on screen, the candidates
  are the f32 slots whose bits changed (the first time, every slot whose bits
  changed and whose value is finite and between 0.001 and 100,000 in size),
  and each candidate's value is kept round by round. Presses that start no
  round keep only the unchanged ones. From the fourth round on, a slot stays
  only if its values fit a line against the cloth's x on screen with a slope
  above 0.25 and below 4 and a worst residual of at most 1.5 paces; a copy
  kept in other units moves in step too, and the slope turns it down. The
  flag is found when one slot is left after at least four rounds, and starts
  again when none is.
- It runs at most 30 experiments. If something is still not found then, it
  throws an error containing `could not find` and names what is missing:
  any of `angle`, `power`, `wind`, `flag`, `status line` and `message`. On a
  build that moves its state every round the search cannot succeed: the cap
  is what makes it stop, unless the level's allowance runs out first.

### learn.mjs (module 03)

```js
LIMITS        // given: { angle_min: 5, angle_max: 85,
              //          power_min: 10, power_max: 100 }
ACCEPT_WITHIN // given: 12
testShot(host, found, controls, angle, power)
// { angle, power, wind, target_x, impact_x, frames }
features(angle, power, wind)          // [five numbers]
leastSquares(A, b)                    // [coefficients] or null
fitShots(shots)                       // [five coefficients] or null
predictFit(coef, angle, power, wind)  // where the shot lands
judgeFit(coef, { fitOn, heldOut }, within = ACCEPT_WITHIN)
// { verdict: 'accept' | 'send back', fitWorst, heldWorst }
nearest(shots, state)                 // { angle, power } or null
search(predict, at, { enough = 0.5, order = 'middle' } = {})
// { angle, power, x, frames, miss } or null
```

- `testShot` sets the angle and then the power with key presses (at most 200
  for each) until the value in `found` rounds to the setting, reads the
  flag's position (`target_x`) and the wind from `found`, presses fire, and
  ticks one frame at a time until the message at `found.message` is not empty
  (pressing fire clears it), for at most 1,500 frames; then it throws
  `the shot never landed`. `frames` is how many ticks that took. `wind` is the
  float the game flies the shell with, read from memory at fire time, not the
  status line's rounded copy.
- `impact_x`, while `found.landing` is not set: after a miss, the landing is
  the flag plus or minus the distance in the message (`SHORT BY` or
  `LONG BY`), right to within half a pace, and every f32 slot within 0.6 of it
  is a candidate for the landing slot. If `found.landingCandidates` holds
  slots from an earlier miss, only slots in both lists stay. One slot left
  becomes `found.landing` (`{ addr, type: 'f32' }`) and `impact_x` is read
  from it; several are kept as `found.landingCandidates`, a plain list of
  slot numbers, and `impact_x` is the landing from the message. When no
  earlier candidate is near this landing, the earlier list is kept as it is.
  After a hit, whose message gives no distance, `impact_x` is the flag's
  position, which can be 12 paces off. Once `found.landing` is set,
  `impact_x` is always read from that slot.
- `features(angle, power, wind)` is
  `[1, cos a, p² sin 2a, wind × (p sin a)², p cos a]`, where `a` is the angle in
  radians and `p` the power: the terms of the range of a shell fired in a
  vacuum, and of the wind's push on it.
- `leastSquares(A, b)` solves `A c = b` in the least-squares sense through
  the normal equations `(AᵀA) c = Aᵀb`, by Gaussian elimination with the
  largest pivot in each column. It returns `null` when a pivot is no bigger in
  size than 1e-12 times the largest entry on the diagonal of `AᵀA`: the system
  is singular, or as near it as floats can tell (14 shots all at one angle).
- `fitShots(shots)` fits the coefficients to shots
  `[{ angle, power, wind, impact_x }]`: `leastSquares` of each shot's features
  against its `impact_x`. `predictFit` is the sum of the features times the
  coefficients.
- `judgeFit` is the fit's judge. It accepts a fit only if it predicts every
  shot it was fitted on (`fitOn`) and every shot held back from it
  (`heldOut`) within `within` paces. `fitWorst` and `heldWorst` are the worst
  misses on each list (0 for an empty list). A `null` fit is sent back with
  both worst misses `Infinity`.
- `nearest` is the aim code can make with no fit: the practice shot whose
  landing was closest to `state.target_x`, the first of equals. It ignores the
  wind. `null` when `shots` is empty.
- `search` finds the whole-number setting that lands where the flag will be.
  `predict(angle, power)` gives `{ x, frames }`, with `frames` `null` when the
  predictor cannot say, or `null`; `at(frames)` gives where the flag will be
  when a shot of that flight time lands, or `null`. Angles run from 5 to 85
  in `order`: `'middle'` tries 45 first, then 44, 46, 43, 47 and outwards;
  `'low'` tries 5 upwards. For each angle it tries the powers 10, 20, ..., 100,
  then halves each gap of 10 where the landing passes the flag (one end short,
  the other beyond) down to neighbouring whole powers. A setting counts only
  when `x` is finite and `at` gave a number; its `miss` is the distance
  between them. After each angle the closest setting so far is kept, and the
  search stops at the first angle where that is within `enough` paces. It
  returns the closest setting it found, or `null` if no setting counted.

### wasm.mjs (module 04)

```js
readU32(bytes, pos)              // { value, next }
readS32(bytes, pos)              // { value, next }
parseModule(bytes)               // module
funcName(mod, index)             // string
funcType(mod, index)             // { params, results }
decode(mod, index)               // [{ offset, code, op, imm, depth }]
listing(mod, index, notes = [])  // string, one instruction per line
```

- `readU32` and `readS32` read a LEB128 number at `pos`: 7 bits per byte, the
  lowest first, with the top bit set on every byte but the last. `readS32`
  extends the sign from bit 6 of the last byte. `next` is the position after
  the number.
- `parseModule` throws `not a WebAssembly module` unless the file starts with
  the magic bytes and version 1. It returns the module, `{ types, imports,
  funcTypes, exports, globals, code, data, importedFuncs, bytes }`. Lesson 04
  gives the layout of each section's entries. The next nine items say what
  each field holds.
- `types` is `[{ params, results }]`, each a list of type names (`'i32'`,
  `'i64'`, `'f32'`, `'f64'`).
- `imports` is `[{ module, name, kind, type }]`, where `type` is the type
  index of an imported function. `kind` is the kind byte from the file: 0 for
  a function, 1 a table, 2 a memory, 3 a global.
- `importedFuncs` is a number: how many imports are functions. Function
  indexes count those first.
- `funcTypes` is a list of type indexes, one for each defined function, in
  order.
- `exports` is `[{ name, kind, index }]`, with `kind` as for imports.
  `node lab.mjs listing` finds functions by these entries.
- `globals` is `[{ type, mutable, init }]`.
- `code` has one entry for each defined function, saying where its body is in
  the file. The course's own parser keeps `{ start, codeStart, end, locals }`:
  the position of the body after its size, the position of the first
  instruction, the position after the body's last byte, and `locals` as
  `[{ count, type }]`.
- `data` is `[{ offset, size, start }]`: the address in memory (`null` for a
  passive segment), the number of bytes, and the position of the first byte in
  the file.
- `bytes` is the file itself, since `decode(mod, index)` is given nothing else
  to read a body from. The checks read the lengths of `types`, `code`,
  `exports` and `data`, the imports' `module` and `name`, `importedFuncs` and
  the exports; the fields of a `code` or `data` entry are yours to choose.
- `funcName` gives an import as `module.name` (`env.cos`), an export by its
  name, and any other function as `func` plus its index (`func5`). `funcType`
  gives `{ params, results }` for an imported or a defined function.
- `decode` returns every instruction of a defined function in order. The body
  of function `index` is entry `index - mod.importedFuncs` of `mod.code`.
  `offset` is the position in the file of the instruction's opcode byte, and
  `code` is that byte (`0xFC` for the instructions after that prefix). `op` is
  the text name (`'i32.load'`), and `imm` the immediates: `[align, offset]`
  for a memory access; `[value]` for a constant, a number or a BigInt for
  `i64.const`; `[type]` for `block`, `loop` and `if`, where `type` is `null`
  for no result, a type name such as `'i32'`, or `type N` for a type index;
  `[[labels], default]` for `br_table`; `[[types]]` for a `select` that lists
  its types; `[n]`, one number in a list, for `br`, `br_if`, `call`, the
  locals and the globals; `[]` when there are none. `depth` is the block depth: the function
  body is depth 1; `block`, `loop` and `if` open a level for the instructions
  inside them; `else` and `end` show at the depth of their block's opening;
  the function's final `end` is at depth 0. It throws on an opcode it does not
  know and on a body whose blocks do not close.
- `listing` returns a first line that names the function,
  `(func NAME (param TYPES) (result TYPES))` with `-` where there are no
  types, then one line per instruction, indented two spaces per level of
  `depth`: the name, then a space and its immediates when it has any.
  A memory access shows `offset=N`, left out when N is 0, and never the
  alignment. A call shows `INDEX <name>`. An `f32.const` or `f64.const` shows
  `String(Number(value.toPrecision(9)))`, so 0.1 as a 4-byte float prints as
  `0.100000001` and 25 as `25`. `block`, `loop` and `if` show `(result TYPE)`
  when the block leaves a value and nothing otherwise. `br_table` shows its
  block indexes and then `default=N`. Every other instruction shows its
  immediates as numbers separated by spaces. When `notes[i]` is not empty and
  the instruction is not a call, the line is padded with spaces to 44
  characters and ends with ` ;; ` and the note. The lab and the checks read
  this text, so keep the form exact.

### lift.mjs (module 05)

#### Given in lift.mjs

- `make(e)` returns the one object for expression `e`, whose parts must
  already be made. For an operation whose order does not matter (`i32.add`,
  `i32.mul`, `i32.and`, `i32.or`, `i32.xor`, `i32.eq`, `i32.ne`, `f32.add`,
  `f32.mul`, `f64.add`, `f64.mul`), the arguments are sorted first, so `a + b`
  and `b + a` are one object. Equal expressions are then the same object:
  compare them with `===` and use them as Map keys.
- `constant(type, value)` makes a constant, and `UNKNOWN` is the one
  expression for a value lifting cannot know.
- `placeKey(addr, offset)` is a string that names a place in Maps.
- The arithmetic table, `OPS`, gives `evaluate` the game's own arithmetic.
  32-bit integer operations wrap to 32 bits, and a division or remainder by 0
  is `null`. Unsigned comparisons and shifts read the word as unsigned, and
  shift counts are taken modulo 32. `f32.add`, `f32.sub`, `f32.mul`,
  `f32.div` and `f32.sqrt` round to a 32-bit float (`Math.fround`) after
  every operation, as the game does. The reinterprets go both ways between a
  float and its word, and truncation to an integer saturates. The table holds
  most i32 and f32 operations, the f64 arithmetic and ordering comparisons,
  the conversions between i32, f32 and f64, and `select`. An operation it
  does not hold, such as any i64 operation, evaluates to `null`.
- The printers, which `node lab.mjs lift` and `listing` use.
  `place(addr, offset = 0)` writes a place: `[0x13120]` for a fixed address,
  `*0x13120` for the address held there, `*0x13120+16` for a field of the
  struct it points to, and `(EXPRESSION)+N` for any other address. `show(e)`
  writes an expression: a load as `f`, `i` or `b` (a float, a word or a byte)
  and its place, operations with their symbols, `asfloat` and `asbits` for
  the reinterprets, a phi as `(CONDITION: VALUE; otherwise: VALUE)`, and a
  phi that says "one of these paths arrived" as `(CONDITION or CONDITION)`.
  `showStore(st)` writes a store as its place, marked `f`, `i` or `b` as a
  load is, then ` = ` and the value, then, when it has a guard, three spaces,
  `when` and its conditions joined by `and`.

#### Expressions

```
{ op: 'const', type, value }    type 'i32', 'i64', 'f32' or 'f64'
{ op: 'param', index }          the function's own parameter
{ op: 'global', index }
{ op: 'load', type, addr, offset }
                                type is the instruction, 'f32.load'
{ op: 'call', name, args }      an import (env.sin) or a function
{ op: 'phi', paths: [{ when, value }] }
                                each when is a guard
{ op: 'unknown' }
{ op: 'i32.add', args: [a, b] } and every other numeric instruction;
{ op: 'select', args: [a, b, c] }    c ? a : b
```

#### Your functions

```js
lift(mod, index)        // { name, stores, returns, calls }
liftAll(mod)            // Map: function name -> lift's result
evaluate(e, env)        // a number, or null
holds(when, env)        // true, false, or null
overlay(bytes)          // { load(type, addr), store(type, addr, v),
                        //   words }
apply(list, m, { call, given } = {})  // a count of stores
parts(e)                // Set of every expression inside e, e first
loadsIn(e)              // [{ key, addr, offset, type, load }]
xrefs(lifted)           // Map: place key -> { key, addr, offset,
                        //   reads, writes }
slice(list, targets)    // the stores that decide the targets
```

- `lift(mod, index)` lifts one function. `stores` holds
  `{ addr, offset, type, value, guard, at }` for each store: the address
  expression, the offset, the store instruction (`'f32.store'`), the
  expression stored, the guard, and `at`, the index of the store's
  instruction in `decode(mod, index)`. `returns` holds `{ guard, value }`
  (`value` is `null` for a function that returns nothing), and `calls` holds
  `{ call, guard }` with `call` the call expression. `name` is `funcName`'s.
- Parameters are `{ op: 'param', index }`, and a local read before it is set
  is the i32 constant 0. Two i32 constants added together fold into one
  constant, and adding the constant 0 gives the other side unchanged; every
  other operation is made with `make`.
- Inside an `if`, the guard gains `{ cond, holds: true }`, and after `else`
  `{ cond, holds: false }`, with the locals as they were before the `if`. A
  `br_if` leaves with `{ cond, holds: true }` added, and the code after it
  runs with `{ cond, holds: false }` added. A `br` leaves with the guard as
  it is, and nothing after it runs on that path. A branch past every block,
  `return`, and the function's own final `end` with a value on the stack
  record a return; `br_table` and `unreachable` end the path.
  The same condition with the same `holds` is one object, so guards can be
  compared entry by entry with `===`.
- At a block's `end`, the paths that arrive there are merged, in the order
  the code reaches them: those that branched to it, the one that ran to its
  end, and last, for an `if` with no `else`, the one that skipped it. A local
  that has the same expression on every path keeps it; otherwise it becomes a
  phi whose paths are those paths in that order, each `when` holding the
  path's conditions beyond the block's own guard. A block's result is merged
  the same way.
- If some path left a block for an outer one, the code after the block runs
  only when one of the arriving paths' conditions holds: unless a path
  arrived with no conditions of its own, the guard gains one entry whose
  condition is a phi worth 1 on each arriving path and 0 otherwise. This is
  how a store after a block that some paths left early gets the right guard.
- An `i32.load` or `f32.load` sees the earlier stores to the same place (the
  same address object and offset, an `i32.store` or `f32.store`), each in
  turn. When a store's guard is the start of the load's guard, the load is
  the stored value, reinterpreted when one is a float and the other a word.
  When the store may not have run, the load is a phi whose paths are
  `[{ when: the store's conditions beyond the shared start, value: stored },
  { when: [], value: what the load was before }]`. Other loads are always the
  plain load expression. A store whose address is computed is taken not to
  touch any other place.
- Loops are not followed: a local set inside a loop becomes `UNKNOWN`, and
  each store inside one is kept with `inLoop: true` and an `UNKNOWN` address
  and value. A call takes its arguments off the stack, is recorded in
  `calls`, and pushes the call expression when the function returns a value.
  `call_indirect`, `memory.size` and `memory.grow` push `UNKNOWN`.
- `liftAll(mod)` lifts every function the module defines, in index order,
  into a Map from its name to `lift`'s result.
- `evaluate(e, env)` is the value of `e`, or `null` where it cannot be known.
  `env` has `load(type, address)`, the number at an address: the word for
  `'i32.load'`, the float for `'f32.load'`, the byte for `'i32.load8_u'`, or
  `null` if unknown. `call(name, args)` is the value of an import, such as
  `env.sin`, or `null`. `given` is a Map from an expression to the value to
  use in its place, checked before anything else; `memo` is a Map that keeps
  values for one evaluation. A parameter, a global, `UNKNOWN` and an i64
  constant are `null`. A load is `null` when its address is; otherwise it asks
  `load` for the address plus the offset, as an unsigned 32-bit number. A
  call is `null` when an argument is, and otherwise what `call` gives. A phi
  tries its paths in order: a path whose `when` fails is passed over, the
  first whose `when` holds gives its value, and a path whose `when` cannot be
  known makes the phi `null`, as does running out of paths. An operation is `null` when an argument is or when `OPS` does not
  hold it.
- `holds(when, env)` is true when every condition of a guard holds, false
  when one does not, and `null` when one cannot be known. A condition holds
  when it evaluates to anything but 0 and `holds` is true, or to 0 and
  `holds` is false. The conditions are taken in order, and the answer comes
  at the first that settles it: `null` at the first that cannot be known,
  `false` at the first that fails. So a condition that cannot be known
  followed by one that fails gives `null`, and the two the other way round
  give `false`.
- `overlay(bytes)` is memory you can write without touching the game. `store`
  writes go to `words`, a Map from address to word, and `load` reads them
  back, falling through to `bytes` (the game's memory, read between ticks)
  for any word not written. `load` takes `'i32.load'`, `'f32.load'` and
  `'i32.load8_u'` at an address that is a multiple of 4, and `'i32.load8_u'`
  at any address; anything else, and an address past the end, is `null`.
  `store` takes `'i32.store'` and `'f32.store'` at a multiple of 4 and
  ignores anything else and a `null` value.
- `apply(list, m, { call, given })` runs a list of lifted stores once
  against memory `m` from `overlay`. Every value is worked out from memory as
  it was before the first store, then the stores whose guards hold are
  written in order. Stores inside loops, stores whose guard does not hold or
  cannot be known, and stores whose address cannot be known are skipped. It
  returns how many stores it wrote; the overlay keeps 32-bit words only, so
  a byte store is neither written nor counted. The game's memory is never
  touched.
- `parts(e)` is every expression inside `e`, each once, `e` first: a
  depth-first walk through the arguments, a load's address, and a phi's
  paths in order, each path's value before its conditions.
- `loadsIn(e)` is every load in `parts(e)`, in that order, as
  `{ key, addr, offset, type, load }`: `key` is `placeKey(addr, offset)` and
  `load` the load expression.
- `xrefs(lifted)` gives the cross-references: for every place the lifted
  functions touch, `reads`, a Set of the names of the functions that read it,
  and `writes`, its stores, each with `fn`, the name of the function that
  makes it. A function reads every place loaded in the values, addresses and
  guards of its stores outside loops, in its return values and in its calls.
  A store outside a loop at a fixed address or through a pointer is a write;
  a store at a computed address, and any store inside a loop, is left out.
- `slice(list, targets)` gives the stores in `list` that decide the places
  in `targets` (place keys): the stores to those places, then the stores to
  every place their values, addresses and guards read, until nothing is
  added. Stores inside loops are left out. The result keeps `list`'s order.

### flight.mjs (module 05)

`keyFn` and `tickFn` are `lift`'s results for the key handler, `game_key`,
and the frame function, `game_tick`. Each finding here is a hypothesis: the
engine tests it before it relies on it.

```js
codeOf(guard)                 // a key code, or null
steppers(keyFn)               // [{ code, delta, value, bound, store }]
decoding(value, rawKey)       // { raw, key, op, float } or null
decoder(d, raw)               // an expression
launchOf(keyFn)
// { code, stores, trig, fields, flying, flyingStore } or null
aimValues(keyFn, launch)      // { angle, power } or null
flightOf(tickFn, launch)
// { stores, landing, landingKey, wind } or null
resolve(m, addr)              // an address, or null
encode(m, d, value)           // a word, or null
simulator(launch, aim, flight)
// simulate(bytes, { angle, power, wind }): { x, frames } or null
windWord(flight, d)           // a load expression, or null
```

- `codeOf(guard)` is the key code a guard requires of the key handler's
  parameter: the constant in the first condition that requires the parameter
  to equal a constant, an `i32.eq` of the two that must hold or an `i32.ne`
  that must not. `null` when there is none.
- `steppers(keyFn)` finds the key handler's steppers: the stores, outside
  loops, whose guard has a key code (`codeOf`) and a bound, and whose stored
  expression adds a constant 1 or −1 (`i32.add` or `f32.add`). The bound is
  the last condition in the guard, with an `i32.eqz` around it looked
  through, that is an ordering comparison (an op ending in `lt`, `gt`, `le`
  or `ge`, of any type, signed or unsigned) between a constant and something
  that is not a constant. Tests for equal and not equal are never the bound,
  so the key-code test on `param0` is passed over. Each stepper is
  `{ code, delta, value, bound, store }`: `delta` is the constant added,
  `bound` the constant compared with, and `value` the expression compared.
  `value` comes from the bound test, not from the store: on Lob the store
  writes the new value scrambled again, while the bound test compares the
  value as the game sees it.
- `decoding(value, rawKey)` says how a value is stored: `{ raw, key, op,
  float }`. Here `raw` and `key` are `i32.load` expressions (`op: 'load'`),
  not stores like `aimValues`' `raw`. A `f32.reinterpret_i32` around the value is taken off, with
  `float` true. A plain `i32.load` is `{ raw: that load, key: null,
  op: 'plain' }`. An `i32.xor` of two loads is `op: 'xor'`: `raw` is the load
  whose place key is `rawKey` (the place the stepper writes), or else the
  second, and `key` the other. An `i32.sub` of two loads is `op: 'add'`, the
  stored word being the value plus the key: `raw` is the first load and `key`
  the second. Anything else is `null`.
- `decoder(d, raw)` is the expression that decodes the word at `raw`'s place
  the same way: the word, the key XOR the word, or the word minus the key,
  reinterpreted as a float when `d.float` is true.
- `launchOf(keyFn)` finds the launch. `trig` is the stores, outside loops,
  whose value calls `sin` or `cos`; `null` when there are none. `code` is
  `codeOf` the first of them, `stores` every store outside loops with that
  key code, and `flyingStore` the first of those that is an `i32.store` of
  the constant 1 (`null` if none), which sets the flying flag. `fields` are
  the place keys `trig` writes (the shell's position and speed) and `flying`
  the place key of `flyingStore`, or `null`.
- `aimValues(keyFn, launch)`: the angle is the first stepper whose `value`
  is inside the launch's `sin` or `cos` calls; the power is the first stepper
  with another `value` that the launch's `trig` stores use. Each is
  `{ value, raw, codes }`: the stepper's `value`, its store, and
  `[code, delta]` for every stepper with that value. Here `raw` is a store,
  `{ addr, offset, type, value, guard, at }` as `lift` lists it, not a load:
  `decoding` below takes the place key of its `addr` and `offset`. `null`
  when either is missing.
- `flightOf(tickFn, launch)` finds the flight: the slice of the frame
  function's stores for the launch's `fields` and its `flying` place, then the
  landing. The reset is the first frame-function store of the constant 0 to
  `flying`, the flying flag; the landing is the first `f32.store` made under
  the same guard (entry for entry), to a place that is not one of the
  launch's fields, through the same address expression as the reset. `null` when
  either is missing. `stores` is the slice with the landing last, and
  `landingKey` the landing's place key. `wind` is the factor the shell's
  sideways speed gains from each frame. `flightOf` is not handed the aim, so
  it finds the sideways speed from the launch alone: it is the place written
  by the first of the launch's `trig` stores that is an `f32.store` whose
  value calls `cos` and converts an integer to a float (`f32.convert_i32_s`
  or `f32.convert_i32_u`, the power). In the slice's store to that place,
  the first `f32.mul` by a constant, in the order `parts` gives, whose other
  side is not a constant and reads none of the launch's fields, holds the
  wind; any further multiplications by constants are taken off it. `null`
  when there is none.
- `resolve(m, addr)` is the address an address expression points to now in
  memory `m` from `overlay`, following each pointer: a constant is itself,
  and an `i32.load` is the word at its resolved address plus its offset.
  `null` for anything else or anything unknown.
- `encode(m, d, value)` is the word the game would store for `value`, stored
  the way `d` says: the float's bits when `d.float` is true, otherwise the
  whole number; then XOR the key, or add it, with the key read through
  `resolve`. `null` when the key cannot be read.
- `simulator(launch, aim, flight)` returns `simulate(bytes, { angle, power,
  wind })`. On an `overlay` of `bytes` it stores the angle and the power the
  way the game stores them (through `decoding`, `resolve` and `encode`), runs
  the launch's stores once with `apply` and the key handler's parameter given
  as the launch's key code, then runs the flight's stores a frame at a time
  until the word at `flying` is 0, for at most 2,000 frames. `sin` and `cos`
  are `Math.sin` and `Math.cos`. When `wind` is a number it is given for
  `flight.wind` and for `server_wind`, rounded to a 32-bit float; otherwise
  the flight uses the wind in memory. It returns `{ x, frames }`, the
  landing when the word at `flying` drops to 0 and the frames that took, or
  `null` when a place cannot be resolved, the landing is not finite, or the
  shell is still flying after 2,000 frames.
- `windWord(flight, d)` is the stored word the wind is decoded from: inside
  `flight.wind`, the `i32.load` under a `f32.reinterpret_i32`, or the side of
  an XOR or a subtraction with `d.key` that is not the key. `null` when the
  code keeps no wind word.

### reader.mjs (module 06)

```js
flagOf(tickFn, flight, key)       // { value, radius, raws } or null
readerFrom(aim, flight, flagRaw)  // { angle, power, wind, flag }
readState(host, reader, lineAddr)
// { angle, power, wind, wind_arrows, target_x }
checkReader(host, look, { lineAddr, rounds = 3, newRound = 'KeyN' })
// { ok, rows, problems }
windBand(arrows)                  // [lowest, highest]
aimBand(state, predict)           // a setting, or null
```

- `flagOf(tickFn, flight, key)` finds the flag through the hit test: in the
  frame function's guards, the first `f32.le` or `f32.lt` against a constant
  (`radius`, the hit radius) whose left side subtracts something from the
  landing's value. That something is `value`, the flag as a float. Taking off
  the reinterpret and the decoding with `key` (an XOR with it, or a
  subtraction of it) reaches the stored word; for a phi, each path's value is
  taken. A word that is an `i32.load` gives its place. A word that the same
  frame computed, as for a flag that moves, gives the place of the store that
  writes it. `raws` holds an `i32.load` of each place, once.
- `readerFrom(aim, flight, flagRaw)` makes a reader from confirmed hypotheses:
  `angle` and `power` are the aim values' expressions, `wind` is
  `flight.wind`, and `flag` decodes the word at `flagRaw` the way the angle is
  stored, as a float.
- `readState(host, reader, lineAddr)` evaluates the reader's expressions
  against the game's memory as it is now, with every call `null`, and
  returns `{ angle, power, wind, wind_arrows, target_x }`, `target_x` being
  the flag. `wind` is `null` when the code takes the wind from the server;
  `wind_arrows` then comes from the status line at `lineAddr`, and is `null`
  otherwise.
- `checkReader` is the screen check. In each of `rounds` rounds it presses
  `newRound`, ticks 2 frames, calls `look()`, which may throw, and compares
  its answer with the status line and the screen: the angle within 0.5, the
  power equal once rounded, the wind within 0.051 when the line shows a
  number, `wind` `null` when it shows arrows, and the flag within 12 paces of
  the cloth's x when the cloth is on screen. A status line with no angle and
  power to compare is a problem. It stops at a round where `look` gives no
  state. `rows` holds `{ round, state, shown, flagPixel, issues }` for each
  round compared, `problems` says what did not match, each starting
  `round N:`, and `ok` is true when there are no problems after all
  `rounds` rounds.
- `windBand(arrows)` is the wind an arrow count can stand for: each arrow is
  1.5 units, the count is rounded, and the wind stays between -5 and 5, so the
  band is `[max(-5, 1.5 × (arrows − 0.5)), min(5, 1.5 × (arrows + 0.5))]`.
- `aimBand(state, predict)` aims when only the arrows are known.
  `predict(angle, power, wind)` gives `{ x, frames }`. It plans for the
  middle of `windBand(state.wind_arrows)` and returns `search` with
  `{ enough: 2, order: 'low' }` for `state.target_x`: the first setting,
  lowest angle first, that lands within 2 paces of the flag, since the
  shortest flights give the unknown part of the wind the least time to push.

### race.mjs (module 07)

```js
moverOf(tickFn, flagRaw)      // the flag motion: a list of stores
flagPath(bytes, mover, flag, frames)  // frames + 1 entries
FRAME_BUDGET                  // a whole number from your sweep
judgeMotion(host, look, pathNow,
  { newRound = 'KeyN', rounds = 3, frames = 300 } = {})
// { ok, problems, predicted }
lead(state, predict, path, delay = 1)  // a setting, or null
ready(plan)                   // boolean
```

- `moverOf(tickFn, flagRaw)` is the flag motion: the slice of the frame
  function's stores for the place of `flagRaw`.
- `flagPath(bytes, mover, flag, frames)` says where the flag will be for the
  next `frames` frames. On an `overlay` of `bytes` it evaluates `flag` (the
  reader's flag expression) for `path[0]`, now; then, frame by frame, it runs
  the mover's stores once with `apply` and evaluates the flag again. `sin`
  and `cos` are `Math.sin` and `Math.cos`. An entry is `null` from the first
  frame whose flag cannot be worked out.
- `FRAME_BUDGET` is the longest surprise, in frames, at which your sweep still
  hit 9 of 10: the largest delay in its unplanned column that did, less the 1
  frame the plan already counts. The unplanned column is the `unplanned` field
  of `sweep`'s rows, which `node lab.mjs sweep` prints last, under
  `hits, delay unplanned`. The surprise is the part of a delay that the plan
  did not count. Check `07-sweep` runs your `sweep` and compares.
- `judgeMotion` is the motion judge. `look()` returns the state now, through
  a reader that passed the screen check, and `pathNow(frames)` predicts the
  flag's path from memory as it is. For each round it presses `newRound`,
  lets 2 + 7 × the round's number frames pass, asks for a path of `frames`
  frames, then ticks one frame at a time and compares each entry with
  `look().target_x`, within 0.05. A `null` entry ends that round's
  comparison. It fails at the first mismatch, on a path that throws or that
  does not have `frames + 1` entries, and when fewer than 20 frames were
  predicted over all the rounds. `predicted` counts the frames after the
  first that were predicted and matched.
- `lead(state, predict, path, delay = 1)` is the shot to fire now so the
  shell lands where the flag will be. `path[k]` is where the flag will be
  after `k` frames, or `null`; `delay` is how many frames pass before the
  shot leaves, so a setting that flies `frames` frames lands when the flag is
  at `path[delay + frames]`, and is skipped when that entry is `null` or past
  the end. With an exact wind it is `search` for that wind with
  `{ enough: 0.5, order: 'middle' }`. With only arrows it plans for the
  middle of `windBand` and uses `{ enough: 2, order: 'low' }`, the shortest
  flight that lands within 2 paces.
- `ready(plan)` is true when `plan` is not `null` and `plan.miss` is at most 2.

### engine.mjs (every module)

Every engine function that takes `env` gets `{ models, log }` from the lab or
the checks. `env.models` is the picker (see models.mjs). Call
`env.log({ rung, step, result })` for each thing the engine does, with `rung`
`'code'` for what code did and `'decision'` for a pick; the lab prints these
lines.

#### Given in engine.mjs

- `PRACTICE`: the 14 practice settings, `[angle, power]`, in firing order.
- `CHECK_SHOTS`: the 3 settings `learnPhysics` fires.
- `SIGHTERS`: the powers 70, 55 and 40, for sighting shots at the lowest
  angle, none of which can reach a flag.
- `gameId(host)`: a string that two hosts share when their game files are the
  same bytes, `"LENGTH:SUM"`, from the file's length and a checksum of its
  bytes.
- `OutOfBudget`: the error class `metered` throws.
- `allowance(level)`: what the level leaves for learning,
  `{ rounds: level.budget.rounds - level.rounds,
  shots: level.budget.shots - level.rounds }`.
- `metered(host, kit, left)` returns `{ host, spent }`. `host` is the host
  the engine learns with: it passes every call through and counts every key
  press. Once `kit.controls` is set, a press of the new-round key when the
  rounds spent have reached `left.rounds` throws `OutOfBudget` with
  `out of rounds: N were left for learning`, and a press of the fire key when
  the shots spent have reached `left.shots` throws with `out of shots`.
  `spent()` gives `{ rounds, shots }`, the presses so far of the kit's
  new-round and fire keys, counted from before the controls were known.
- Helpers that are not exported: `say(env, rung, step, result)` calls
  `env.log` if there is one; `newRound(host, kit)` presses the new-round key
  and ticks 2 frames; `readAt(host, addr, type)` reads one slot; `KEYS` is
  the six key names in the order `ArrowLeft`, `ArrowRight`, `ArrowUp`,
  `ArrowDown`, `KeyN`, `Space`; `parseStatus` is scan.mjs's.

#### What each module asks for

The paragraphs under "The functions" describe each function as it is at the
end of the course. Several are written in one module and added to in later
ones:

- Module 01: `controlsHold` and `learnControls`, complete.
- Module 02: `choose`, complete. The engine's search for the values is
  `findValues` with `choose` as its `decide`.
- Module 03: `learnFit`, `fire`, `playRounds`, and the loop: `checkKit` and
  `playLevel`, on the given budget, without the first step of `playLevel`
  (emptying a kit from another game), which is module 08's. `look` reads only the addresses in
  `kit.found`. `aimFor` searches the fit's predictions for `state.wind`, or
  takes `nearest` with no fit. `playRounds` fires each plan one frame after
  making it, and fires nothing when nothing reads the state. `checkKit` knows
  three problems, each with one option: the controls (`controls`), the state,
  with found addresses tested a round later (`search`), and the aim (`fit`).
- Module 05: `analyse` (the launch, the aim values, the flight, the decoding,
  the simulator and the constants), `sayPhysics` and `learnPhysics`.
  `checkKit` learns that a level with a radius under 12 paces needs the
  physics, and offers `physics`; `aimFor` searches the physics' predictions
  when the kit has them.
- Module 06: `analyse` adds the flag and the readers; `sayReader`,
  `learnReader` and `heuristic`. `look` gets its reader branch. `checkKit`
  tests the reader in the kit against the screen, puts every reader the code
  suggests on the state's menu, and records the evidence that rules options
  out. `aimFor` uses `aimBand` when the wind is not a number.
- Module 07: `analyse` adds each reader's flag motion; `sayMover`,
  `learnMotion`, `pickDecider` and `sweep`. The flag's problem, which
  `checkKit` reports from module 06 on, gets its `motion` options. `aimFor`
  leads a moving flag. `playRounds` waits for a plan that is ready, asks the
  decider and ticks the decider's frames. `playLevel` sets `kit.decider`
  before the rounds, and does not yet empty a kit from another game.
- Module 08: `playLevel`'s first step, which deletes what a kit learned on
  another game. If you wrote that step in module 03 from the whole entry
  below, module 08's checks may pass already, and lesson 08 says what to do
  instead.

```js
controlsHold(host, kit)            // module 01: boolean
learnControls(host, kit, env)      // module 01: the controls
choose(env, what, text, options)   // module 02: an index into options
learnFit(host, kit, env)           // module 03: kit.fit or null
look(host, kit, env)               // module 03: the state now
aimFor(host, kit, state, env, delay = 1)  // module 03: a setting
fire(host, kit, env, plan)         // module 03: { text, frames, hit }
playRounds(host, level, kit, env)  // module 03: { hits, rounds }
checkKit(host, kit, level, env)    // module 03: a problem, or null
playLevel(host, level, kit, env)   // module 03: playRounds' result
analyse(host)                      // module 05: what the passes found
sayPhysics(code, host = null)      // module 05: a sentence
learnPhysics(host, kit, env)       // module 05: kit.physics or null
sayReader(code, cand)              // module 06: a sentence
learnReader(host, kit, env, which) // module 06: kit.reader or null
heuristic(problem, options)        // module 06: an index into options
sayMover(cand)                     // module 07: a sentence
learnMotion(host, kit, env, which) // module 07: kit.mover or null
pickDecider(env, budget = FRAME_BUDGET)   // module 07: { who, frames }
sweep(newHost, level, kit, env, latencies)
// module 07: [{ latency, planned, unplanned }]
```

The functions that return a promise are `learnControls`, `choose`,
`learnFit`, `learnPhysics`, `learnReader`, `learnMotion`, `checkKit`,
`playRounds`, `pickDecider`, `sweep` and `playLevel`.

#### The kit

```js
{
  game,        // gameId of the game the rest of the kit belongs to
  controls,    // { angle_up, angle_down, power_up, power_down,
               //   fire, new_round }, each a key name
  statusLine,  // address of the status line
  message,     // address of the message
  found,       // findValues' result, while its addresses hold;
               // testShot adds landing and landingCandidates
  shots,       // the 14 practice shots, from learnFit
  fit,         // { coef, game } or null
  physics,     // { game, says } or null
  reader,      // { game, which, says }
  mover,       // { game, which, says }: the flag motion
  decider,     // { who: 'code' | 'model', frames }, with plan
               // in sweep's unplanned runs
}
```

The kit is plain data: the lab saves it as JSON after every level passed. A
part goes into the kit only after its judge confirmed it on the game being
played, and `game` on a part says which game that was. `which` is the
reader's index in `analyse(host).readers`, and `says` the sentence that was
tested.

#### The menu

`checkKit` returns a **problem**, `{ part, why, evidence, options }`: `part`
is `'controls'`, `'state'`, `'flag'` or `'aim'`, `why` says in words what is
wrong, `evidence` is the evidence seen on this level so far, and `options` is
the menu. Each option is a hypothesis about what will fix the problem:

```js
{
  kind,    // 'controls', 'search', 'reader', 'fit', 'physics'
           // or 'motion'
  which,   // for reader and motion, the index into
           // analyse(host).readers; otherwise 0
  key,     // `${kind}:${which}`
  label,   // the option in words, for the picker
  cost,    // { rounds, shots }: what testing it should cost
  limits,  // the evidence that rules it out
  run,     // (host, kit, env) => runs it
}
```

```
kind      cost               limits                     runs
controls  2 rounds, 0 shots  none                       learnControls
search    6 rounds, 0 shots  moves, arrows              findValues
reader    3 rounds, 0 shots  none                       learnReader
fit       7 rounds, 17 shots exact, arrows, flag-moves  learnFit
physics   3 rounds, 3 shots  arrows                     learnPhysics
motion    2 rounds, 0 shots  none                       learnMotion
```

The labels, which the picker reads:

- controls: `Press each key and watch the status line`
- search: `Search memory for the values (about 6 rounds; what it finds stops working if the state moves or is scrambled, and it needs the wind on the screen)`
- reader: `Test what the code says about the state (3 rounds against the screen): ` then `sayReader`
- fit: `Fire 14 practice shots and fit an aim to them (about 7 rounds and 17 shots; good to about 10 paces)`
- physics: `Test what the code says about a shot with 3 check shots (3 rounds, 3 shots): ` then `sayPhysics(code)`, with no host
- motion: `Test what the code says about the flag by watching it for 2 rounds: ` then `sayMover`

The `search` option runs `findValues` with `choose(env, 'the next
experiment', text, labels)` as its `decide`. When it succeeds it sets
`kit.found` and logs `search memory for the values: found angle, power, wind
and flag in N experiments`. When `findValues` throws anything but
`OutOfBudget`, it sets `kit.found` to `null` and logs `search memory for the
values: failed: ` and the error's message, such as `failed: could not find
flag`. An `OutOfBudget` error goes through to `playLevel`.

#### The functions

- `controlsHold(host, kit)` is true when the keys in the kit still do what
  they did. It is false when the kit has no controls, status line or message.
  For the angle and then the power it reads the value on the status line
  (false when the line shows none), presses the up key and then the down key,
  or the down key first when the value is at its top (85 for the angle, 100
  for the power), and ticks 2 frames after each press. The value after the
  first press must be one step from where it was. It starts no round.
- `learnControls(host, kit, env)` returns `kit.controls` at once, and logs it,
  when `controlsHold` is true. Otherwise it works the controls out by
  pressing keys, and asks the decision model nothing. It presses each key
  except `'Space'`, ticking 2 frames after each, and watches the changed
  strings. A string on which `changedLabel` names `angle` or `power` is the
  status line, and the key is that value's up key when the number after the
  label rose, its down key when it fell. A key that turns a string into text
  starting with `ROUND` is the new-round key. `fire` is the first key in
  `KEYS` that nothing claimed. It throws `could not work out the controls`
  unless all six are known. It then sets `kit.controls` and `kit.statusLine`,
  presses the new-round key once more, and sets `kit.message` to the first
  changed string, other than the status line, that starts with a capital
  letter and has no lower-case letter (`null` when there is none). It
  returns the controls. Working the controls out starts two rounds.
- `choose(env, what, text, options)` returns the index of the option the
  picker picked. `options` is a list of strings or of objects with a `label`;
  it calls `env.models.decide(text, labels, options)`. With one option or
  none it returns 0 without asking. It returns 0 when `choice` is not a whole
  number from 0 to `options.length - 1` and when the picker throws. It logs
  each pick as a `'decision'` line, `pick ` and then `what`, with the label
  picked or what went wrong. It never throws for a bad answer or a picker
  that is not available; an `OutOfBudget` error it throws again. The search
  passes it to `findValues` as
  `{ decide: (text, labels) => choose(env, 'the next experiment', text, labels) }`.
- `learnFit(host, kit, env)` first makes sure the landing slot is known:
  while `kit.found.landing` is not set, it starts a new round and fires a
  sighting shot with `testShot` at angle 5 and the next power in `SIGHTERS`.
  Such a shot always falls short of the flag, so its message gives a
  distance. Sighting shots go into no list. Then it fires the 14 `PRACTICE`
  shots with `testShot`, starting a new round before shots 1, 5, 9 and 13.
  Every fourth shot (the 4th, 8th and 12th) is held back; the fit is fitted
  on the other 11 with `fitShots` and judged by `judgeFit` on both lists.
  It sets `kit.shots` (all 14) and `kit.fit`: `{ coef, game }` when the fit
  is accepted, `null` otherwise. It logs how many shots were fitted and held
  back, the two worst misses and the verdict.
- `analyse(host)` is what the passes find in the game's code, worked out once
  per game and kept for each `gameId`: `look` calls it every time it reads
  through a reader, so it must not lift the game again. It lifts every
  function with `liftAll(parseModule(host.binary()))`, takes `game_key` as
  the key handler and `game_tick` as the frame function, and returns:

```js
{
  lifted,     // liftAll's Map
  launch,     // launchOf(key handler), or null
  aim,        // aimValues(key handler, launch), or null
  flight,     // flightOf(frame function, launch), or null
  decode,     // decoding of aim.angle.value, keyed by the
              // place its stepper writes, or null
  simulate,   // simulator(launch, aim, flight), or null
  constants,  // loads of fields the launch reads that no
              // function writes
  flag,       // flagOf(frame function, flight, decode.key)
  readers,    // [{ raw, reader, mover }]
}
```

Each finding is `null` when one it needs is. `constants` is constant
tracking: the `f32.load`s inside the launch's `trig` stores whose place
`xrefs` shows no store writing, each once; such a field is set when the game
starts. `readers` has one entry for each place in `flag.raws`: `reader` is
`readerFrom(aim, flight, raw)` and `mover` is `moverOf(frame function, raw)`.
A finding that needs a function you have not written yet, one that throws
"not written yet", is `null` (an empty list for `readers`) until you write
it, so `analyse` works from module 05 on.

- `sayPhysics(code, host = null)` is the sentence
  `A shot starts on key code K: game_key writes +A +B ... from the angle, the power and +C (no store through the pointer writes it; V now), and sets +F; game_tick moves the shell with N stores while +F is set and writes the landing to +L.`
  The offsets after `writes` are those of the launch's `trig` stores, in
  order. Each constant reads `+C (no store through the pointer writes it; V now)`.
  Several follow `the power and`, separated by `, `, as in
  `the power and +C (...), +D (...), and sets +F`; with none the sentence
  reads `from the angle, the power, and sets +F`. `; V now` is the
  constant's value, read through its pointer, and is there only when `host`
  is given and the pointer can be followed.
  `F` is the flying flag's offset, `N` the flight's stores less the landing,
  and `L` the landing's offset.
- `sayReader(code, cand)` is the sentence
  `The state is the struct at P, HOW: angle at +A, power at +B, flag at +C, WIND.`
  `P` is the place of the angle's stored word without its offset; HOW is
  `values stored as they are`, `values stored XORed with the word at +K` or
  `values stored with the word at +K added`, by `code.decode`; `A` and `B`
  are the offsets of the angle's and the power's stored words, and `C` that
  of `cand.raw`. WIND is `the wind is not used` when the flight has no wind;
  otherwise `wind at +W`, with `W` the offset of `windWord`, or `wind` when
  the code keeps no wind word, followed by
  `, or from the server in builds that take it from there` when the wind
  expression calls `server_wind`.
- `sayMover(cand)` is the sentence
  `game_tick moves the flag with N stores, to +A +B.` (`1 store` for one),
  with the offsets the flag motion writes, each once, in the order of its
  stores.
- `fire(host, kit, env, plan)` reads the state with `look`, presses the angle
  keys until the angle, counted press by press from the angle read and
  rounded, equals `plan.angle`, and does the same for the power (at most 200
  presses each).
  Then it presses fire and ticks one frame at a time until the message at
  `kit.message` is not empty, for at most 1,500 frames. It returns
  `{ text, frames, hit }`: the message, how many ticks that took, and whether
  the message starts with `HIT`.
- `learnPhysics(host, kit, env)` tests the physics the code describes with
  the check shots. If `analyse` has no `simulate`, it logs that the code shows
  no launch and flight and returns `null`. If the wind `look` reads is not a
  number, no check shot could be compared on this build: it logs so and
  returns `null`, leaving `kit.physics` as it is. Otherwise it logs
  `sayPhysics(code, host)` and fires the 3 `CHECK_SHOTS`, each in a new
  round: it sets the barrel as `fire` does, simulates the shot from memory
  as it is before the shot leaves, fires it, and takes the landing from the
  message (`SHORT BY 37` is 37 paces before the flag, to the nearest pace),
  with the flag read when it lands. A check shot that hits says only "within 12
  paces", so it is fired again in a new round with 7 more power, and then
  with 7 less. The physics is confirmed when all 3 shots were measured and
  each landed within 1 pace of its simulated landing after the same number of
  frames. It logs the result and sets `kit.physics`: `{ game, says }` when
  confirmed, `null` when refuted.
- `look(host, kit, env)` returns the state now,
  `{ angle, power, wind, wind_arrows, target_x }`. With a reader in the kit it
  is `readState` with that reader (`analyse(host).readers[kit.reader.which]`)
  and `kit.statusLine`. Otherwise it reads the addresses in `kit.found`: the
  angle and the power with their types, the wind and the flag as floats, and
  `wind_arrows` is `null`. With neither it throws
  `nothing in the kit reads the state`.
- `learnReader(host, kit, env, which)` tests reader `which` of `analyse`: it
  logs `sayReader`, then runs `checkReader` for 3 rounds with
  `() => readState(host, reader, kit.statusLine)`, the kit's status line and
  its new-round key. It logs the verdict and the first two problems. When
  the reader is confirmed it sets `kit.reader` to `{ game, which, says }`,
  deletes `kit.found` and returns `kit.reader`; otherwise it returns `null`.
- `learnMotion(host, kit, env, which)` tests the flag motion of reader
  `which`: it logs `sayMover`, then runs `judgeMotion` for 2 rounds of 300
  frames with `look`, the kit's new-round key and
  `(frames) => flagPath(host.memory(), mover, reader.flag, frames)`. When the
  flag motion is confirmed it sets `kit.mover` to `{ game, which, says }` and
  returns it; otherwise it returns `null`.
- `checkKit(host, kit, level, env)` returns the first problem for this level,
  most basic first, or `null` when the kit is ready. The evidence starts with
  `'exact'` when `level.radius` is under 12. While the decoder or the lifter
  is not written yet, it goes on as if the code suggested nothing, and a menu
  can be empty. The problems, in order:
1. The controls: when `controlsHold` is false, the problem is
   `the controls are not known on this game`, with `controls`.
2. The state. `'arrows'` is recorded when the status line shows arrows. A
   reader in the kit is tested against the screen now, at no cost in rounds:
   the angle within 0.5, the power equal once rounded, a number wind within
   0.051, and the flag within 12 paces of the cloth. A reader that fails is
   deleted, and the why says how it failed:
   `the reader in the kit fails here` when `look` throws,
   `the reader in the kit reads angle A and power P; the screen shows S and T`
   when the angle or the power disagrees or the line shows no number for
   them, `the reader in the kit reads wind W; the screen shows S` for the
   wind, and `the reader in the kit puts the flag where the screen does not`
   for the flag. When no reader reads the state and the kit has found
   addresses, they are tested a round later: the engine starts a new round
   and compares them with the status line, in this order, and the first
   test that fails gives the why. A line with no angle and power gives
   `the status line shows no angle and power to compare with`, with no
   evidence. An angle or a power the addresses no longer hold gives
   `a round later the addresses found by searching no longer hold what the screen shows (angle A there, S on screen)`
   and `'moves'`; it names the angle even when only the power is wrong, A
   read at the found address and S on the line. A line that shows only
   arrows gives
   `the screen shows only wind arrows, so an address for the wind is no use`
   and `'arrows'`. A wind more than 0.051 from the line's gives
   `the address found for the wind holds W; the screen shows S` and
   `'moves'`. Addresses that fail are deleted. When nothing reads the state,
   the problem's why is the sentence of the last test that failed, or
   `nothing reads the state yet` when no test ran, and its menu has `search`
   first and then each reader of `analyse`.
3. The flag: when the kit has no flag motion and the flag moves on its own
   (read, 20 frames, read, 20 frames, read: it moves when two readings in a
   row differ by more than 0.001), `'flag-moves'` is recorded and the problem
   is `the flag moves while nothing is happening, and nothing in the kit says how`,
   with `motion` for each reader that has a flag motion. A kit with a flag
   motion records `'flag-moves'` too.
4. The aim: the kit is ready when it has the physics for this game, or, when
   none of `'exact'`, `'arrows'` and `'flag-moves'` was recorded, a fit for
   this game. Otherwise the problem is `this level needs the exact physics`
   (when one of those three was recorded) or `nothing in the kit aims yet`,
   with `fit` when none of the three was recorded and the kit has found
   addresses, then `physics` when `analyse` has `simulate`.

- `heuristic(problem, options)` is the rule the decision model is measured
  against: the index of the cheapest option whose `limits` hold none of
  `problem.evidence`, the cost counted as rounds × 100 + shots, so rounds
  first and then shots, and the first of equals. 0 when every option is ruled
  out.
- `aimFor(host, kit, state, env, delay = 1)` returns the setting to fire for
  `state` with the best part in the kit, or `null`. With the physics, it
  predicts with `simulate` on the game's memory as it is now. With a flag
  motion in the kit as well, it takes the reader's flag path for the next 700
  frames, and if the path is not all one value it returns `lead` for it and
  `delay`, with `moving: true` set on the plan. Otherwise, with `state.wind`
  not a number it returns `aimBand`, and with a number `search` for that wind
  and `state.target_x`. With only a fit and a wind that is a number, it is
  `search` on the fit's predictions, with `frames` `null`. With neither, it is
  `nearest` on `kit.shots`, and `null` with no shots.
- `playRounds(host, level, kit, env)` plays `level.rounds` rounds with
  `kit.decider`, or `{ who: 'code', frames: 1 }` when the kit has none. In
  each round it starts a new round, then looks and plans until the plan can be
  fired. It plans with `aimFor` for a delay of `decider.plan`, or
  `decider.frames` when there is no `plan`. Right after each plan it reads the
  clock: once the frames it has let pass in the round while looking, waits
  included, reach 600, it fires that plan, ready or not, without asking. A
  plan for a moving flag is fired only when `ready(plan)`; otherwise the
  engine lets a frame pass and looks again. When `decider.who` is `'model'` it
  then asks, through `choose`, `fire or wait`, with the text
  `The planned shot lands in F frames, M paces from where the flag will be.`
  (`M` to one decimal place) and the options `Fire now` and
  `Wait and look again`. After a wait it ticks `decider.frames` frames before
  it looks and plans again. Before the shot leaves it ticks `decider.frames`
  frames, the delay the plan was made for, then fires with `fire`. When `look`
  throws, it logs the step `round N` with the result
  `cannot play: MESSAGE; firing nothing`, fires nothing, and returns at
  once. When `aimFor` returns `null` it logs the step `round N` with the
  result `nothing in the kit can aim` and fires nothing in that round. N
  counts the scored rounds from 1; both entries are on the `code` rung. It
  returns `{ hits, rounds }`, with `rounds` being `level.rounds`.
- `pickDecider(env, budget = FRAME_BUDGET)` times three decisions on a
  fire-or-wait question, by their `ms`. The middle time in frames,
  `Math.round(ms * 60 / 1000)` and at least 1, is the delay to plan for; the
  spread is the slowest time less the fastest, turned into frames after the
  subtraction: `Math.round((slowest - fastest) * 60 / 1000)`, so 321 and
  262 ms give a spread of 4 frames, not 19 less 16. It returns
  `{ who: 'model', frames }` when the spread is at most `budget`, and
  `{ who: 'code', frames: 1 }` when it is more or the picker is not
  available. It logs the times and the choice.
- `sweep(newHost, level, kit, env, latencies)` plays the level's rounds twice
  for each delay in `latencies`, each time on a fresh host from `newHost()`:
  once with
  `kit.decider = { who: 'code', frames: latency }`, where the plan is made for
  the delay, and once with `{ who: 'code', frames: latency, plan: 1 }`, where
  the plan is made for a delay of 1 and the shot still leaves `latency`
  frames later. It returns `[{ latency, planned, unplanned }]`, with
  `latency` the delay tried and the other two in hits, and puts
  `kit.decider` back.
- `playLevel(host, level, kit, env)` gets the kit ready for the level and
  plays it, in three steps written in three modules. Module 08's step comes
  first, and is written last: if `kit.game` is not this game's `gameId`,
  the kit's status line, message, found addresses, practice shots, fit,
  physics, reader and flag motion belong to another game and are deleted,
  and `kit.game` is set. Don't write it before module 08: a kit saved by an
  earlier engine has no `kit.game`, so this step would empty it on the next
  level. Module 03's step, the loop, learns on
  `metered(host, kit, allowance(level))`, repeating at most 10
  times: `checkKit`; if there is no problem, stop; keep the options not yet
  tried on this level whose cost fits what is left of the allowance; if none
  is left, log `repair`:
  `nothing left to try that fits the budget (R rounds and S shots left) for the PART: WHY`
  (check 03-budget looks for the words up to `budget`; `round` and `shot`
  are singular for 1) and stop; `choose` one, with the text
  `Level N, NAME: ABOUT Problem: WHY. Left for learning: R rounds and S shots.`
  and each option given with the `problem`; run it on the metered host and
  log what it spent. When `OutOfBudget` stops a repair, it logs
  `repair`: `stopped: ` and the error's message, such as
  `stopped: out of rounds: 8 were left for learning`; when it stops a
  check, it logs `check the kit`: and the error's message; either way it
  stops repairing. Module 07's step comes next: it sets `kit.decider` to
  `{ who: 'code', frames: 1 }`, or to `pickDecider`'s answer when the kit
  has a reader, the physics and a flag motion and the flag's path over the
  next 120 frames is not all one value. It returns `playRounds` on the host
  it was given.
