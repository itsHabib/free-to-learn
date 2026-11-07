# Sources and status

The course code, kernel examples, prose and control specifications were created originally in this task. No existing course source, private answer key, paid book chapter or third-party routine was copied. No new public redistribution license is chosen by this local candidate.

Conceptual references:

- [LLVM Language Reference](https://llvm.org/docs/LangRef.html): SSA well-formedness and precise instruction semantics.
- [LLVM Alias Analysis](https://llvm.org/docs/AliasAnalysis.html): conservative alias distinctions.
- [LLVM Loop Terminology](https://llvm.org/docs/LoopTerminology.html): natural-loop and canonical-form concepts.
- [LLVM Undefined Behavior](https://llvm.org/docs/UndefinedBehavior.html): why LLVM's UB assumptions must not be imported into this defined-trap IR.
- [Necula, Translation Validation for an Optimizing Compiler, PLDI 2000](https://people.eecs.berkeley.edu/~necula/Papers/tv_pldi00.pdf).
- [Lopes et al., Alive2, PLDI 2021](https://web.ist.utl.pt/nuno.lopes/pubs/alive2-pldi21.pdf): bounded validation and its limits.
- [LLVM reducer documentation](https://llvm.org/docs/CommandGuide/llvm-reduce.html): explicit interestingness testing.

These are citations, not compatibility claims. Kernel IR v1 is an original smaller language with defined traps, no UB/poison and no floating point. It does not implement Alive2 or use an SMT solver.

The nine-unit scope is authorized for local construction. Independent exact-artifact review, rendered browser/phone/accessibility checks, first-time human tryout, permitted integration, explicit publication and verified Free to Learn delivery remain separate pending stages.
