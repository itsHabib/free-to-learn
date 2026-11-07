# Work from an observation to a reproducible explanation

Your aim is to make a claim that another person can test. A result becomes useful evidence when you retain the input, the command, the observed output and the reason that observation favors one explanation over another.

## Learn a procedure, then use it on your program

Each guided lesson introduces a mechanism, works through a smaller example and asks you to complete or apply the same reasoning. Use Check to see an explanation of your chosen answer. The first answer remains in your practice history when you try again. A later correct answer after feedback is a revision, not an unseen first success.

For text-only practice, each lesson links to a questions-only worksheet and a separate feedback page. Write the first choice and reason in your notes before opening feedback; keep any correction separately. These notes do not automatically import into the browser practice record.

Then open the original project procedure. Its target differs from the worked example. Choose a probe on which two plausible explanations disagree. If both explanations predict the same output, that probe may confirm a calculation but cannot choose between the explanations. Include the inputs and complete prediction before running the target.

## Keep prediction and observation separate

Edit `response.json`, validate its syntax, and use that module's recorder command at the named stage. A successful save creates a new record path. Opening a page, typing an answer or receiving a save error is not a committed prediction. A new `record` command creates a new submission rather than changing the old one.

After the run, retain the exact output, identify the earliest difference from your prediction and explain its consequence. A wrong guess is useful evidence; do not overwrite it with what you now know. When the first implementation passes, challenge a plausible alternative and make a fresh prediction as the project directs. You do not need to manufacture a failed implementation.

Follow each project's assistance categories and describe help accurately. Hints, checker output, other people's code and worked solutions can change what you know. Ordinary lesson teaching and the target's observed behavior are distinct sources; name them when explaining a claim. Keep the versioned whole-course packet because its new guided lessons are outside the older module's manifest. For every project, retain and cite that exact whole-course packet or guide beside your export. M5 and M7 additionally support `--evidence`; use only the syntax shown by that module's `record --help`. The other project recorders do not have this option.

## Diagnose before repairing

Classify the failure first. A missing file or unsupported architecture is a setup problem. Malformed JSON is a save-input problem. A native `refused:` response is a parser outcome, not a valid replay event. A checker disagreement can be a wrong model, missing corpus coverage or changed target bytes. Read the full message before editing the algorithm.

For a real model mismatch, preserve the offending bytes and both outputs. Locate the first contradicted value, propose one change that explains it, save the revised source, then rerun that case and a different case. A successful patch on one input can still encode the wrong rule. The projects' public checkers supply broader finite feedback; retain their exact scope rather than claiming every possible input is correct.

## Back up the work you can actually resume

A useful backup includes the model or decoder, response, raw probes, target manifest and the entire notebook-record directory. Each project gives concrete copy/export commands. Use a new destination; do not clear an old folder to make an export succeed. Compare copied records with the originals and open an older copied JSON file to confirm that its question, response, code and evidence remain readable.

To resume in a fresh extraction of the same version, restore your own working code, response, probes and records. List the records before saving another. Keep the original ZIP beside the export. Changing a course version does not reinterpret an old question or make its original target identical to a new one.

Guided browser practice is a separate notebook: Export practice downloads its original and later checks with the lesson/question identities. Restore it on the matching lesson. Browser storage is a convenience, not the portable backup, and project-code notebooks do not automatically enter that browser export.

## Judge the finished project at the right level

Use the module checkpoint and [capstone handoff](CAPSTONE.md). Check code behavior with the shipped tools, trace factual claims to the actual bytes or instructions, and review the explanation for what follows and what remains uncertain. Passing a public check does not grade arbitrary prose or authenticate assistance. Project 7's public checker covers finite behavior, decoder shape and bounds; its richer private field/behavior assessment is separate and is not included in the learner packet.
