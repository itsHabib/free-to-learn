# Final investigation: a logger release changes

You receive two original inert captures (`trust/fixtures/capstone-a.efw` and
`capstone-b.efw`), their manifests and signatures, a partial capture, the classroom
public key and `capstone-policy.json`. The names and physical layout differ from
the guided case. Do not read author solutions before submitting your first report.

Create a new attempt using `python3 work.py 007-capstone --from-attempt attempts/006-investigation`.
Adjust the previous attempt name to your actual last revision. Submit `findings.md`
with the following evidence and keep all commands and JSON outputs alongside it.

1. Before inspection, predict whether a higher release number guarantees admission.
2. Use your parser to inventory both captures. Show one header/table/range calculation.
   Map all dependencies and explain a valid dependency-first ordering.
3. Use your analysis to classify additions, removals, content changes and metadata
   changes by component identity. Cite exact fields and distinguish physical order.
4. Verify both raw manifest signatures and capture bindings using your trust policy.
   Name which key was pinned, who published its test seed, and the limit of that trust.
5. Inspect local configuration policy with the Python CLI. Combine that evidence
   with the signature/binding/release results into a reasoned **hold or admit for
   further classroom review**. A pass in the signature command is only one condition.
6. Determine what can be concluded from the partial capture. Preserve its failure;
   do not repair the file to manufacture a complete inventory.
7. Copy capstone-policy.json into your attempt and change minimum_release from
   20 to 22. Predict the result, then point the Python command's --policy option
   at that copy and change the signature command's numeric floor from 20 to 22.
   The commands receive the floor separately. Keep both original outputs and
   both revised outputs under different filenames; compare release-policy fields
   while preserving the signature and capture-binding observations.
8. Write one competing explanation for a change and one observation that would
   distinguish it. State remaining unknowns: author intent, vendor identity,
   actual execution, hardware state and production safety.

An example invocation supplies paths, not an answer:

```sh
cd lab
python3 fwlab.py investigate ../trust/fixtures/capstone-a.efw ../trust/fixtures/capstone-b.efw --old-manifest ../trust/fixtures/capstone-a.json --new-manifest ../trust/fixtures/capstone-b.json --policy ../trust/fixtures/capstone-policy.json --parser ../attempts/007-capstone/parser.py --analysis ../attempts/007-capstone/analysis.py
cd ..
node trust/verify.mjs trust/fixtures/capstone-b.efw trust/fixtures/capstone-b.json trust/fixtures/capstone-b.sig trust/fixtures/lab-public.hex 20 attempts/007-capstone/trust.mjs
```

## Rubric

For each requirement mark **supported**, **revise**, or **missing evidence**, with
the exact output filename and field. Acceptance needs all eight supported, passing
core/trust code checks, a retained first report, later revisions and recorded help.
Open checkers establish behavior on their cases; the prose rubric remains a separate
review. This is a fresh required transfer project, not a secret held-out assessment.
Independent technical review remains separate. Human learning outcomes remain
unverified; no staffed review is required on the learner path.
