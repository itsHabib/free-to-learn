# 7. Break, repair and defend the boundary

**Goal:** produce a reproducible investigation that connects a specific false promise, a controlled witness and a useful repair.

Prerequisites: portable modules 1–4 and 6. Native confinement remains unassessed.

## 7.1 Choose a discriminating counterexample

Run `check core` from a fresh preserved attempt. Choose a boundary you initially got wrong and return to that first source snapshot. Name the claim, the fixture, the expected observation and the actual observation. A helpful witness is small enough that you can explain why it discriminates the flawed rule from the intended one.

Do not change the implementation and the test input simultaneously and then attribute a different outcome solely to the repair. Preserve the original witness and add new cases separately. If the witness only hits a physical backstop, state that; do not relabel it as the policy denying an operation.

Worked sibling: a validator accepts an invalid final fallthrough. The runtime then stops with `PhysicalGuard`. After repair, the same program is rejected before step zero, while a valid looping program is still admitted. Those two observations support an admission repair. A screenshot showing the runtime no longer crashes would be much weaker.

## 7.2 Keep useful behavior

The public runtime checks include identity and negative filters, an empty input and a full default tile. These prevent broad refusal from looking like a secure repair. Add a different valid program or grant layout to your own regressions. Explain why it is valid under the published contract rather than merely “something my code accepts.”

A passing public suite is evidence about those cases. It is not proof over every instruction sequence, every range or every grant table. Strengthen it with an argument about the rule itself: what remains true at admission, at a memory operation, at a broker call, after a budget transition and at publication?

Run all practice groups, including `transfer` only when you are ready for module 8. Keep the source, prediction, observed result and revised explanation bound together. A source hash from the first attempt must not be attached to the latest implementation's result.

## 7.3 Deliver an assurance dossier

Create `report.md` in your final attempt directory with these five parts:

1. **Model:** attacker controls, trusted components and excluded claims.
2. **Violation:** original false promise, smallest retained synthetic witness and actual observation.
3. **Repair:** why the changed rule eliminates that violation, including boundaries and arithmetic.
4. **Useful controls:** at least one independently chosen permitted case and its expected output.
5. **Limits:** untested cases, assistance, physical backstops and the missing native Linux evidence.

Attach the earlier attempt ID instead of rewriting its explanation. A reviewer should be able to reproduce the current attempt from its source snapshot and inspect how your reasoning changed.

The rubric is descriptive: scope, mechanism, discrimination, useful repair and transfer are supported, need revision or are not assessed. A different correct implementation is acceptable. Matching an instructor's code shape is not a requirement.

**Checkpoint:** the portable suite passes for your implementation, your dossier identifies its exact source and raw results, and a second reader can tell which claims remain unsupported. This is a portable project milestone. It is not a native sandbox certification or full course completion.

**Fresh application:** another team hands you a report with an impressive number of passing cases but no source identity and no valid positive controls. Write the two most informative follow-up requests and explain which possible false conclusion each would address. Do not merely request “more tests.”
