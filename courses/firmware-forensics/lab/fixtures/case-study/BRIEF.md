# Case bridge: laboratory sensor-board release comparison

You receive two **original inert EDUFW1 teaching captures**, their matching local
manifests, a local policy, and a third partial capture. Nothing here was obtained
from a real device or vendor. The names/layouts differ from the guided walkthrough.

## Your deliverables

Use your parser and analysis, not a supplied reference. Preserve commands, both
source hashes, input hashes, outputs and `findings.md` in a new attempt.

1. Inventory both complete captures. Explain one absolute offset and range using
   the raw field layout. Do not mistake table order for physical payload order.
2. Map the declared dependency graph; explain an ordering and any limitation.
3. Classify every component as added, removed, byte-changed, metadata-changed or
   unchanged, with precise supporting fields.
4. Compare observed configuration values against `policy.json`. Distinguish
   matching internal hashes, manifest consistency, local policy and unknown origin.
5. Determine whether `capture-partial.efw` can be inventoried safely. Do not patch
   its length or suppress an exception to produce a plausible report.
6. Copy policy into your attempt, raise `minimum_release` to 12, predict the effect
   on capture A, then execute and explain it without replacing your first output.

Example intake command (replace the parser path with your own attempt):

```sh
python3 fwlab.py inspect fixtures/case-study/capture-a.efw --manifest fixtures/case-study/capture-a.json --policy fixtures/case-study/policy.json --parser attempts/003-analysis/parser.py
```

Use `investigate` with capture A/B, their manifests and this case's policy. Use a
new extraction directory if you inspect configuration text. Try the analysis
before opening the integration check's expectations, then run the README's
`check_investigation.py` command and revise in a fresh attempt if necessary.

## What not to infer

This task cannot identify an actor, authenticate vendor approval, establish actual
boot behavior, verify a signature or certify firmware safety. Distinguish observed
facts from hypotheses and missing evidence. A passing six-case integration check
does not grade the written explanation and is not full-course certification.
