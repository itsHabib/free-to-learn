// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'approved-package',
    question: 'The release is supported, every required path is observed once, and every complete hash matches:',
    answer: "Return {ok:true,reason:'verified'} when the reference and inventories are well formed.",
    reason: 'A supported release, exact path set and equal full digests satisfy the stated comparison. This result concerns the supplied observation of the explicitly listed files.',
    source: 'LEARNER.md#decide-in-order',
    freshVariant: { question: 'An approved inventory lists engine.mjs then rules/movement.mjs. A well-formed observation lists those paths in reverse order and uses uppercase hex letters for the same hashes. Does either difference require refusal?' },
  },
  {
    id: 'changed-bytes',
    question: 'The release string is unchanged, but `engine.mjs` now has different bytes:',
    answer: "Return {ok:false,reason:'digest'} when engine.mjs has a different well-formed observed hash and the earlier checks pass.",
    reason: 'A release label does not approve changed bytes. Matching path names and support cannot cancel an unequal complete digest.',
    source: 'LEARNER.md#follow-one-comparison',
    freshVariant: { question: 'A copied package has only a comment added to engine.mjs. Its release label is still supported and every path is present. Which phase should refuse it under the old approved manifest, and why?' },
  },
  {
    id: 'approved-update',
    question: 'A supported new release has changed bytes and a separately approved manifest for those bytes:',
    answer: "Return {ok:true,reason:'verified'} if that new manifest is valid and its exact observed inventory and hashes match.",
    reason: 'Compare a release with its own independently approved reference. New bytes are not automatically invalid, and a supported name alone is not enough to approve them.',
    source: 'LEARNER.md#follow-one-comparison',
    freshVariant: { question: 'A reviewed update has a matching manifest and observed inventory, but its release string has not been added to supported. Which refusal takes precedence, and what separate approval is missing?' },
  },
  {
    id: 'extra-file',
    question: 'Every approved file matches, but there is one extra observed runtime file:',
    answer: "Return {ok:false,reason:'inventory'}.",
    reason: 'The compared inventory must contain exactly the approved path set. Matching all required digests does not authorize another observed runtime file.',
    source: 'LEARNER.md#decide-in-order',
    freshVariant: { question: 'The manifest lists engine.mjs and admission.mjs. Observation contains engine.mjs only, with its correct digest. Which result applies before digest equality could establish a verified package?' },
  },
  {
    id: 'duplicate-path',
    question: 'Two entries repeat the same path while one required path is absent:',
    answer: "Return {ok:false,reason:'inventory'} for that observed inventory, even if its entry count equals the manifest's count.",
    reason: 'Entries must be unique and the path sets equal. A duplicate cannot stand in for a missing file; names differing only by ASCII letter case also violate uniqueness.',
    source: 'LEARNER.md#decide-in-order',
    freshVariant: { question: 'An observed inventory contains engine.mjs and ENGINE.mjs with identical hashes. Why does digest equality not make the inventory valid?' },
  },
  {
    id: 'claimed-observation',
    question: 'A client copies approved hashes into its claimed observations without reading any files. What can a matching comparison establish?',
    answer: 'It establishes only that the supplied hash claims match the approved values. It does not establish the client file bytes or that the client executed those bytes.',
    reason: 'The comparison depends on its observer. Owner-side reading of actual bytes and independent approval are distinct from unverified client claims; even a local startup comparison is not remote execution attestation.',
    source: 'LEARNER.md#run-your-policy-at-the-actual-startup-boundary',
    freshVariant: { question: 'A package can rewrite both its runtime file and the reference digest used by its launcher. A comparison then passes. Which trust boundary failed, and what claim remains unsupported?' },
  },
];

const freshVariantAnswers = [
  { id: 'approved-package', answer: 'Neither difference requires refusal. Match by exact path, independently of array order, and compare normalized hexadecimal hash values. Return verified if all other checks pass.' },
  { id: 'changed-bytes', answer: 'Digest comparison refuses the changed engine bytes. A comment changes the hashed bytes even if it does not change gameplay or the release string.' },
  { id: 'approved-update', answer: 'Return unsupported-release after validating the reference and supported list. Matching bytes do not replace the explicit supported-release decision.' },
  { id: 'extra-file', answer: 'Return inventory because admission.mjs is missing. Correct engine.mjs bytes do not establish a complete package.' },
  { id: 'duplicate-path', answer: 'Return inventory. ASCII case-folded paths must be unique because those names may identify one file on a case-insensitive filesystem; equal digests do not fix the duplicated path.' },
  { id: 'claimed-observation', answer: 'The approval reference is no longer independent of the package being checked. The pass shows equality with an attacker-rewritable claim, not owner approval or trusted execution.' },
];

const transfer = {
  question: 'A level editor loads required core files and optional community plug-ins. Yesterday\'s approved project had no plug-ins; today\'s project adds one. Design the two approval sources and inventories. Explain what requires review, when a missing plug-in blocks loading, and what happens if the project can rewrite its own approval record. Give one legal update and one refused update with concrete path/hash examples.',
  rubric: [
    { criterion: 'Independent approval', evidence: 'Keeps core and plug-in approval under owner control, separate from observed project bytes; adding a plug-in requires explicit review and approval.' },
    { criterion: 'Explicit inventories', evidence: 'Forms exact core and selected plug-in path sets before imports; optional unselected plug-ins differ from a missing file in a selected approved plug-in.' },
    { criterion: 'Concrete decisions', evidence: 'Gives matching approved/observed path and digest examples for a legal update and a missing, extra or mismatched example for refusal.' },
    { criterion: 'Scope', evidence: 'Explains why self-rewritable approval defeats the boundary and why matching files alone do not prove benign behavior or protect later byte changes.' },
  ],
  referenceAnswer: 'Keep owner-approved core and plug-in manifests outside project control. Decide the selected plug-in set before any import, then compare observed core files and each selected plug-in with their approved exact inventories. For example, core/editor.mjs with approved digest a repeated 64 times and the same observed digest is a legal core update when its release is supported; a selected plugins/brush.mjs approved as b repeated 64 times but observed as c repeated 64 times is refused. An unselected optional plug-in need not exist; a file required by a selected plug-in must exist. Newly added plug-in bytes require review, and a project that can replace its own approved digests can defeat this comparison. Keep bytes stable from observation to import and state these limits.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'integrity', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'integrity', freshVariantAnswers, transfer });
}
