# Frame Perfect

Kettle is a small platformer: a copper kettle that walks, jumps and tries to reach a flag. Its developers shipped two physics bugs without knowing. In this course you build the tools speedrunners use to find bugs like that, and use them to beat a level's par, the frame count it asks you to beat, which cannot be reached under Kettle's rules as its developers meant them.

A tool-assisted speedrun is a game played from a file, one line of buttons per frame, instead of by hand. You build the toolkit that makes and checks such files: a movie reader and player, savestates, a desync finder, a memory watch, a model of the jump, searches that prove a route is the fastest, a movie minimiser and a way to steer the random generator. You never edit the game. Every claim you make is a movie, and code you did not write replays it on the untouched game.

## Who it is for

You write JavaScript for Node comfortably: functions, loops, arrays, `Map` and `Set`, and modules. Breadth-first search met once is enough; module 5 builds it without assuming you have written one. No game-development background is assumed: frames, sub-pixels, savestates, hashes and heuristics are each explained where they first appear.

## What you need

- Node 22 or newer and a terminal.
- Git, for one part of module 3.
- A browser, if you want to watch and record movies. Everything can be done in the terminal.

No packages, no account and no network connection.

## How to start

Run every command from this folder, the one that holds `lab.mjs`. Read lesson 01 in the terminal:

```
node lab.mjs lesson 01 ./work
```

The lab prints a lesson one part at a time. A part ends at a question; answer it with the command the lab prints, and the next part opens. Your first answer to each question is kept and never replaced. Lesson 01's "Choose how to start" makes your work folder, `work/`. The files in `lessons/` hold the same text with the questions as `{{practice:ID}}` lines.

| Command | What it does |
| --- | --- |
| `node lab.mjs start ./work` | Makes your work folder. Refuses one that exists. |
| `node lab.mjs route NN write ./work` | Adds module NN's code with its important functions left for you to write (`supplied` adds it complete, `ai` prints the contract for an AI tool). |
| `node lab.mjs check NN ./work` | Runs module NN's checks on your toolkit. `check all` runs every module. |
| `node lab.mjs play LEVEL MOVIE` | Replays a movie on the untouched game and says what happened. |
| `node lab.mjs view MOVIE ./work` | Serves the movie player on your own machine and prints its address. |
| `node lab.mjs levels` | Lists the levels and their par times. |
| `node lab.mjs capstone ./work` | Judges your level 3 movie. |
| `node lab.mjs help` | Every command. |

## What is in this folder

- `game/`: Kettle. `core.mjs` is the game, `levels/` its levels, `view.html` the movie player and recorder, and `fixtures.mjs` the extra rooms and movies some lessons and checks use. The checks hash the game, its levels and the fixtures, and refuse to replay on a changed copy.
- `lessons/`: the eight lessons. `lessons/practice/` holds the questions with their answers; leave it unread until you have answered.
- `API.md`: every function of the toolkit and what the checks hold it to.
- `checks/`: the course's checks and the counts they compare with, level 3's best count among them. They hold answers to things the lessons ask you to find, so leave them unread until you have passed the module.
- `examples/`: the listings' source (`toolkit.mjs`, the complete toolkit, which the supplied route copies from) and recorded outputs. `toolkit.mjs` is a worked solution; use it as the supplied route says, not as a shortcut past the write route.

Nobody has taken this course yet, so the times in the lessons are estimates.

See [LICENSE.md](LICENSE.md) for the licence and credits.
