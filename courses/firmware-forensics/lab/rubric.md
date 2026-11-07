# Self-review rubric

Your parser and graph are learner-owned in this milestone. Code checks are necessary but not a certificate of understanding. Mark each item
**supported**, **needs revision**, or **missing evidence**, and cite a saved file.

1. **Boundary correctness:** explains one structural rejection versus one
   structurally valid integrity failure, with the exact command and finding.
2. **Change reasoning:** correctly distinguishes byte changes, metadata changes,
   additions, removals, and a physical reorder with unchanged logical contents.
3. **Trust discipline:** states that matching hashes do not authenticate origin;
   never labels a graph declaration an observed boot trace or local policy a
   vendor authorization. Does not infer an attacker from a benign fixture.
4. **Traceability:** keeps first failure, later revision, source digest, fixture
   identity, commands, output, and help used. Reruns changed source.
5. **Changed requirement:** predicts and then reproduces the higher release-floor
   result, without altering the supplied fixture or erasing prior output.
6. **Limits:** names missing signature verification, roots, measured-boot evidence
   and platform tests; avoids claims of full UEFI/hardware security assessment.

For observable correctness, require 49/49 parser checks, 31/31 analysis checks,
6/6 unfamiliar-input integration checks and the 5-test supplied-scaffold suite. For reasoning, require evidence for all six items; a plausible paragraph
without runnable commands is not enough. No staffed review is promised.

## Optional learner-owned LLM critique

> Review only the code, commands and outputs I supply. Separate my parser, inventory, dependency-map, analysis
> functions and findings from the supplied data classes, CLI and fixtures. Challenge one incorrect
> trust inference, ask me to diagnose a failing case and change a policy requirement,
> and request a fresh executed result. Label suggestions unexecuted until I rerun
> them. Do not pass me for confident prose or your own praise. Identify missing
> evidence using the six-item rubric; do not invent signatures, boot execution,
> permissions, or authenticity from hashes.

No account, API key, paid inference or LLM is required. Record any help in the
attempt's `help.json`; critique does not replace deterministic checks.
