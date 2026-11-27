# The toolkit's interface

Everything you write goes in `work/tas.mjs`, one region per module, between `// region: NAME` and
`// endregion: NAME`. The checks import these exports by name. Supplied functions arrive with the region; the
ones marked **write** are yours on the write route.

The game is `game/core.mjs`. You call it; you never edit it. It gives you `newState(level, version)`,
`step(state, input)`, `hash(state)`, the RAM map `ADDR`, the buttons `L`, `R`, `J` and the six inputs
`INPUTS`. Levels load with `loadLevel(name)` from `game/levels.mjs`.

## Module 1: movie

A movie line is a bar, then `L`, `R`, `J` or a dot for each button, then a bar: right and jump together is
`|.RJ|`, nothing pressed is `|...|`.

| Export | Contract |
| --- | --- |
| `formatInput(input)` | The movie line for one input number: 6 (right and jump) becomes the line for right and jump. |
| `parseInput(line, n)` | The reverse. A line that is not of that form throws an error naming line `n`. |
| **write** `readMovie(text)` | `{ header, inputs }`. Header lines are `key: value` before a line `inputs:`; after it, one input line per frame. Blank lines are skipped. |
| `writeMovie({ header, inputs })` | The text `readMovie` reads back to the same thing. Idle frames at the end are kept. |
| **write** `play(level, inputs, version = '1.0')` | Plays from a new state. Stops at the flag or at death. `{ finished, frame, dead, hash, state }`: `frame` is the frame the flag was reached (1 for the first input), or `null`. |

## Module 2: savestate

| Export | Contract |
| --- | --- |
| **write** `save(state)` | A copy that later play cannot change. |
| **write** `load(saved)` | A live state that plays on from the copy. Loading the same savestate twice gives two independent states. |
| `Session` | `new Session(level, version)`; `advance(input)`; `saveSlot(n)`; `loadSlot(n)` throws away the inputs after the save and adds one to `rerecords`. |

## Module 3: desync

| Export | Contract |
| --- | --- |
| **write** `firstDivergence(probe, n)` | `probe(k)` is true when two runs agree after k frames. They agree after 0 and disagree after n. Returns the first k for which they disagree, using at most ceil(log2 n) + 1 probes. |
| **write** `diffRam(a, b)` | The addresses, in order, where two states' RAM differs. |

## Module 4: watch and model

| Export | Contract |
| --- | --- |
| **write** `peek(state, addr, type = 'u8')` | `u8`, `u16` (low byte first) or `s16` (signed). |
| `watch(level, inputs, fields, version)` | One row per frame from frame 0: `{ frame, NAME: value }` for each `{ name, addr, type }` in `fields`. |
| **write** `predictArc(start, inputs)` | Kettle in open space: flat ground at `start.y`, no walls, ceilings or belts. `start` is `{ x, y, vx }`, standing. Returns `{ x, y }` after each input. Never calls `step`. |

## Module 5: search

| Export | Contract |
| --- | --- |
| **write** `stateKey(state, withRandom = false)` | Equal keys exactly when the two states behave the same from here on. Leaves out the frame counter, and the random state unless `withRandom` and the bell has not rung. |
| `bruteForce(level, maxDepth, goal)` | Every input sequence, shortest first, with no memory. `{ inputs, frames, expanded }`. |
| **write** `search(level, opts)` | Best-first search with de-duplication. `opts`: `goal`, `heuristic`, `budget`, `version`, `withRandom`, `from` (a savestate). Returns `{ inputs, frames, expanded }`, or `inputs: null` with `stopped: 'budget'` or `'exhausted'`. With no heuristic, the movie is a shortest one. A heuristic returns frames, 0 or more; a fraction is rounded up. |
| `countReachable(level, maxDepth)` | Distinct states first reached at each depth. |
| `walkingBound(level)` | A heuristic: frames to the flag's column at walking top speed. |
| `finished(state)` | The default goal. |

## Module 6: minimise

| Export | Contract |
| --- | --- |
| **write** `minimise(inputs, stillShows)` | Clears button presses while `stillShows(inputs)` stays true, until clearing any single remaining press makes it false. |

## Module 7: steer

| Export | Contract |
| --- | --- |
| **write** `steer(level, plan, want, maxIdle = 30)` | The fewest idle frames before `plan` for which the bell rings and chooses drop `want`: `{ idle, inputs }`, or `null`. |
