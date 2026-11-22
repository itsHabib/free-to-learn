# Build a JIT compiler

An order report has six rows. Two large orders appear before a missing quantity. Switch from compiled code back to the interpreter at the wrong row and the receipt lists a sale twice. Build a runtime that can make the switch and show which row it resumed on.

From the Free to Learn checkout, with Node.js 22 or newer and no packages to install:

```sh
cd courses/jit-compiler
node lab.mjs init
node lab.mjs demo --worked
node lab.mjs reader
```

The demo prints the quantities, the correct matching indices, and the exact row at which it resumes. In lesson 03 you’ll diagnose a different run that produces a duplicate. The last command prints a local reading link. You can also open the lessons directly.

| Lesson | What you own |
| --- | --- |
| [01 · Read a program](lessons/01.md) | Evaluate a short sequence of stack instructions against one order. |
| [02 · Compile the predicate](lessons/02.md) | Emit WebAssembly instructions for the same expression and call the exported function. |
| [03 · Switch engines mid-batch](lessons/03.md) | Keep exactly one copy of every matching row when a missing value breaks the compiled path's assumption. |
| [04 · Give compilation a budget](lessons/04.md) | Implement a small decision policy, fit it using local measurements, and compare it with a rule on separate workloads. |

Comfort with JavaScript functions, arrays, loops, and the terminal is enough to start. The course supplies the WebAssembly module envelope, input validation, batch bookkeeping and benchmark harness. The code you implement lives in `work/runtime.mjs` and `work/policy.mjs`. Node's WebAssembly engine handles the final translation for your machine.

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

## Your first check

Before running the check, write what you expect a missing quantity to do. An unfinished starter should print a lesson-specific error.

```sh
node lab.mjs check 01 --predict "My prediction and why" --help-used none
```

Every learner check saves the lesson wording, submitted files, prediction, declared help, and result in a new folder under `work/attempts/`. Re-run the same command after a repair. Copy the entire `work/` folder to keep your code and history. Use relative imports to supplied helpers in `../lib/`. Running `init` again preserves your edits.

For a shorter route, compare one function in [the worked runtime](reference/runtime.mjs) with your own, then try the chapter's mutation and new case. You can use AI for an implementation and record that assistance with `--help-used`. `node lab.mjs demo --worked` and `node lab.mjs race --worked` run the author's code separately.

## Run what you built

```sh
node lab.mjs demo
node lab.mjs race
node lab.mjs race --shift --seed 1203
```

Read the row IDs before interpreting the timings. A wrong receipt invalidates a faster run. Compare the cost of fitting the model once with the measured cost of a whole query using the fitted policy. The winner can change across machines and workloads.

The [live query course](../live-query-engine/README.md) is a second, independent project. Its `compare` command calls the runtime and policy you wrote here to evaluate a real subscription. Both courses use a restricted predicate language over signed 32-bit order quantities and missing values.

The instruction encodings come from the [WebAssembly specification](https://webassembly.github.io/spec/core/binary/instructions.html). For a production comparison, PostgreSQL explains how it weighs compilation overhead against execution cost in [When to JIT?](https://www.postgresql.org/docs/18/jit-decision.html).

The ZIP also runs without cloning. Extract it and run the same commands inside
the extracted course directory. For the shared capstone, extract both course
ZIPs into the same parent directory, or use the full repository clone.

Original code uses MIT and original lesson prose uses CC BY 4.0, with Free to Learn
attribution. See [License](LICENSE.md) for details.
