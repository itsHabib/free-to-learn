# Milestone 1: explain one tick

A compiled program moves a cart, but you do not have its update rule. Build a Python model that predicts its next state, support the model with native output and instructions, then decide what must change for a second target.

Start in the extracted student bundle, using [setup](setup.md). Keep the [follow-along checkpoints and troubleshooting](follow-along.md) available as you work. All commands below run from that bundle's root. You need Python functions, integer arithmetic, `if` statements and a terminal; no assembly knowledge is assumed. This is one local investigation, not a complete reverse-engineering course.

The deliverable is `model.py` plus saved prediction, model and transfer records. Keep your learner workspace outside the source repository. The recorder preserves new records; it does not grade their reasoning.

## 1. Describe the state

An **integer** is a whole number such as `-3`, `0` or `4`. The cart's **state** is its position and velocity at one moment. Position names a location on a line; velocity is signed movement per tick. Positive movement goes right and negative movement goes left. A **tick** is one update, not a measured second.

The command is an input to that update. You will discover what it does. For now, `cart` is a **black box**: you supply inputs and observe outputs without reading its implementation.

```text
./cart POSITION VELOCITY COMMAND TICKS
```

Use integers in these input ranges:

| Argument | Accepted inputs |
| --- | --- |
| `POSITION` | `-1000` through `1000` |
| `VELOCITY` | `-6` through `6` |
| `COMMAND` | `-1`, `0` or `1` |
| `TICKS` | `1` through `8` |

One invocation repeats the same command for every tick. The JSON output is a list of states **after** each tick, with keys `tick`, `position` and `velocity`. Input limits tell you what the command line accepts; they are not evidence of the internal update rule. Invalid inputs return an error instead of a state list.

## 2. Follow a smaller worked example

First use this different rule for a marker. It is a teaching example, not the cart's hidden rule:

```python
def marker_step(p, v, flip):
    if flip == 1:
        v = -v
    p = p + v
    return p, v
```

Variables hold the current values. An assignment replaces a value; the next line reads its replacement. Starting with `p = 4`, `v = -3`, `flip = 1`:

| Step | Position | Velocity | Why |
| --- | ---: | ---: | --- |
| Read inputs | 4 | -3 | These are the old state. |
| Test `flip == 1` and negate `v` | 4 | 3 | The condition is true. |
| Add current `v` to `p` | 7 | 3 | This line reads the updated velocity. |
| Return | 7 | 3 | The new state is `(7, 3)`. |

The order matters: adding the old velocity would produce a different position. When you inspect the cart, establish its order from evidence instead of borrowing the marker's rule.

**Your short trace:** for this marker only, start with `p = -2`, `v = 4`, `flip = 0`. Put the returned position, velocity and a one-sentence reason in `response.json` under `miniature`. Keep `marker-feedback.md` closed until you save this answer with your first cart prediction.

## 3. Save a prediction before running the cart

Choose a one-tick input within the table's ranges. Write a concrete possible rule in `claim`, and explain why you chose it in `reason`. It can be wrong; “unknown” alone is not a prediction. In `probe`, enter the four arguments and the exact output row you predict. Also state one different rule that this input could distinguish from yours in `alternative`.

For example, a command might choose a velocity, modify a velocity, or change position directly. These are possibilities to investigate, not an announced answer. Choose inputs on which your two possibilities disagree.

`response.json` is a plain-text JSON document. Keys and text use double quotes; numbers do not. Separate entries with commas, but do not put a comma after the last entry. For example, `"claim": "I expect position to stay fixed"` stores text, while `"position": -2` stores a number. Replace the template's empty strings and `null` values with your response; leave unrelated later fields alone. You can check the syntax without changing or grading it:

```sh
python3 -m json.tool response.json
```

If it reports a line/column error, repair the punctuation in your working file before saving. This does not change an earlier recorded attempt.

Save the completed response before running `cart`, reading `cart.asm`, or opening the checkers:

```sh
python3 notebook.py record --workspace work/m01 --stage prediction --response response.json --manifest manifest.json --assistance none
python3 notebook.py list --workspace work/m01
```

Use the assistance you actually had: `none`, `hint-1`, `hint-2`, `hint-3` or `solution`. Use the most revealing level already seen and describe other help in `assistance_details`. A blank template is not a completed prediction. The manifest identifies the exact target files for your record.

After saving the marker trace, open [its separate feedback](marker-feedback.md). Keep that file closed before your first save; even a plain-text reader will then show the question separately from its answer.


## 4. Run a probe and challenge the explanation

Run `./cart` with your saved four arguments. Copy the actual output into `observations` alongside its inputs. Compare each predicted field with the observed field. Write whether the observation supports or contradicts your claim; one matching result can fit several rules.

Change one input at a time for the next probe. Before each run, add its expected result and what disagreement it would resolve, then save another prediction record. Seek evidence about command direction, the effect of the old velocity, repeated ticks and what happens near the accepted velocity endpoints. Do not infer a rule from a single zero input. If choosing probes or following a branch is new to you, [work through this different example](methods.md) before selecting the next cart probe.

Use [the hints](hints.md) if you cannot select the next probe. You may edit the working `response.json`; save each change as a new record and leave the earlier saved records intact.

## 5. Connect output to instructions

**Disassembly** is a readable list of the processor instructions encoded in an executable. An **instruction** is a small operation such as adding values, comparing them or reading memory. A **register** is a small working storage location inside the processor; names differ between processor types. A **branch** chooses which instruction runs next, often after a comparison. Some processors can choose between values without a branch, so a condition need not appear as an obvious jump.

A **load** reads a value from memory into a register. A **store** writes a value back to memory. An argument may contain a value or the address of its memory location. The useful question is which value an instruction reads, not whether a register has a familiar name.

Here is a notation bridge for the supplied ARM64 listing. It is an illustrative memory update, **not** a capture from the cart:

```text
ldr w8, [x0]       // read a 32-bit value at the address held in x0
add w9, w8, #1     // add the immediate (literal) value 1
str w9, [x0]       // store that result at the same address
```

If the memory value starts at 4, the first line puts 4 in `w8`, the next puts 5 in `w9`, and the last leaves 5 in memory. `x0` holds an address, not that memory value. `xN` is a 64-bit register; `wN` names its low 32 bits. A destination appears first. Brackets mean “memory at this address”; `#` marks a literal, and `0x` introduces a hexadecimal number.

In this compiled function the first two arguments, `x0` and `x1`, are addresses of the position and velocity; the third, `w2`, is the command value. This argument convention is supplied scaffolding, not something you have already inferred. `sp` is the stack pointer, and `[sp, #0x10]` is a temporary slot 16 bytes from it. Stores of an address and loads through that address are different operations. `mov` copies a literal or register value into its destination. `mul` multiplies; `add` adds; `sub` subtracts. `adds` and `subs` also set condition flags: a record of the arithmetic result that the next conditional branch reads. A later `b.le` follows a signed less-or-equal result and `b.ge` follows a signed greater-or-equal result; plain `b` jumps unconditionally. These conditional branches test the preceding flags, not their jump-address operand. Follow the address shown on the taken branch. `ret` returns to the caller. Use these facts to build your table; you do not need to memorize register names.

Open `cart.asm` in a text editor and search for `lab_step` (some platforms show `_lab_step`). This function performs one update. The rest of the program handles arguments and printing. The supplied names are intentional help.

Trace one of your observed one-tick runs through that function. In `static_evidence`, record instruction addresses or quoted lines for:

1. Where the old state and command enter the calculation.
2. Arithmetic or comparisons that affect a returned value.
3. Which value feeds the position calculation, and where each result is stored.

Use a small table with “instruction or address / value before / value after / what this supports.” You do not have to translate the entire executable. If a line is unclear, label it uncertain and design a native probe that could resolve the question.

There is also a [Ghidra route in setup](setup.md): import this same `cart`, analyze it, find `lab_step` and compare its listing and decompiled view with your trace. **The Ghidra route has not been executed for this milestone.** Use the supplied assembly route here; report a missing symbol, tool or import failure instead of claiming a completed Ghidra analysis. A decompiled view is a tool's reconstruction, so support its interpretation with the listing and native output.

## 6. Implement and save the model

Complete `step(p, v, c)` in `model.py`. It must accept one valid input state and command, return a pair of integers `(new_position, new_velocity)`, and match **one** cart tick. Return signed values. Do not print, invoke `cart`, read files or keep state between calls. The caller supplies the old state every time.

Before running a checker, update `response.json` with your rule, supporting observations, static evidence and any change from the first claim. Save the code with it:

```sh
python3 notebook.py record --workspace work/m01 --stage model --response response.json --manifest manifest.json --assistance none --artifact model.py
python3 check_basic.py
```

Use your actual assistance level in the record command. The basic checker exposes two ordinary cases after your attempt. It reports inputs, expected state and actual state if they differ. It does not test every command, endpoint, repeated tick or explanation.

On a failure, compare the named case with your own instruction trace before editing. Record what the mismatch changes in your explanation, revise the code and save a **new** model record. After these basic checks, the wider public check is:

```sh
python3 check_model.py model.py --target baseline
```

The wider check includes the named cases plus 24 generated public probes. You can choose another set with `--seed 41`; the seed is visible, not a held-out exam. A lookup table that fits a few displayed cases is not an explanation of the update.

Both checkers execute your Python code locally. They are not sandboxes; run only code you wrote or trust. Passing public checks supports the model on those cases. It does not show that your reasoning is sound or measure independent mastery.

## 7. Decide whether the model transfers

Keep the baseline model. The second executable, `cart-transfer`, accepts the same command-line interface. Its behavior may differ. Your task is to decide whether the baseline model can be reused, must change, or still lacks enough evidence.

Before running the second executable or opening `cart-transfer.asm`, record a predicted output from your baseline model for a probe **you select**, and state why that probe could reveal a difference. Set `probe.target` to `cart-transfer`, then save:

```sh
python3 notebook.py record --workspace work/m01 --stage transfer --response response.json --manifest manifest.json --assistance none --artifact model.py
```

Do this part without the hints or source solution; record assistance if you use any.

Then investigate the new target. Use your own probes and its `lab_step` listing. Preserve the original baseline code by putting any new implementation in `transfer_model.py`. Explain each proposed change with a native observation and an instruction reference; “the checker passed” is not an explanation.

Finally, choose a start state and a command for a run of several ticks that you have not used while fitting the transfer model. Predict the complete state list, save it with `--stage transfer` and `--artifact transfer_model.py`, then run that exact native case. Remember that an invocation keeps its command constant; its internal later states need not be valid starting arguments for a separate invocation.

You can check your new model after saving the attempt:

```sh
python3 check_model.py transfer_model.py --target transfer
```

In `transfer_decision`, state your decision, the most useful counterexample or confirming probe, and one remaining uncertainty. Save the observed result as a new transfer record. This is practice on a fresh artifact, not evidence of broad reverse-engineering ability.

## 8. Investigate a different control structure

The second target gives practice with changed arithmetic. Continue to [the crossing investigation](crossing.md), where a third target asks you to identify when a different control path runs. Keep both earlier models. You will build `crossing_model.py`, save competing predictions, and test a new multi-tick forecast. Its separate hints remain optional.

## Keep or deliberately reveal your work

The milestone's evidence is a first prediction, observed results, saved models with instruction traces, a recorded repair if needed, and fresh transfer predictions checked against native output. Complete the crossing investigation before treating this milestone's learning path as finished. `notebook.py list` shows the retained records. Keep them with the bundle's manifest so later work can be tied to these exact targets. This is a learner artifact checklist, not a claim that the course's human, tool and accessibility acceptance gates have closed.

The repository's `courses/re-lab/solutions/01-cart.md` and `courses/re-lab/source/` are deliberate answer-reveal material, omitted from this student bundle. After committing an attempt, you may request them for a walkthrough. Save later work with `--assistance solution`; it remains useful assisted practice. No score or tool blocks you from moving on.
