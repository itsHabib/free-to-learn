# Milestone 1 challenge: explain a structural change

Complete the baseline and `cart-transfer` practice first. You now have models that can be reused or revised. This challenge asks whether that familiar kind of revision is enough for a third target. Your decision must come from evidence.

`cart-crossing` is another original local toy. It accepts the same `POSITION VELOCITY COMMAND TICKS` arguments and ranges as `cart`, repeats one command, and returns the same JSON state rows. Its one-tick function is still named `lab_step`. The target's name is not a specification of its behavior.

Keep `model.py` and `transfer_model.py`. Your new deliverables are `crossing_model.py` and saved `challenge` records: two candidate rules, predictions, native observations, an instruction trace, an attempted model, any repairs, and a fresh multi-tick forecast. Use the existing `response.json` fields below; each save preserves a new copy. Work from the extracted bundle's root.

## 1. Make the old assumptions visible

Read [the probe and tracing method](methods.md), including its different dispenser example. In your baseline model, a change in starting position shifts the returned position by the same amount without changing returned velocity. That is a consequence of your model, **not** a promise about this target.

Write your best candidate rule in `claim` and a different plausible rule in `alternative`. Give enough detail to calculate a returned position and velocity for both. You might retain a previous model, alter its arithmetic, change its order, or propose a different decision. Do not simply label them “same” and “different.” In `reason`, name the old assumption you intend to test.

Choose a one-tick input on which your candidates disagree. Set `probe.target` to `cart-crossing`, put the four integers in `probe.args`, and put your claim's exact predicted row in `probe.predicted_rows`. Put the alternative's predicted row and why they differ in `probe.distinguishes`. Keep `observations` empty until you run it.

Before running the new target, reading its assembly or opening its checker, save:

```sh
python3 -m json.tool response.json
python3 notebook.py record --workspace work/m01 --stage challenge --response response.json --manifest manifest.json --assistance none --artifact crossing_model.py
```

The starter is deliberately unfinished. Saving it now preserves the starting point, not a correct implementation. Replace `none` with the highest assistance you have actually used. List the records and confirm the new file exists before proceeding.

## 2. Choose evidence, not just more outputs

Run your saved case, substituting its four integers:

```text
./cart-crossing POSITION VELOCITY COMMAND TICKS
```

Add the actual rows to `observations` beside their inputs. Say which candidate each field supports or contradicts. If both candidates fail, retain that result and propose a third explanation.

For each next run, save its prediction first. Begin with one tick. Include a pair with the same starting velocity and command but different positions; this tests the position assumption above. Also choose a pair that changes just velocity or command. Explain what each pair can distinguish. Do not run a large grid before writing down what a useful difference would mean.

If nearby inputs produce different kinds of outcome, find the boundary. Predict a case on each side and the exact boundary value. “Below” and “at” may follow different paths. A rule that fits ordinary movement can still be wrong there. If you see no difference, record that limitation and try a probe selected to challenge your current rule.

Stuck selecting a probe? The separate [ordered hints](crossing-hints.md) offer increasing help. Record the highest level seen and describe other help in `assistance_details`.

## 3. Explain a path through the instructions

Open `cart-crossing.asm` and find `lab_step`. Use the instruction vocabulary in the first lesson. Trace one ordinary observation and one that best distinguishes your candidates. Record this in `static_evidence`:

- instruction addresses or exact lines, with the input values they read;
- arithmetic results and comparisons that affect the selected path;
- which values finally become position and velocity.

The supplied ARM64 listing adds three useful spellings. `tbz w8, #0x1f, ADDRESS` tests bit 31 of `w8` and jumps to `ADDRESS` if that bit is zero; `tbnz` jumps if it is one. A bit is a binary digit, and bit numbers start at zero; hexadecimal `0x1f` is decimal 31. For a signed 32-bit integer in two's-complement form, bit 31 distinguishes negative values from zero or positive values. Thus a register holding `3` has that bit clear, while one holding `-3` has it set. These instructions test the named register directly, rather than the condition flags described in the first lesson. First find which value the register holds at that point. [Arm's instruction reference](https://developer.arm.com/documentation/ddi0602/2026-03/Base-Instructions/TBNZ--Test-bit-and-branch-if-nonzero-)

`wzr` is a special register that reads as zero. For example, `str wzr, [x9]` writes a 32-bit zero to the memory address held in `x9`; it does not change the address itself. This notation explains the operations, not which cart values they affect. [Arm's register reference](https://support.arm.com/documentation/dui0801/l/Overview-of-AArch64-state/Registers-in-AArch64-state)

Distinguish an old input from a value calculated during the tick. If several tests select a path, trace every relevant test; one matching comparison is not an explanation of the whole path. Consult the compound-condition example in `methods.md`. Mark uncertain instructions and name a native probe that could resolve the uncertainty. Do not count a checker result as instruction evidence.

## 4. Build, forecast, then check

Complete `step(p, v, c)` in `crossing_model.py`. It returns one pair of integers after one tick. It must not print, call the native target, read files or retain state between calls. Explain why each part of your rule exists. Save the attempted code and reasoning with the `challenge` record command above before feedback.

Now choose a fresh run of three to eight ticks that you have not used to fit the model. Keep its command constant. Calculate **every** row by feeding each returned state into the next tick. Put the prediction and inputs in `probe`, explain why this sequence challenges your rule, and save again before running it. Compare the entire native result, not only the last position.

After preserving the forecast and observed result, run:

```sh
python3 check_model.py crossing_model.py --target crossing --ticks 4
```

The checker executes your local Python; it is not a sandbox. Use only your own or trusted code. It compares behavior on public cases, including generated ones. With `--ticks 4` it compares four consecutive states and names the first mismatching tick. It does not assess your explanation or establish broad RE skill.

If a case fails, retain the failed model record. In `revision`, identify the first place your predicted values or path disagree with the evidence. Revise your explanation and model, then save a new record before checking again. Avoid a special case keyed only to the displayed test input. If all checks pass, still examine your trace and counterexamples for an unsupported assumption.

## 5. Hand off an explanation someone can test

In `transfer_decision`, state what you reused, what you changed, the strongest evidence rejecting an alternative, and one remaining uncertainty with a proposed next probe. Include the boundary and fresh multi-tick evidence. A claim such as “only the constants changed” must explain all your observations, not just an ordinary case.

Your challenge handoff contains:

1. A saved prediction preceding target output, including both candidate outputs.
2. Paired probes, a boundary investigation, and their observed results.
3. Instruction evidence for two informative paths.
4. Saved attempted code, feedback and any revised code.
5. A fresh multi-tick forecast, its comparison, and your transfer decision.

Use `python3 notebook.py list --workspace work/m01` to inspect the record list. Copy the entire `work/m01/` directory, all three model files and `manifest.json` to your chosen backup location. Keep the same bundle with them for resume; these local tools upload nothing. Preserve assistance and the earlier baseline/transfer records. The source repository's `solutions/03-crossing.md` is an optional answer reveal after your attempt, outside the student bundle.

This completes a challenge submission, not course acceptance. Technical checks, independent reading, supported-platform rehearsal and the unresolved acceptance gates still apply.
