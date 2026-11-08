// Sources: teaching-repair/interface.md (base bf923c11) and integrity/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'integrity/LEARNER.md', anchor });

export const unit = {
  id: 'integrity', title: 'M5 · Compare approved bytes', prerequisites: ['testing'],
  objectives: [
    { id: 'integrity.reference', kind: 'concept', text: 'Separate an approved reference from a current observation.', prerequisites: [] },
    { id: 'integrity.compare', kind: 'procedure', text: 'Return the first release, inventory or digest decision for a bounded package.', prerequisites: ['integrity.reference'] },
    { id: 'integrity.trust', kind: 'concept', text: 'Identify the assurance missing when a package can rewrite its approval record.', prerequisites: ['integrity.compare'] },
  ],
  sections: [
    { id: 'reference', title: 'Two lists with different jobs', objectiveIds: ['integrity.reference'],
      paragraphs: [
        'A manifest is the owner-approved list of file paths and hashes. A hash summarizes exact file bytes. An observed inventory is the list measured from the files now. For engine.mjs, a changed comment changes the bytes even when gameplay appears unchanged.',
        'Keep those lists separate. Copying today’s observation into the approval record removes the comparison you wanted to make. A supported release name says which release is allowed; it does not excuse changed bytes within that release.',
      ],
      worked: { prompt: 'A supported map editor release approves rules.mjs with hash A. The reader observes rules.mjs with hash B. What is compared?', steps: ['Use A as the reference because it was approved independently.', 'Use B as the observation because it describes the current bytes.', 'The path exists on both sides, so compare the complete hashes.'], answer: 'The digest differs. Refuse the current package; do not replace A with B.' },
      completion: { prompt: 'A loader approves scene.mjs with hash C and observes hash D.', steps: ['The loader finds the release in its supported list.', 'Both lists contain exactly scene.mjs.'], missing: 'Supply the next comparison and its consequence when C and D differ.' }, source: source('reference-and-observation') },
    { id: 'compare', title: 'Find the first failed decision', objectiveIds: ['integrity.compare'],
      paragraphs: [
        'A usable reference comes first. Then check release support, exact path membership and complete hashes in that order. An extra or missing path is an inventory failure. A different well-formed hash for the same path is a digest failure.',
        'Paths are case-sensitive, while hexadecimal hash letters are not. Two inventory paths differing only by case are refused because some filesystems treat them as the same name. Reordering the array does not change the package; changing a path does.',
      ],
      worked: { prompt: 'Release r2 is supported. It approves main.mjs/hash A and config.json/hash B. Observation contains only main.mjs/hash A.', steps: ['The release is supported.', 'config.json is missing from the observation.', 'Stop at inventory; there is no complete set of files whose hashes can be compared.'], answer: '{"ok":false,"reason":"inventory"}' },
      completion: { prompt: 'Release r4 is unsupported and one observed hash also differs.', steps: ['The approved record and supported list are valid.', 'The release-support check runs before the inventory and digest checks.'], missing: 'Supply the first failure reason.' }, source: source('decide-in-order') },
    { id: 'trust', title: 'Place approval outside the package', objectiveIds: ['integrity.trust'],
      paragraphs: [
        'A matching digest means that measured bytes match a particular reference. It does not establish who approved that reference. If the package can edit both lists, the package can make a changed file match its own new claim.',
        'For a plug-in importer, first decide which bytes require approval, then keep that reference under the owner’s control and compare before import. Core approval does not automatically cover a newly added plug-in. This local exercise does not add signatures, remote identity proof or protection against files changing between measurement and import.',
      ],
      worked: { prompt: 'A drawing tool’s core matches its owner record, but a new brush plug-in has no approved hash. The tool imports both.', steps: ['Core matching covers the core list only.', 'The plug-in adds new executed bytes.', 'Require a separately approved plug-in entry before importing it.'], answer: 'Refuse the unapproved plug-in; core matching cannot approve new executed bytes.' },
      completion: { prompt: 'Every imported file matches, but the imported package can rewrite the approval store.', steps: ['The equality test may still return a match.', 'The requirement is an owner-controlled approval reference.'], missing: 'Name the missing assurance before relying on startup verification.' }, source: source('inspect-repair-and-explain') },
  ],
  masterySlots: ['boundary', 'refusal', 'transfer'],
  support: {
    milestones: ['Identify which list is approval and which is observation.', 'Check release, path set and digest decisions with the generated cases.', 'Implement integrity/policy.mjs and run the source checker, then test the actual startup boundary.'],
    hints: ['Keep approval and observation separate so equality has a fixed reference.', 'Check release support before path membership, then compare the full hashes.', 'After a committed attempt, compare its first failed decision with the worked sibling before requesting a fresh case.'],
    reference: 'integrity/LEARNER.md',
  },
};

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

function comparison(n) {
  const release = `release-${n % 97 + 1}`;
  const digest = ((n % 14) + 1).toString(16).repeat(64);
  const other = ((n % 14) + 2).toString(16).repeat(64);
  const files = [{ path: 'engine.mjs', sha256: digest }, { path: 'rules/range.json', sha256: other }];
  const observed = structuredClone(files).reverse();
  const variant = n % 6;
  if (variant === 1) observed.pop();
  if (variant === 2) observed.push({ path: 'extra.mjs', sha256: digest });
  if (variant === 3) observed[0].sha256 = digest;
  if (variant === 4) observed[0].sha256 = observed[0].sha256.toUpperCase();
  if (variant === 5) observed[0].path = 'rules/Range.json';
  const supported = n % 7 === 0 ? ['another-release'] : [release];
  const inputs = { manifest: { schema: 1, packageId: 'courier-runtime', release, files }, observed, supported };
  let reason = 'verified';
  if (!supported.includes(release)) reason = 'unsupported-release';
  if (reason === 'verified' && [1, 2, 5].includes(variant)) reason = 'inventory';
  if (reason === 'verified' && variant === 3) reason = 'digest';
  return { inputs, expected: { ok: reason === 'verified', reason } };
}

function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown integrity item mode');
  const section = mode === 'mastery' ? { boundary: 'reference', refusal: 'compare', transfer: 'trust' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown integrity item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `integrity:${mode}:${key}:${seed}`, objectiveIds: [`integrity.${section}`], source: source(section === 'compare' ? 'decide-in-order' : section === 'trust' ? 'inspect-repair-and-explain' : 'reference-and-observation'), format: { type: 'json' } };
  if (section === 'trust') {
    const plugins = Array.from({ length: 2 + n % 4 }, (_, i) => ({ path: `extensions/tool-${i}.mjs`, approvedHash: `approved-${n % 997}-${i}`, observedHash: `approved-${n % 997}-${i}` }));
    if (n % 3 === 0) plugins[n % plugins.length].observedHash = `changed-${n % 991}`;
    const inputs = { coreMatches: true, plugins, packageCanWriteApproval: n % 2 === 0, requestedClaim: 'owner-approved bytes before importing core and every plug-in' };
    const pluginMatches = plugins.every((p) => p.approvedHash === p.observedHash);
    const reason = inputs.packageCanWriteApproval ? 'untrusted-reference' : pluginMatches ? 'matching-only' : 'unapproved-bytes';
    const expected = { start: reason === 'matching-only', assurance: reason };
    return { ...base, inputs, prompt: 'A document viewer imports a core and several extensions. Hashes here are opaque identity labels; all paths and releases are valid. Its rule requires an independent owner-controlled approval record and matching hashes for every import. Return {start,assurance}, choosing assurance from untrusted-reference, unapproved-bytes, or matching-only. An untrusted reference takes priority. Matching-only authorizes this byte comparison, not remote identity or safe behavior.', expected,
      explanation: `The decision is ${JSON.stringify(expected)}. ${inputs.packageCanWriteApproval ? 'The package can rewrite approval, so equality cannot establish owner approval.' : pluginMatches ? 'Every measured inventory matches independent approval. That permits the stated startup check but proves only matching bytes.' : 'An extension does not match its approval, so core matching cannot authorize its bytes.'} A claim of authenticated remote execution would go beyond every branch here.`,
      hints: ['Find who can change the approval record before using equality as evidence.', 'If approval is independent, check every imported component, including the extension.', `The ordered decision gives ${JSON.stringify(expected)}; apply the same order to a fresh case after feedback.`] };
  }
  const { inputs, expected } = comparison(n);
  return { ...base, inputs, prompt: `${mode === 'completion' ? 'The approved record is well formed. Complete the remaining decision. ' : ''}Both inventories contain valid hashes and safe unique paths. Apply release support, exact path membership, then case-insensitive full-hash comparison. Return exactly {ok,reason}; use verified, unsupported-release, inventory or digest.`, expected,
    explanation: `The first decision is ${expected.reason}. Supported releases are ${JSON.stringify(inputs.supported)}; the requested release is ${inputs.manifest.release}. Compare paths by spelling, regardless of array order, and compare complete hashes only after the path sets match. Missing, extra or case-changed paths are inventory failures; hash-letter case alone is allowed. The result is ${JSON.stringify(expected)}.`,
    hints: ['A release label and a matching path are separate checks.', 'Find the first failed stage: support, path set, then full digest.', `The first failing stage gives ${JSON.stringify(expected)}. Do not replace approved hashes with observations.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const steps = args.key === 'trust'
      ? [`The core comparison is complete: coreMatches=${x.coreMatches}. The first extension comparison is ${x.plugins[0].approvedHash} === ${x.plugins[0].observedHash}, giving ${x.plugins[0].approvedHash === x.plugins[0].observedHash}. Check the remaining extensions and the approval-store owner before deciding.`]
      : args.key === 'reference'
        ? [`The approved reference contains ${x.manifest.files.length} paths. Their case-sensitive sorted order is ${JSON.stringify(x.manifest.files.map((f) => f.path).toSorted())}. Continue with release support and compare this reference with the current observation.`]
        : [`The observed hashes have been normalized to lowercase: ${JSON.stringify(x.observed.map((f) => ({ path: f.path, sha256: f.sha256.toLowerCase() })))}. Normalizing hexadecimal letters does not change path spelling. Continue with the ordered release, inventory and digest decisions.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from the calculated work in inputs.completedSteps; supply the remaining decision. ${item.prompt}` };
  }
  return item;
}
