# Milestone 1 follow-along checkpoints

This companion helps you tell whether a step worked and how to recover. Use it with `START-HERE.md` in the student bundle. It supplies no cart rule. Save your own attempt before opening a worked solution.

## Before the first command

Use the Mac ARM64 bundle on an Apple Silicon Mac. You need Python 3 for the notebook and model, a terminal, and a text editor. Ghidra is a separately documented route, still unverified for this milestone. Do not install it to solve a problem with one of these basic commands.

Open a terminal in the **extracted bundle folder**. A quick location check is:

```sh
ls START-HERE.md crossing.md manifest.json cart cart-transfer cart-crossing model.py crossing_model.py response.json
python3 --version
```

If a file is missing, you are in the wrong directory or the archive was not fully extracted. Move into the extracted folder and repeat the check. If you see `Exec format error`, stop: the executable does not match your platform. If you see `Permission denied` for a verified executable, restore the executable bit with `chmod u+x cart cart-transfer cart-crossing`; this only changes those three local files. Do not bypass an OS security warning.

## Checkpoint A — the starter has valid Python syntax

The starter intentionally has no rule. Before your prediction, check only that Python can read its syntax:

```sh
python3 -m py_compile model.py
```

Success produces no output. This command compiles the file without calling `step`; it does not show that the rule is implemented. If it reports a syntax error, restore the unchanged starter from your bundle. Save your first prediction before running either checker: their feedback reveals expected states.

## Checkpoint B — your first prediction is retained

Follow the lesson's marker trace and first cart prediction. Fill `response.json`, check its JSON syntax, then save with the command in the lesson. The success message names a newly created file under `work/m01/`. List it:

```sh
python3 notebook.py list --workspace work/m01
```

Open the saved JSON in your editor. It contains the original response, assistance, full lesson wording and target manifest. If the save says `Not saved`, fix the reported input or storage problem and retry. A failed save must not be counted as a committed prediction. Do not delete earlier records or replace them with a corrected answer.

## Checkpoint C — evidence and a model, then feedback

Run only the native probes you chose and recorded. Compare their output with your prediction, then inspect the matching assembly. Complete `model.py`, save it with `--artifact model.py`, and run the two public checkers. A mismatch names the input, observed native state and your model's state. Decide which part of your explanation that case contradicts before revising.

If you run the checkers on the unchanged starter at this point, both should report that `step` is unfinished. The wider check should also point back to section 6 of the lesson. That expected failure shows that an empty implementation is rejected; it does not count as a completed model.

Save the revision as another record. The old record must still appear in the list. If Python reports syntax or import errors, repair those before interpreting the result as a wrong cart rule. The [baseline worked walkthrough](https://github.com/itsHabib/free-to-learn/blob/main/courses/re-lab/solutions/01-cart.md) is an optional, explicit answer reveal; record `--assistance solution` if you open it. It does not contain the changed-target solution.

## Checkpoint D — changed-target practice

Keep `model.py` unchanged and write any changed model in `transfer_model.py`. Predict a distinguishing case before running the changed target. Save the prediction and later actual result separately. Passing its public checks shows agreement on those cases; it does not show that the checker judged your instruction trace or explanation. The lesson asks for both.

A maintainer's named checkpoints are indexed separately in the source repository. The baseline and changed-target implementations are worked solutions, not hidden learner work or files the student runtime imports.

## Checkpoint E — explain a different control path

Open `crossing.md` after the earlier models. Save two competing rules and their predicted observations before running `cart-crossing` or its checker. The deliverable is `crossing_model.py`, instruction evidence, and a fresh multi-tick forecast. Use `--stage challenge` to keep these attempts separate from earlier transfer practice. The [methods example](methods.md) explains how to select a discriminating probe without giving this target's rule.

After saving the model, run `python3 check_model.py crossing_model.py --target crossing --ticks 4`. A failure at a later tick means the first update may match while its resulting state leads to a later disagreement. Check the reported tick in your saved forecast before changing the code. Preserve the failing implementation and any repair as different records.

## Checkpoint F — copy, resume and inspect

Stop before changing branches or replacing a bundle. Copy the entire `work/m01/` directory, your model files and `manifest.json` to a separate backup location you choose. Those files are your export; they are not uploaded by these tools. Keep private responses outside Git.

Open the copied record and confirm its original response and source snapshot are present. To resume, use a copy of the **same bundle**, restore your files, and point `notebook.py list --workspace` at the restored work directory. Make the next save as a new record. The earlier records and IDs should remain unchanged. If you upgrade the bundle, keep its old copy and manifest so you can distinguish the two targets.

## What to send with a bug report

Include the milestone version, OS/architecture, Python version, command, exit/error text and relevant target hashes. Share a minimal synthetic example rather than private notes. Do not include a full notebook containing information you do not want to disclose.

This route remains a foundation under development. Native Ghidra use, complete accessibility and first-time human follow-along acceptance are still open gates.
