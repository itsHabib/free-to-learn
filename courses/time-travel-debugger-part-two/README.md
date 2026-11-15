# Build a time-travel debugger, part two: debug a real game

Part one built a debugger for a machine of 7 instructions and 8 memory cells. Part two takes it to a real compiled program called Lob, a small artillery game of 2,806 instructions over 131,072 bytes of memory, written in C and compiled to WebAssembly, a machine code that runs in browsers and in Node. You write the machine that runs it, record and replay its runs, step backwards through those recordings, question them, give your debugger names and a call stack, and end by finding planted bugs in six later builds of Lob and of Lob II, a second artillery game built the same way (`targets/lob2.wasm`), with your own tool.

Lob is the game that Sightline, a separate course, works out from the outside, and here you debug it from the inside.

## What you build

Six units, numbered after part one's seven. Each one adds to the same project.

- **08 A machine worth debugging.** An interpreter for the 62 WebAssembly instructions Lob and Lob II use. Node's own WebAssembly engine is the answer key. Then part one's debugger runs on it unchanged, and you measure what copying the whole state on every step costs.
- **09 Record and replay.** Record every answer the outside world gives the game, replay a run exactly without it, and find the first instruction at which a tampered recording parts from the original by bisecting memory hashes. The unit mirrors rr, a record-and-replay debugger for Linux programs.
- **10 Run backwards.** Snapshots that copy only the pages of memory written since the previous one, plus step back, continue back, and "who last wrote this byte", each replaying from a snapshot, so an answer a few thousand instructions back costs a few thousand.
- **11 Question a recording.** An index built in one replay: the last write to any byte before any tick, and the chain of values a stored value was computed from.
- **12 Stack and names.** Function names from the binary's name section, the call stack, stops at named functions, and line numbers from the compiler's line table.
- **13 The ladder.** Six later builds, five of Lob and one of Lob II, each with one planted bug, rising in difficulty. For each, your debugger names the first bad write inside a replay budget.

## Before you start

Part one is the prerequisite. Its ideas (ticks, events and traces, checkpoints and replay, breakpoints, watchpoints and reverse search) are used without being taught again. It's a separate course, "Build a time-travel debugger", and this copy doesn't include it. If you haven't taken it, read its lessons 01 to 06 there, which build its debugger. Its lesson 07 is a capstone investigation that adds no new feature. `fallback/part-one-debugger.mjs` is part one's worked debugger, supplied so part two can be done alone. Reading it spoils part one.

You need Node.js 22 or later and nothing else: no install, no account, no network. You write JavaScript modules, and the lessons use typed arrays, `DataView`, `BigInt` and `structuredClone`. The course was built and checked with Node 26.5.1 on macOS, and its continuous integration runs Node 22 on Linux.

## Start

Read [lesson 08](lessons/08.md), or open [its formatted offline edition](lessons/08.html) in your browser. It starts with a runnable getter, then lets you choose a fresh project with either the important interpreter methods left to write or a complete supplied interpreter. Supporting opcode code is provided on both routes; an AI-assisted route is also explained. Choose your route there before creating `project/`. The browser edition reads locally without a server; commands still run in your terminal from the folder containing `lab.mjs`.

For a completely blank implementation instead of the guided build, the original commands remain available:

```sh
node lab.mjs start project
node lab.mjs check project 08
```

`API.md` is the contract for every function you write. `node lab.mjs` lists every lab command. Existing project folders are never overwritten; resume your own work or choose a new name for a fresh route.

Each lesson asks questions before it explains their answers. Commit an answer with `node lab.mjs predict project ID ANSWER`, and the lab then shows the right answer and why. After a wrong answer it points to the section that teaches the idea and gives you a fresh case to try, or, when the course has no other case, lists the question in `status` as due for another try after your next lesson. `practice.json` holds those questions with their answers, because the lab checks them on your own computer. Leave it unread until you've committed your own. Each `check` saves your files and the results under `project/attempts/`, and `node lab.mjs status project` lists your checks and predictions. The lessons also ask you to keep notes in `project/report.md`. They're yours, and no check reads them.

## What was measured

Numbers from the course's own worked solution on the authoring Mac, 2026-11-13. The course's numbers check, which isn't part of this copy, re-derives every count from the course's files. The timings were measured and vary from computer to computer.

- Agreement with Node's engine: 33 runs of both games in every mode, 37,620 calls and 34,647,332 instructions on the worked solution's machine. After every call its result, every getter and the memory hash agree with Node's.
- Part one's debugger on the real game (`node lab.mjs wall`, the fallback debugger on the worked solution's machine): a run of 1,043,331 instructions that the machine alone finishes in about 50 ms. Copying the whole state, 131,072 bytes of memory, on every step makes each step about 12 microseconds instead of about 0.05, so one pass takes about 12 seconds, and one backward question at the end of the run, with its answer 1,000 ticks back, is estimated at about 3 hours.
- Replay budgets, counted as calls to your machine's `step`: in unit 09, finding where a tampered recording parts may run three times what the worked solution runs (1,025,000 to 1,362,000 instructions on the checks' recordings). In unit 10, each backward question near the end of a 654,610-instruction run may replay 20,000 instructions, and the worked solution, with a snapshot every 1,000 instructions, needs at most 1,872.
- The ladder: the first bad writes lie 3,611 to 370,147 instructions before the end of their recordings. The worked investigations replay 278,551 to 1,308,230 instructions, and the budgets are 856,000 to 2,617,000.

## What this course doesn't claim

- No person has taken it yet. A fresh AI agent worked through units 08 to 13 from the learner copy. That run is evidence the instructions can be followed, not that the course teaches.
- The time estimates, roughly 40 to 60 hours for the six units, are guesses.
- Checks cover their named cases. In a test run before release, an AI agent working from API.md, the supplied files and the check output passed every check in about 27 minutes without opening a lesson. So a pass shows that your code met the checks' cases, not that you've learned what the lessons teach. The lessons' reasoning is practised in the prediction questions, and no check grades them.
- The C sources of Lob and Lob II aren't part of this course. Sightline asks its learners to work out what they say from the compiled code. `targets/MANIFEST.json` still lists the hashes of `lob.c` and `lob2.c`, which the course's own build verifies and this copy leaves out.

The checks run your own JavaScript with your normal permissions. They aren't a sandbox, so run code you understand.
