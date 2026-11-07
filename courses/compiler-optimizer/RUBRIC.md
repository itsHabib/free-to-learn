# Investigation and evidence rubric

Use this after committing your first attempt. A mechanical pass and a sound explanation are separate results.

1. **Semantic claim.** Name the preserved return type/value, heap and event behavior. State word width, wrap and signed comparison rules. Do not appeal to a different language's overflow behavior.
2. **Original witness.** Preserve the original source, exact input and faulty pipeline. Both programs are valid and terminate normally with different scalar or heap results. A crash or fuel cutoff alone does not qualify.
3. **Causal diagnosis.** Name the transformation's violated premise and show how the witness exercises it. Distinguish observed facts from hypotheses. A sentence saying only “the outputs differ” is insufficient.
4. **Reduction.** Regenerate the target from each reduced source. Preserve the signature and input contract. Remove irrelevant structure, retain the original witness and name the reduction family and stopping condition. Cosmetic names, SSA spelling and serialization differences are not reductions. U08 also permits a genuine witness-input complexity decrease; U09 requires a structural decrease in its supplied source. Do not call a best-found result globally minimal.
5. **Repair.** Fix or conservatively decline the invalid transformation while retaining a legitimate optimization. Show the original witness fixed, neighboring cases checked and a correct useful scalar win. Disabling every transformation is insufficient.
6. **Evidence limits.** State the exact tested input set, runtime/checker identity and remaining unknowns. Separate model cost from wall-clock performance. Report help and keep first/revised attempts.

An optional reviewer may critique your exported work against this rubric. Any model feedback is advisory. Do not transmit personal data or assume a hosted reviewer exists; the course makes no automatic external calls.

Author QA, source-blind interface trials and human learning studies answer different questions. No local score is a credential or evidence of general compiler mastery.
