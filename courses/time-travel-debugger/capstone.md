# Capstone: a fresh diagnosis and a familiar rehearsal

The earlier dispatch.json task is a familiar rehearsal, not an unfamiliar transfer. A dispatch summary starts with four quantities: 12, 9, 6 and 3. The intended report is their sum, but a reviewer reports that the final shipment is missing. programs/dispatch.json is the original program to investigate; its intended loop should account for every listed quantity. Verify the reported symptom rather than assuming it is true. If the program satisfies the stated expectation, report that finding with evidence and propose a different falsifiable explanation for the complaint. A diagnosis is allowed to conclude that the supplied complaint is unsupported.

Your fresh supplied investigation is programs/transfer.json, which the earlier lessons do not assign: it should emit the last value written to cell 5 after a three-visit update loop. It emits a different value. Diagnose this case without a walkthrough. Preserve the original input. Put any proposed repair in a new file and confirm both the observed symptom and the changed result.

Deliver your debugger and a report containing: expected behavior; source/program identity; reproducible commands from a fresh instance; first observed divergence; relevant trace segment and state; causal hypothesis; at least one counterexperiment; corrected-program experiment if appropriate; limits and help used. An unsupported bug claim is a failure even if a patch changes output.

Build one debugging query of your own over the debugger's trace or state. State the question it answers and retain the query, input and reproducible result; explain how the result supports or challenges your diagnosis. A small client helper using existing methods is sufficient.

Rubric: evidence must reproduce; state and event boundaries must be used correctly; cause must explain the symptom; the counterexperiment must distinguish the hypothesis from another explanation; the new query must answer its stated question and contribute evidence to the investigation; conclusions must fit the observations. Alternative valid investigations may use breakpoints, watchpoints or trace search in different orders. Stage 07 only checks debugger behavior, not this report's reasoning.

Finally create a small program of your own with an explicit intended behavior and a plausible bug. Provide its input and diagnosis as a separate investigation. Do not submit author controls or a copied implementation as your work. There is no automated mastery certificate or required model critique.

If you already read the earlier teaching-v3 exercise07b, retain that attempt and treat this supplied investigation as assisted rehearsal. Use a new program of your own for fresh diagnosis practice. The revised exercise does not turn earlier exposed work into an unaided first attempt.
