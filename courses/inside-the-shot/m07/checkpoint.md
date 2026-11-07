# Pause and inspect the investigation

This is a self-review checkpoint, not an automatic pass. An incomplete investigation can be saved and resumed without a score.

Before the first native run, your saved record should contain two hypotheses and a prediction distinguishing them. Before the first checker run, keep the first decoder/model source and a field table with offsets, widths, signedness, bounds and the observation supporting each row. If a fact was supplied in the lesson, call it supplied rather than discovered.

At the baseline checkpoint, another person should be able to replay at least six selected probes from saved raw bytes and commands. Include ordinary, exact-boundary, one-above, repeated-slot and post-rejection cases, plus malformed length controls. The explanation must distinguish parser refusal from a rejected event. A list of commands without their predictions, outputs and interpretations is incomplete.

At the call checkpoint, explain one decoded entry, its state pointer, one guard and state update, one rejection path and the returned acceptance value. Give actual values and addresses from your listing. Do not confuse stack displacements, the on-disk layout and the state layout. The optimized comparison needs one changed representation and its unchanged behavior, rather than a guessed source reconstruction.

At transfer, retain a prediction before the first atomic run. Explain event versus published state, an all-accepted control and a rejection followed by a later event. If a counterexample changed the model, keep the original source, input, failure, repair and regression result. If none did, explicitly challenge a plausible wrong explanation; do not fabricate a failure.

At handoff, commit one unseen combined case before execution, compare both modes, and export with a manifest and readable old records. Name assistance and limits: finite checks, supplied facts, unknown source details, untested platforms and lack of an independent human trial. Someone else must assess whether the evidence supports the claims; the recorder does not do that judgment.
