# Build a small language-model runtime

Build a CPU decoder runtime in a small original numerical slice, then adapt it to one pinned trained final profile: checked loading, character tokenizer,
stable math, RMSNorm, gated MLP, causal rotary attention, prefill, cached decode,
seeded sampling and explicit limits. Your project delivers generated tokens before completion and audits
an unfamiliar cache discrepancy. The complete supplied numeric backend makes
this course independent of the tensor/autograd course.

## Exact offline route

Use Node 22 or newer; the course was tested on **Node 26.5.1**. Unzip the course ZIP into a fresh directory, then run:

```sh
node lab.mjs serve
node lab.mjs start ./work
node lab.mjs check 01 ./work --help-used none
```

Open the printed localhost address for lessons, practice and a browser code
editor. The initial runtime intentionally fails with TODO diagnostics. Edit
work/runtime.mjs. Module checks accept 01 through 08 or `all`. Create your own
work/project.mjs for the capstone; no capstone implementation is supplied.
In project.mjs also implement the streamGenerate export specified in API.md and
lesson08. The supplied runtime methods are unchanged; the project owns the
consumer-delivery loop.
No install, GPU, learner model download, API key, account or inference bill is needed. The two pinned trained assets are already inside the offline package.
Node executes code with normal local permissions; inspect what you choose to run.

```sh
node lab.mjs status ./work
node lab.mjs export ./work ./my-runtime-project.zip
```

Export refuses to overwrite an existing file. Unzip into another folder and run
`node lab.mjs check all ./work --help-used "exported pocket work"` and `node lab.mjs check trained ./work --help-used "exported trained work"`. Exact source, public
question identity, help and result remain in `.attempts`; first and revised
attempts are distinct. Historical passes are checked against current code and
course identity. Browser workspace JSON preserves its separate history. Restore
validates before saving and retains destination drafts/attempts. If local storage
fails or another tab changed it, execution stops; export before closing.

The runnable export keeps numeric.mjs and spec.mjs beside work/runtime.mjs. Terminal export preserves those declared dependency files from work/ and stops before writing if either is missing. Browser export includes the supplied copies at the same paths. Terminal export also allowlists trained.mjs and trained-project.mjs. Trained checks snapshot an optional regular work/project.mjs beside trained-project.mjs, so importing ./project.mjs uses the same documented sibling route as export. Its source/hash participate in new attempt identity and status. Other local helper filenames are not automatically copied; keep the portable trained experiment inside the documented files. Symlink work/attempt directories or sibling files are refused before snapshot/export. Arbitrary experiment filenames are not collected: keep their inputs and reproduction instructions in data.json and REPORT.md, or preserve them in a separate explicit evidence bundle. After extraction, run your own standalone reproduction command as well as the public checks; the checker supplies its own attempt dependencies, so a check pass alone does not establish standalone portability.

## Original slice and trained end product

PocketDecoder-v1 remains the first numerical exercise: dimension 8, two blocks, two heads,
a 32-character vocabulary, context 32 and a deterministic original untrained 21,661-byte fixture.
Its SHA-256 is 60867dbc492cc5978dfad4cf8a0bfef37f756a186edcdc18c8199db5ed474112.
Those earlier checks teach the mechanisms; their letters are not pretrained output.

The final capstone adapts your own code to one MIT-declared pretrained Stories260K
profile: dimension 64, five blocks, eight query and four key/value heads, vocabulary 512, context 512.
The exact checkpoint (1,056,540 bytes) and BPE tokenizer (6,227 bytes), model/card
identities and full retained notices are under fixtures/trained/. NOTICE.md explains
attribution. No corpus, external inference engine or pretrained training is needed.

Read [Finish the trained runtime](trained.html), also available offline as TRAINED.md.
Use your earlier numerical functions, then implement trained.mjs and your own
trained-project.mjs. Run `node lab.mjs check trained ./work --help-used TEXT`.
The supplied trained-run.mjs launcher calls your implementation for generation,
consumer streaming or bounded beam output. It contains no model/search solution.

New lab start creates a trained TODO beside the earlier module. For an old imported
workspace use `node lab.mjs trained-start ./work`; it refuses to overwrite work.
The ten trained checks and ordinary pocket checks are distinct. The browser editor
and its export keep earlier pocket work; final trained checks/export run from the
terminal. No browser action silently imports your terminal files.

## Checks and scope

Checks print, for each failed case, the requirement, the input, the first
expected/observed difference and the lesson section to reread. Add `--json` after
the help text to print the full machine-readable result instead; every attempt
also keeps it in `.attempts/<id>/result.json`. Exit 0 means agreement on those public cases; 1 means failed criteria;
2 means invalid invocation; 3 means execution error or the five-second process
limit. Reading and practice have no timers. Each module declares its prerequisites. Supplied earlier-layer references let
you practice a later module without completing earlier project code. For example:

```sh
node lab.mjs support 05 ./work
```

This supplies only the earlier dependencies for module 05; its target operations
remain TODO. Your original draft is retained under `.reference-support`, and each
later check records reference assistance automatically. The browser has the same
optional support action. It never creates or replaces project.mjs. Using support
is optional for the learner; supplying it is part of the course contract.

Short readings focus on one mechanism; implementation and diagnosis supply most
of the work.
Human reading/project durations have not been measured.

## Candidate evidence and release boundary

The author scalar oracle is a separate implementation, not an independent reviewer.
Reference and defect controls are source-aware QA, not cold learning measurements.
Actual browser download, browser/terminal parity, rendered desktop/mobile pixels,
keyboard/screen-reader use remain pending independent acceptance. Human
learning outcomes, difficulty and time remain unverified. No site, CI, push, model call or publication is part of this build.
RUBRIC.md guides self-review. PROMPT.md is selectable optional advice for your own
LLM account; no automatic transmission, paid API or staff dependency exists.

Maintainers: `node author/verify.mjs /tmp/runtime-evidence.json` and
`node build.mjs /tmp/runtime-course-stage` from the source course folder. Build
requires a new empty output. A positive file list excludes author implementations,
defect controls, private evidence and learner records. Input, source, per-file
and actual archive identities are recorded separately.

Source-cited programming risks and their later checks are recorded in MISCONCEPTIONS.md and misconceptions.json. Those citations support technical distinctions, not claims about learner prevalence or learning.

Regenerate supplied prior layers after a reference change with `node author/make-support.mjs`, then run `node --test author/support.test.mjs`. Human learning outcomes remain unverified; learner use has no staffed review dependency.

The lesson 08 extension is your own `beamDecode` in project.mjs. It compares
short whole-sequence scores under a width 1..4 and token 1..4 budget; API.md and
the lesson specify the policy. The public checks expose finite synthetic test
expectations. They supply no search implementation and do not replace your
chosen unfamiliar branching example or preserved wrong-control repair.
