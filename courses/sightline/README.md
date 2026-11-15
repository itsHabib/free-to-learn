# Sightline

In this course you build Sightline, an engine that works out a small artillery game from the outside, aims for you, and keeps hitting as the game gets harder to read. The game is Lob, written in C and compiled to WebAssembly, a compact binary format that browsers and Node can run. You set a barrel's angle and power, fire, and try to land within 12 paces of a flag while the wind pushes the shell sideways.

Your engine never sees Lob's source code. It gets the game's file as bytes, its memory, key presses, the screen and time. With those it climbs ten levels. Each level is a build of the game that breaks something the engine relied on at the level before: the target shrinks, the game's values move, then they are scrambled, then the exact wind leaves the game's memory, then the flag starts to move. The last three levels are Lob II, another game of the same kind that the engine has never seen. Every level has a budget of rounds and shots, and a level that goes over it isn't passed.

No model writes any of the engine's code. You write all of it: a memory search, experiments, a decoder for the game's WebAssembly, and analysis passes over the decoded code, of the kind reverse-engineering tools run on a program. The passes lift each function into expressions that say what every store writes and under which conditions, evaluate them with the game's own arithmetic, follow cross-references, track constants, take slices, and find the shapes of the launch, the flight, the landing, the hit test and the flag motion. From what they find, the engine builds a simulator of each shot, a reader for state that moves and is scrambled, and the flag's path. Every finding is a hypothesis until the engine has tested it against the game: check shots for the physics, the screen for the reader, two rounds of watching for the flag.

One model takes part, and it writes no code. It's a decision model, a small language model (a program that reads text and writes text, and can be wrong) that picks an option from a menu your code wrote, such as searching memory for the values or testing what the code says about the state. The course measures its picks against always taking option 0, picking at random, and a heuristic you write.

## What the measurement found

Measured with the course's own engine, climbing all ten levels:

- Your heuristic, which takes the cheapest option that nothing the engine has seen on the level rules out, cleared every level.
- Always option 0 failed level 3: it searched memory that moves every round and ran out of the rounds the level leaves for learning.
- Random picks failed some levels, all of them on the new game. Over 20 climbs, level 8 failed 5 times, level 9 8 times and level 10 6 times. The 5 climbs that lost level 8 lost levels 9 and 10 with it, so most of the losses on those two levels followed from losing level 8.
- Two decision models on Ollama, `llama3.2:1b` and `qwen2.5:7b`, each cleared all ten levels in one climb, and neither beat the heuristic on any level. Each also replayed levels 3 and 9 from the kit that option 0 leaves. `llama3.2:1b` picked unlike the heuristic on 1 of the 5 menus of repairs it answered, searching memory on level 8 where the heuristic tests what the code says about the state, and passed anyway, using all 24 rounds that level allows. `qwen2.5:7b` picked what the heuristic picks on all 4 of its menus of repairs. The one time it was allowed to decide when to fire, on level 9 replayed, it answered "wait" to 72 of 79 questions, and its shots hit only because the engine fires a fresh plan when a round's time runs out.

On these games the decision model didn't beat the heuristic, and the course says so. On these menus it couldn't have, because the cheapest option that nothing rules out always worked, and firing a ready plan at once ("Fire now") was a good answer every time, so a picker could only match the heuristic or lose to it. A menu where the cheapest option that nothing rules out sometimes fails is where a picker could earn its place. What you build around the decision model is the menu it picks from, the loop that keeps every level inside its budget (the budget is what makes a poor order cost something), and the heuristic it's measured against.

## Who it is for

You can follow this course if you write JavaScript for Node 22 comfortably: functions, arrays, objects, ES modules and `async`/`await`, and running `node` in a terminal. The mathematics is high-school level: algebra, square roots, and the sine and cosine of an angle. Hexadecimal and bits are taught where they are first needed. No WebAssembly, reverse engineering or machine learning background is assumed.

## What you need

- Node 22 or newer.
- A terminal.

Nothing else: no package install, no account, no API key and no network connection. Every check runs offline, with stand-ins for the decision model. To ask a real one, install Ollama, a program that runs language models on your own computer, pull `llama3.2:1b`, and add `--picker live` to `level` or `climb`, or `live` to the list after `measure --pickers` (`--model` names another model). No check uses it.

## How to start

Run these from the course folder, the folder that holds this README and `lab.mjs`:

```
node lab.mjs start ./work
node lab.mjs serve
```

`start` creates `work/` with the nine starter files you write, plus one finished file the course gives you, `opcodes.mjs`. `serve` prints a local address. Open it in a browser to read the lessons, answer the practice questions and read the API page. Read the lessons on that page. The practice questions appear only there, and so does the pause at each prediction. The rest of the lesson appears once you have committed an answer to each of its questions. The files in `lessons/` hold the lesson text with a marker where each question goes, and show the text after every prediction at once. Read lesson 01 first. Each lesson gives an order to write its functions in and the checks to run after each step, such as `node lab.mjs check 01 ./work --only 01-strings`. When the last step is done, run the module's whole check, `node lab.mjs check 01 ./work`. Each failure names the requirement, shows the input, what your code returned and what was required, and names the lesson section that covers it. Modules build on each other, so keep them in order.

The files in `lessons/` hold the same text, but there a practice question is only a `{{practice:ID}}` line, and the text after a `{{gate:ID}}` line is what the page opens once you commit that question. Read in the browser to answer each question before its answer shows. The page opens that text in your browser once you commit, but the server sends any part to any request and keeps no record of answers, so this keeps your reading order rather than locking anything. `lessons/practice.mjs` holds every practice question with its answer, because the page checks your answers on your own computer. Leave it unread until you've committed your own.

Your engine keeps what it learns in a kit that it carries from level to level. `node lab.mjs level 1 ./work` plays a level with your engine and prints every step it took, and `node lab.mjs climb ./work` starts from an empty kit and plays the levels in order. `node lab.mjs --help` lists every command. `API.md` gives every function and the exact rules the checks hold it to, on one page. `checks/` and `fixtures/` are the course's test code and recorded data. They hold answers to things the lessons ask you to find yourself, so leave them unread until you have passed the module they belong to.

## The ten levels

| Level | Name | Game and defences | To pass | Budget |
| --- | --- | --- | --- | --- |
| 1 | Open range | Lob, plain | 7 of 10 within 12 paces | 28 rounds, 30 shots |
| 2 | Bullseye | Lob, plain | 9 of 10 within 3 paces | 24 rounds, 16 shots |
| 3 | Moving memory | Lob, state moves | 9 of 10 within 12 paces | 18 rounds, 12 shots |
| 4 | Scrambled | Lob, state moves and is scrambled | 9 of 10 within 12 paces | 16 rounds, 12 shots |
| 5 | Wind off the client | Lob, as level 4, wind on a server | 8 of 10 within 12 paces | 16 rounds, 12 shots |
| 6 | Moving flag | Lob, as level 4, flag moves | 9 of 10 within 12 paces | 16 rounds, 12 shots |
| 7 | Everything at once | Lob, all four defences | 8 of 10 within 12 paces | 16 rounds, 12 shots |
| 8 | A new game | Lob II | 8 of 10 within 12 paces | 24 rounds, 16 shots |
| 9 | A new game, hidden | Lob II, state moves and is scrambled | 8 of 10 within 12 paces | 18 rounds, 12 shots |
| 10 | A new game, everything | Lob II, every defence it has | 7 of 10 within 12 paces | 16 rounds, 12 shots |

The referee, the part of the course that watches the game itself, counts the last 10 shots that land on a level, and each budget includes those 10 rounds and shots. Each level starts from the kit the level before it left.

## The modules

1. Text in memory: pull the strings out of the game's memory, find the status line and the message by what changes when a key is pressed, and work out the controls by pressing keys, keeping keys that still work.
2. Pin the values: find where the game keeps the angle, the power, the wind and the flag by filtering memory across experiments chosen from a menu, and see why, on Lob, a pick from a menu on which every option works can't matter.
3. An aim from practice shots: fire practice shots, fit an aim to them by least squares, judge the fit on shots it never saw, and play level 1 inside its budget of rounds and shots.
4. Take the code apart: decode the game's WebAssembly into listings with block depths and exact numbers.
5. Lift the code: lift functions into guarded expressions, evaluate them with the game's own arithmetic, find the launch, the flight and the landing by their shapes, and install the physics they make only after check shots confirm it. Level 2.
6. The game fights back: read the state's place and encoding out of the code, test a reader built from it against the screen, and have the engine find what a level broke and pick a repair within the budget, with your heuristic to measure the decision model against. Levels 3 to 5.
7. Race the clock: slice the flag motion out of the code, judge the path it predicts frame by frame, lead a moving flag, and measure what decision time costs when it's planned for and when it isn't. Levels 6 and 7.
8. A game you have never seen: the same passes, tests and loop climb levels 8 to 10, and you measure every picker over the whole climb. The checks can run your passes only on the two games, so nothing checks that a pass holds no special case for either.

## The one rule

The engine never runs the game file. It may read the file's bytes, decode and lift them, and evaluate what it lifted on a copy of memory, but it may not load the file as a WebAssembly module and run it. Running a copy would answer every question without understanding any of them, and the referee's rules forbid it. A check scans your files for it, and the checks run your files with WebAssembly taken away.

## How long it takes

About 23 hours in total. This is an estimate and hasn't been measured with learners. Nothing is timed, so take as long as you need.

## How progress is saved

Your progress is the code in `work/`. Checks read your files fresh on every run, so you can stop at any point and pick up later by running the next check. The kit your engine builds is saved under `work/kits/` each time it passes a level. Practice answers you commit in the browser view are kept by that browser, on that computer.

## Scope

The course works on two small WebAssembly games that it ships, Lob and Lob II, read only through each game's file, its memory, key presses, the screen and time. It covers memory scanning, a WebAssembly decoder for the instructions the games use, a lifter and the passes over what it makes, a least-squares fit, tests that confirm or refute what a search or a pass found, budgets of rounds and shots, and one decision model measured against stand-ins. Each defence is paired with the step that gets past it: state that moves, values that are scrambled, a wind kept off the client and a flag that moves.

It doesn't cover native programs, operating-system process memory, real games or anti-cheat systems, and it doesn't teach getting past anyone else's protections. The passes are written for the code these two games compile to, and they aren't a general decompiler. No model writes code and no model is trained. The engine only reads the game files the course ships.

## Licence

Original software is MIT, and original lesson prose and illustrations are CC BY 4.0, attributed to Free to Learn.
