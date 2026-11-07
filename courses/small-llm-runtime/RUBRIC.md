# Runtime project review

Review the actual exported runtime, generator and investigation. No staff queue
or model opinion is required. Separate numeric agreement from explanation.

- **Identity and scope:** pin model bytes, configuration, vocabulary and the exact
  supported architecture. Explain which malformed cases are rejected and why.
- **Math and causal structure:** show stable extreme-score behavior, a nonzero
  mean normalization case, a nonuniform attention example and a changed-suffix
  causal check. Distinguish head width from model width in positional rotation.
- **State:** show full-prefix/cached logit discrepancies at several positions,
  model/cache identity validation and an unchanged shared input cache.
- **Generator:** include chosen prompts, seed, controls, IDs, text, stop reason
  and trace. Reproduce the complete result from the exported code. Do not label
  untrained fixture output as pretrained language quality.
- **Consumer delivery:** show a token reaching a consumer before the next decode,
  ordered once-only events and final reconstruction, independent repeated and
  interleaved seeded streams, and a later failure that preserves the prefix
  without normal completion. Replaying a finished generation is insufficient.
  Keep the original prediction/failure and exported consumer evidence. This is
  baseline behavior, separate from cache investigation and beam-search work.
- **Investigation:** retain the first discrepancy, locate the earliest affected
  layer/component, compare valid and faulty cache content, and demonstrate a
  controlled repair with prompt/model/seed held fixed. A component name without
  observed evidence and a mechanism is insufficient. Unresolved causes should
  lead to a discriminating experiment, not certainty.
- **Portability and help:** rerun from a new extraction folder. Preserve source,
  input and original attempt identities and declare chosen assistance. Optional
  LLM advice is a hypothesis; it cannot replace execution results.

Different valid caching layouts or numeric loops are acceptable if adapted to
the public returned format and within tolerance. A runtime that ignores input,
always flags a cache, or returns copied public outputs fails the product goal.
These finite checks do not establish speed, language quality, arbitrary-checkpoint
compatibility, human learning or production suitability.

- **Bounded extension:** deliver your own beamDecode export under API.md. Show
  width 1/greedy parity, full-vocabulary cumulative scoring, global pruning, EOS
  carry, context/token stops, parent-cache isolation and the 13-call bound. A
  copied cache and immutable sharing are both valid. Preserve a wrong score or
  branch-state failure and its repair, with source/tape/settings identities.
- **Transfer evidence:** predict before feedback; select a different short
  positive-weight branching case, enumerate its tiny complete tree independently,
  explain its greedy/beam difference and the limits of pruning. Keep the original
  failure even after repair. Public test expectations and hashes do not prove
  authorship or mastery. Cache auditing or baseline streaming alone do not earn
  this distinct extension. The untrained fixture does not fulfill a pretrained
  model outcome.

## Trained capstone completion

The earlier pocket results remain their own stage evidence. Complete the final
TRAINED.md path with readable learner-owned trained.mjs and trained-project.mjs.
Bind both exact asset identities/notices, binary orientation, BPE/UTF-8 behavior,
grouped-head assignment, token positions, caller-owned cache properties, actual
trained output, consumer delivery, changed-cache diagnosis and bounded search.
Keep predictions before feedback, original failures, declared prerequisite support
and the source/settings/data identities of each controlled repair.

Provide a valid cache control, two chosen prompts, several appended-position
logit comparisons and the mechanism behind the supplied unfamiliar cache fault.
Retain a different predicted consumer/error case and the wrong-control/repair.
Use normal terminal export, fresh extraction, both trained public checks and your
standalone generation/experiment. Keep any custom experiment code in an explicitly
exported source or separate companion; a transcript alone is insufficient.
Do not claim supplied references, author QA or model cards as your implementation.
Fixture passes, tiny-model fluency and one host's CPU measurements have bounded
meanings; no human-learning or arbitrary-model qualification follows from them.
