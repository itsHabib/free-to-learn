# Sightline

In this course you build Sightline, an engine that works out a small artillery game from the outside, aims for you, and keeps hitting as the game gets harder to read. The game is Lob, written in C and compiled to WebAssembly, a compact binary format that browsers and Node can run. You set a barrel's angle and power, fire, and try to land within 12 paces of a flag while the wind pushes the shell sideways.

Your engine never sees Lob's source code. It gets the game's file as bytes, its memory, key presses, the screen and time. With those it climbs ten levels. Each level is a build of the game that breaks something the engine relied on at the level before: the target shrinks, the game's values move, then they are scrambled, then the exact wind leaves the game's memory, then the flag starts to move. The last three levels are Lob II, another game of the same kind that the engine has never seen. Every level has a budget of rounds and shots, and a level that goes over it isn't passed.

No model writes any of the engine's code. You write all of it: a memory search, experiments, a decoder for the game's WebAssembly, and analysis passes over the decoded code, of the kind reverse-engineering tools run on a program. The passes lift each function into expressions that say what every store writes and under which conditions, evaluate them with the game's own arithmetic, follow cross-references, track constants, take slices, and find the shapes of the launch, the flight, the landing, the hit test and the flag motion. From what they find, the engine builds a simulator of each shot, a reader for state that moves and is scrambled, and the flag's path. Every finding is a hypothesis until the engine has tested it against the game: check shots for the physics, the screen for the reader, two rounds of watching for the flag.

One model takes part, and it writes no code. It's a decision model, a small language model (a program that reads text and writes text, and can be wrong) that picks an option from a menu your code wrote, such as searching memory for the values or testing what the code says about the state. The course measures its picks against always taking option 0, picking at random, and a heuristic you write.

## Who it is for

You can follow this course if you write JavaScript for Node 22 comfortably: functions, arrays, objects, ES modules and `async`/`await`, and running `node` in a terminal. The mathematics is high-school level: algebra, square roots, and the sine and cosine of an angle. Hexadecimal and bits are taught where they are first needed. No WebAssembly, reverse engineering or machine learning background is assumed.

## What you need

- Node 22 or newer.
- A terminal.

Nothing else: no package install, no account, no API key and no network connection. Every check runs offline, with stand-ins for the decision model. To ask a real one, install Ollama, a program that runs language models on your own computer, pull `llama3.2:1b`, and add `--picker live` to `level` or `climb`, or `live` to the list after `measure --pickers` (`--model` names another model). No check uses it.

## How to start

Run every command from the course folder, the folder that holds this README and `lab.mjs`. Start by reading lesson 01, in a browser or in the terminal:

```
node lab.mjs serve
node lab.mjs lesson 01 ./work
```

`serve` prints a local address. Open it in a browser to read the lessons, answer the practice questions and read the API page. `lesson` prints the same lesson in the terminal, as the next paragraph shows, and works before `work/` exists. The practice questions and the pause at each prediction appear only in those two places. The rest of the lesson appears once you have committed an answer to each of its questions. The files in `lessons/` hold the lesson text with a marker where each question goes, and show the text after every prediction at once.

Lesson 01 opens with "Choose how to start". Its commands create `work/` on the route you pick and refuse a folder that already exists, so don't create `work/` before you have read that section. `node lab.mjs start ./work` is the blank route: `work/` with the nine starter files you write, without lesson 01's marked regions, plus one finished file the course gives you, `opcodes.mjs`. Lesson 01 says how to add its new case's file to a folder made that way. Each lesson gives an order to write its functions in and the checks to run after each step, such as `node lab.mjs check 01 ./work --only 01-strings`. When the last step is done, run the module's whole check, `node lab.mjs check 01 ./work`. Each failure names the requirement, shows the input, what your code returned and what was required, and names the lesson section that covers it. Modules build on each other, so keep them in order. Every lesson, 01 to 08, walks you through the code: each shows its important functions as listings to type into marked regions of your files, and its start command, `node examples/start-NN.mjs ./work write|supplied`, sets up those regions or gives you the working code.

You can read the lessons and answer the questions in a terminal instead. `node lab.mjs lesson 01 ./work` prints lesson 01 a part at a time. A part ends at a prediction, and the command prints the newest part you have opened, with its sections listed first and the item to answer at the end. A part longer than about 12,000 characters prints its section list and its first section only, and `--next` prints the next section, carrying on from the last one printed for that lesson; `--whole` prints the whole part. `--part K` prints an earlier part, `--all` prints every open part, `--section "HEADING"` prints one section, and `--sections` prints only the first line and the headings. A section with subsections prints its text up to the first of them and then lists them, each printable with its own `--section`, and `--whole` after `--section` prints the section with all its subsections. `node lab.mjs question ID ./work` prints the next question of item ID, and `node lab.mjs answer ID ANSWER ./work` commits your answer and prints the same verdict and reason the browser shows, then the next question. Once every question of an item a lesson waits on has an answer, `lesson` prints the next part. These answers are saved in `work/.practice.json` with the question as it was worded, and a committed answer is never replaced. If a question is reworded later, your answer to the older wording stays on record as it was, the commands say so, and the question as it is now waits for an answer. The browser keeps its own record of your answers, and the two are not shared, so pick one way to read and keep to it.

The files in `lessons/` hold the same text, but there a practice question is only a `{{practice:ID}}` line, and the text after a `{{gate:ID}}` line is what the page opens once you commit that question. Read in the browser or with `node lab.mjs lesson` to answer each question before its answer shows. The page opens that text in your browser once you commit, but the server sends any part to any request and keeps no record of answers, so this keeps your reading order rather than locking anything. `lessons/practice.mjs` holds every practice question with its answer, because the page and the `answer` command check your answers on your own computer. Leave it unread until you've committed your own.

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

Your progress is the code in `work/`. Checks read your files fresh on every run, so you can stop at any point and pick up later by running the next check. The kit your engine builds is saved under `work/kits/` each time it passes a level. Practice answers you commit in the browser view are kept by that browser, on that computer. Answers you commit with `node lab.mjs answer` are kept in `work/.practice.json`, and `node lab.mjs status ./work` counts them and lists the items still waiting. `--answers` lists every answer too.

## Scope

The course works on two small WebAssembly games that it ships, Lob and Lob II, read only through each game's file, its memory, key presses, the screen and time. It covers memory scanning, a WebAssembly decoder for the instructions the games use, a lifter and the passes over what it makes, a least-squares fit, tests that confirm or refute what a search or a pass found, budgets of rounds and shots, and one decision model measured against stand-ins. Each defence is paired with the step that gets past it: state that moves, values that are scrambled, a wind kept off the client and a flag that moves.

It doesn't cover native programs, operating-system process memory, real games or anti-cheat systems, and it doesn't teach getting past anyone else's protections. The passes are written for the code these two games compile to, and they aren't a general decompiler. No model writes code and no model is trained. The engine only reads the game files the course ships.

## What the measurement found

Lesson 08 measures every picker over the whole climb, and says what the measurement shows and what it doesn't. Its numbers answer questions that lessons 06 and 08 ask you, so they wait in lesson 08 until you have answered those.

## Licence

Original software is MIT, and original lesson prose and illustrations are CC BY 4.0, attributed to Free to Learn.
