# Anti-cheat engineering, part two: defend the game

Part one, the course Anti-cheat engineering, built defences for the courier arena on one
machine. Part two puts two games behind a server on a network and defends them against
clients that lie. The games are the course's own: Lob, the small WebAssembly artillery
game the Sightline course works out, and part one's courier arena.

You don't need part one or Sightline. This course restates every idea it borrows from
part one where it uses it, and it starts at unit 12 because part one's units are M1 to
M11. Sightline is a separate course in which you build an engine that plays Lob by reading
its memory and pressing its keys. If you took it, lesson 17 has an optional exercise for
your engine.

## The two games

Lob is an artillery game. Each round you set an angle and a power and fire one shell, the
wind pushes it sideways, and a landing within 12 paces of the flag is a hit (a pace is
Lob's unit of distance). Every round brings a new wind and a new flag position, the flag
keeps moving while you aim, and the screen shows the wind only as one of seven arrow
bands, from `<<<` through `~` to `>>>`. A session is one player's 12 rounds. Players see
the game through the official client, the game's own client program, which draws the
screen from the server's messages.

The courier arena is part one's game. A player steers a courier around a floor in 250 mm
steps, picks up a parcel at the core and delivers it to the depot, each with a press of
interact within 250 mm of the place, and every delivery scores a point. After an
interaction counts, the courier's cooldown makes the next one wait 4 ticks. Both games'
servers run in ticks of 50 ms.

## What you will build

- **12 · Lob behind a server.** The server runs the game. A client may send a version,
  a sequence number, an angle, a power and "fire", nothing else. Your admission refuses everything
  outside that: unknown fields, values out of range, old and repeated messages, a second
  shot in a round. Your recorder writes each session down, and your replay re-runs a
  record from its seed to check it.
- **13 · Hide what the client doesn't draw.** The server owns the wind and the flag's
  motion. Your view, the message the server sends each client after every tick, holds only
  what the screen draws, to the nearest pace. Your leak finder changes one hidden value at
  a time and compares the messages byte for byte. You measure what hiding costs an honest
  player as latency grows.
- **14 · Meet the limit, then detect.** A client that aims for the player sends legal
  inputs, so the server can't refuse them. You build a detector over whole sessions,
  set its threshold on development sessions (the ones you tune on) for a budget of false
  flags (legal sessions the detector flags), freeze it, measure it once on held-out
  sessions (kept back until then), and work
  out what its flags would mean in a game where one session in 100 is a cheat. Its findings
  are advice for a person. Nothing in this course bans anyone.
- **15 · Latency on the courier game.** Players on slow connections press at the right
  moment and arrive late. Your server judges a press at the moment the player saw, but
  no further back than a window (a limit in ticks that you choose) and than that player's
  measured round trip. You measure honest presses refused against lies accepted for each
  window, and choose one.
- **16 · The duplicated item.** A trade between two players crashes midway. Your
  request keys, which let the server recognise a retry, and your recovery keep every item
  in exactly one inventory through a crash after any write, including writes made during
  recovery.
- **17 · The scoreboard.** One command plays the course's cheating clients and legal
  player models against your whole defence and prints, for each: hit rate, sessions
  refused, sessions flagged. Then it marks each budget PASS or MISS.

Defence only, on the course's own games. The cheating clients are fixtures for these two
games: the protocol cheats (clients that each break one rule of the protocol), a client that
searches angle and power with its own copy of the game, and two clients that lie about
latency. The searching client's variants that add human-like delay and deliberate misses
exist only as recorded sessions.

## Start

You need Node 22 or later. Nothing to install. You should be comfortable with medians and
quartiles. The lessons define the rest (recall, false positive rate, precision, the
standard error of a rate, the median absolute deviation).

Open `lessons/12.md` first, before you run anything. Its section "Choose your starting
point" gives the command that makes your project folder, `project/`. That command creates
the folder and refuses one that already exists, so don't make `project/` yourself before
you reach it. Every lesson with code to walk through offers two routes into it: type in
the important parts from listings the lesson prints in full, or start from working code.
Lesson 12's command makes the project for the route you choose, and each later lesson's
command sets up its unit inside that same project. The code you design yourself is the
same on every route: each lesson's new application, your detector's score in lesson 14
and your rewind window in lesson 15.

Lesson 12 also names a blank start, `node lab.mjs init project`, which copies `starter/`
into `project/` with every function throwing "not written yet" until you write it. Use it
instead of a route's command, not before one.

`lab.mjs` runs everything in this course, and a check is an automated test of one
contract, named like `12.parse-accepts`. Once lesson 12 has made your project, `check`
runs all of a unit's checks:

```
node lab.mjs check project 12
```

To run one check, name it with `--case`, and `--case list` prints a unit's checks with
their titles:

```
node lab.mjs check project 14 --case 14.features
node lab.mjs check project 14 --case list
```

Lessons ask you to predict before you run something:

```
node lab.mjs predict project 12a YOUR_ANSWER
```

Your first answer is kept, and later answers are added after it. After a wrong answer the lab points to the section that teaches the idea and gives you a fresh case to try. When no fresh case is left, `status` lists the question as due for another try later.

lab.mjs keeps your receipt in `project/attempts/`. It adds a new folder there for every
check run, prediction, freeze and held-out run, and for every run of the new-application
checkers of lesson 12, lesson 13, lesson 14, lesson 15, lesson 16 and lesson 17
(`examples/check-resume.mjs`, `examples/check-spectator.mjs`, `examples/check-kind-budget.mjs`,
`examples/check-moved.mjs`, `examples/check-swap.mjs` and `examples/check-gain.mjs`), and it
never overwrites one. In lesson 14, `freeze` records the sha256 hashes of your detector's
files there with a copy of each, which `node lab.mjs restore-frozen project` puts back,
and `heldout` records each result it gives, the first one marked as first. That
first held-out result is the number you report. `node lab.mjs status project` lists the
receipt in order.

## What is where

- `lessons/`: one lesson per unit.
- `API.md`: every function you write, its exact contract, and the supplied modules.
- `RESULTS.md`: the course's measured numbers on its worked solution, each with the lab
  command that prints it. It gives away answers the lessons ask you to predict, so read
  it after lesson 17.
- `practice.json`: the prediction questions with their answers, which the lab reads on
  your own computer. Leave it unread until you've committed your own answers.
- `public/`: the supplied modules: Lob and its server loop, the network simulation, the
  official client, the legal player models, the cheating clients, the courier arena and
  the trade store, which holds the players' items and coins and can crash between writes.
- `checks/`: the checks. Read them when a failure is unclear.
- `examples/` and `walkthrough/`: the walkthroughs of every lesson. `walkthrough/server/`,
  `walkthrough/detect/`, `walkthrough/courier/` and `walkthrough/trade/` hold the starting
  files of the route that types in the important parts (the `write` route), and `walkthrough/capstone/` lesson 17's new application;
  `examples/` holds the end-of-unit checkpoints, the probes the lessons run and the outputs
  they show. `examples/start-chapter.mjs` makes a new project for lesson 12, and
  `examples/start-unit13.mjs` to `examples/start-unit17.mjs` set up each later lesson inside
  the project you already have. Lesson 17 has no new code: its walkthrough,
  `examples/courier-row.mjs`, reads one row of the scoreboard with the scoreboard's own code.
- `reader/`: the script and stylesheet of the code display some courses use. This course's
  lessons are plain Markdown and read the same without them.
- `recordings/`: the recorded sessions of the searching client's variants (above), for
  lesson 14.

Part one is a separate course and isn't in this copy.

## What it doesn't show

The legal players are models written for this course, and the network is simulated.
A detector that flags none of the model players hasn't been shown to flag no people.
Human learning and the time the course takes haven't been measured.

Passing the checks shows that your code meets API.md's contracts on the checks' cases and
that your defence meets the scoreboard's budgets. It doesn't show that you've learned what
the lessons teach. In a test run before release, an AI agent working from the README,
API.md, the supplied modules and the check output passed every check in about 15 minutes
without opening a lesson. The lessons' reasoning (why each defence works,
what it costs, how a base rate changes what a flag means, how to choose a window against
a budget) is practised in the prediction questions and the lab's measurements, and no
check grades it.
