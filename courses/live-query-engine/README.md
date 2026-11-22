# Build a live query engine

Open two terminals. Keep a list of open orders in the first. Ship an order in the second and watch its ID disappear from the first. The tricky part is making that happen exactly once, even if the shipment arrives halfway through the initial scan.

From the Free to Learn checkout with Node.js 22 or newer:

```sh
cd courses/live-query-engine
node lab.mjs init
node lab.mjs reader
```

The reading link opens locally. Lesson 01 asks you to predict the first snapshot and then run the demo. Start with JavaScript objects, arrays, Maps, and terminal commands. The supplied store retains an immutable history of commits in memory. You implement the subscription over it.

| Lesson | What you own |
| --- | --- |
| [01 · The first snapshot](lessons/01.md) | Attach rows and their revision to one point in history. |
| [02 · Enter, update, leave](lessons/02.md) | Turn a committed edit into exactly the notification a subscriber needs. |
| [03 · Keep the view live](lessons/03.md) | Catch up from a cursor and compare the live result to a fresh scan. |

`node lab.mjs init` creates `work/runtime.mjs`. Edit that file. Use `node lab.mjs check 01 --predict "My prediction and why" --help-used none` to retain each attempt and its result in `work/attempts/`. A new learner's first check should fail. You can also read a function from [the worked implementation](reference/runtime.mjs), or use AI and declare its help. Each lesson asks you to change something and predict its effect. Copy `work/` to keep your work.

## Keep your project on GitHub

Use a fork or a writable course checkout. Run the setup once on the first machine. After working on a lesson, run these commands from this course directory to save your implementation on your branch:

```sh
git add -- work/
git diff --cached --name-only -- work/
```

Read the list. If it contains the source you want to share, commit just this course’s work and push your branch:

```sh
git commit --only -m "Build my first course milestone" -- work/
git push -u origin HEAD
```

Git picks up top-level `.mjs` files in `work/`, including helpers you import. Keep private notes and run outputs in a subdirectory. For lesson checks, put imported learner helpers alongside `work/runtime.mjs` as top-level `.mjs` files. The checker copies those modules into a fresh directory for each attempt. The supplied helpers in `../lib/` remain available there. Predictions, attempt snapshots, generated readers and local run data stay ignored. On a second machine, clone your fork at the branch you pushed and continue from the existing `work/` directory. You can run the same lesson check there immediately.

Each chapter has one optional AI coach prompt. Expand it when you want a partner for a prediction, trace or experiment. The starter and checks also work entirely offline.

## Watch it live

Run these from the course directory in **terminal one** after implementing the three units. Use `--worked` to try the complete author example before starting.

```sh
node lab.mjs watch --all --dir work/first-shift
```

In **terminal two**, also from the course directory:

```sh
node lab.mjs put rush 45 --dir work/first-shift
node lab.mjs ship rush --dir work/first-shift
```

Look for an `enter` and a `leave` for the same ID at consecutive revisions. Press Ctrl-C in the first terminal. Reuse the directory to resume from its latest snapshot, or pick a fresh directory to start over. Without `--all`, the watch selects open orders with a known quantity greater than 30. Change one order from 29 to 31, then 40, then 30 to discover three different notifications.

The file adapter passes committed transactions between local processes and retains them until you remove the run directory. It models a shared log on a filesystem that supports hard links. Power-loss recovery, arbitrary SQL and remote clients are outside this lab's contract.

## Plug in your own compiler

The supplied scanner lets you complete the course independently. For the shared capstone, finish [Build a JIT compiler](../jit-compiler/README.md) and run:

```sh
node lab.mjs compare
node lab.mjs watch --jit --model --dir work/first-shift
```

`compare` fits the local decision model, opens a 4,096-order view, changes orders across three commits, and exercises both a fixed rule and your learned policy. Every resulting view is checked against a fresh scan and every notification is checked against the independently computed difference between snapshots. The terminal prints the number of calls choosing each path. The separate JIT race lets you test a different seed. `compare --worked` runs both author implementations.

For the real database problem behind the exercise, see the description of exported snapshots in the [PostgreSQL logical decoding manual](https://www.postgresql.org/docs/18/logicaldecoding-explanation.html).

The ZIP also runs without cloning. Extract it and run the same commands inside
the extracted course directory. For the shared capstone, extract both course
ZIPs into the same parent directory, or use the full repository clone.

Original code uses MIT and original lesson prose uses CC BY 4.0, with Free to Learn
attribution. See [License](LICENSE.md) for details.
