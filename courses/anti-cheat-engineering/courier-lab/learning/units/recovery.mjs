// Sources: teaching-repair/interface.md (base bf923c11) and recovery/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'recovery/LEARNER.md', anchor });
export const unit = {
  id: 'recovery', title: 'M10 · Select compatible recovery evidence', prerequisites: ['integrity', 'telemetry', 'retention'],
  objectives: [
    { id: 'recovery.tuple', kind: 'procedure', text: 'Check a declared release against configuration and snapshot identities.', prerequisites: ['integrity.reference', 'telemetry.checkpoint'] },
    { id: 'recovery.selection', kind: 'procedure', text: 'Select the newest compatible snapshot with a deterministic tie break.', prerequisites: ['recovery.tuple'] },
    { id: 'recovery.loss', kind: 'concept', text: 'Account for lost state and reopened sequences separately from restored behavior.', prerequisites: ['recovery.selection', 'order.admission'] },
  ],
  sections: [
    { id: 'tuple', title: 'Recover a compatible set', objectiveIds: ['recovery.tuple'],
      paragraphs: [
        'A recovery tuple joins a package, its required configuration and a saved state. The package needs a decoder that understands the state schema, which is the state format version. Matching a configuration name alone is insufficient when its hash identifies different contents.',
        'First find the requested release. Then require the named configuration to match its hash, release ID and schema. Finally require a snapshot with that schema and configuration ID/hash. Select existing identities; changing a snapshot’s label does not convert its state into an older format.',
      ],
      worked: { prompt: 'Release r2 requires c2/hash-H and state schema 2. Its configuration has those identities, but the only snapshot uses schema 1 with c2/hash-H.', steps: ['The requested release exists.', 'The configuration matches all release requirements.', 'The snapshot schema does not match the decoder’s schema.'], answer: '{"ok":false,"reason":"no-compatible-snapshot"}' },
      completion: { prompt: 'Release r3 requires c3/hash-Q; configuration c3 instead has hash-R.', steps: ['The requested release exists.', 'Find the named configuration before examining snapshots.'], missing: 'Supply the first refusal reason.' }, source: source('compatible-tuples') },
    { id: 'selection', title: 'Choose among compatible snapshots', objectiveIds: ['recovery.selection'],
      paragraphs: [
        'An ordinal is a declared ordering number, not a timestamp. Among compatible snapshots, choose the greatest ordinal. If ordinals tie, choose the smaller ID using JavaScript string comparison, which compares UTF-16 code units.',
        'Filter compatibility before comparing order. A newer incompatible snapshot cannot win. Keep the input unchanged: a scan or a sort of a new filtered array preserves the caller’s evidence. Return the chosen hashes and IDs without fabricating a replacement state.',
      ],
      worked: { prompt: 'Compatible snapshots are a-ready@5 and Z-ready@5. An incompatible snapshot is latest@9.', steps: ['Discard latest because compatibility is required before recency.', 'The two remaining ordinals tie.', 'Z precedes a in JavaScript string comparison, so Z-ready wins.'], answer: 'Select Z-ready and copy that snapshot’s actual hash.' },
      completion: { prompt: 'Compatible snapshots are older@4 and newer@7; incompatible future@11 is listed first.', steps: ['Ignore the incompatible snapshot.', 'Compare 4 and 7.'], missing: 'Supply the selected snapshot ID without changing the array order.' }, source: source('snapshot-order') },
    { id: 'loss', title: 'Inspect what the restore discards', objectiveIds: ['recovery.loss'],
      paragraphs: [
        'A restore can make an earlier legal action work again while discarding later acknowledged actions. Report both facts. A successful selection is only a plan; the runner must actually restore the named state and apply the action before reporting that action as successful.',
        'If the failed branch acknowledged sequence 12 and the restored snapshot remembers sequence 3, sequences 4 through 12 are reopened. A new action at sequence 4 belongs to the restored branch. A lineage label makes that difference visible, but does not coordinate retries or compensate lost external effects.',
      ],
      worked: { prompt: 'Before failure the score is 3 and last sequence is 9. The restored snapshot has score 1 and last sequence 5. A new pickup succeeds.', steps: ['The restore discards score 3 minus 1, which is 2.', 'Sequences 6, 7, 8 and 9 can now be reused in this toy state.', 'The successful pickup proves that action worked after restore; it does not restore the lost score or acknowledgments.'], answer: 'Lost score: 2. Reopened sequences: 6–9. Some acknowledged history was lost.' },
      completion: { prompt: 'A restore returns true, but the post-restore pickup returns false.', steps: ['Separate the restore result from the attempted action result.'], missing: 'Supply whether “the same legal action works again” has been established.' }, source: source('what-recovery-loses') },
  ],
  masterySlots: ['compatibility', 'newest', 'transfer'],
  support: {
    milestones: ['Reject the first missing identity or incompatible tuple.', 'Select the newest compatible snapshot, including a string-order tie.', 'Implement selectRecovery, then inspect actual restore/action and loss evidence from the runner.'],
    hints: ['Find the declared target before choosing familiar artifacts.', 'Check all configuration identities, then filter snapshots before comparing ordinals.', 'After a committed attempt, calculate discarded state and reopened sequences separately from the new action.'], reference: 'recovery/LEARNER.md',
  },
};

function hashSeed(seed) { let n = 2166136261; for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0; return n; }
function evidenceCase(n) {
  const schema = 1 + n % 3;
  const ordinal = 5 + n % 20;
  const release = { id: `r-${n % 41}`, packageHash: `package-${n}`, stateSchema: schema, configId: 'c-target', configHash: `config-${n}` };
  const config = { id: 'c-target', hash: release.configHash, releaseId: release.id, stateSchema: schema, maxInteractionDistanceMm: 250 };
  const snap = (id, order, extra = {}) => ({ id, hash: `snapshot-${id}-${n}`, ordinal: order, stateSchema: schema, configId: config.id, configHash: config.hash, ...extra });
  const evidence = { targetReleaseId: release.id, releases: [release], configurations: [config], snapshots: [snap('future', ordinal + 10, { stateSchema: schema + 1 }), snap('a-ready', ordinal), snap('older', ordinal - 2), snap('Z-ready', ordinal)] };
  const variant = n % 6;
  if (variant === 1) evidence.targetReleaseId = 'missing-release';
  if (variant === 2) config.hash = 'wrong-config-hash';
  if (variant === 3) evidence.snapshots = evidence.snapshots.map((s) => ({ ...s, configId: 'other-config' }));
  if (variant === 4) evidence.snapshots[1].ordinal += 1;
  if (variant === 5) config.releaseId = 'wrong-release';
  return evidence;
}
function select(e) {
  const r = e.releases.find((x) => x.id === e.targetReleaseId);
  if (!r) return { ok: false, reason: 'unknown-target' };
  const c = e.configurations.find((x) => x.id === r.configId);
  if (!c || c.hash !== r.configHash || c.releaseId !== r.id || c.stateSchema !== r.stateSchema) return { ok: false, reason: 'configuration-mismatch' };
  const candidates = e.snapshots.filter((s) => s.stateSchema === r.stateSchema && s.configId === c.id && s.configHash === c.hash);
  const s = candidates.toSorted((a, b) => b.ordinal - a.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  if (!s) return { ok: false, reason: 'no-compatible-snapshot' };
  return { ok: true, releaseId: r.id, packageHash: r.packageHash, configId: c.id, configHash: c.hash, snapshotId: s.id, snapshotHash: s.hash };
}
function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown recovery item mode');
  const section = mode === 'mastery' ? { compatibility: 'tuple', newest: 'selection', transfer: 'loss' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown recovery item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `recovery:${mode}:${key}:${seed}`, objectiveIds: [`recovery.${section}`], format: { type: 'json' }, source: source(section === 'tuple' ? 'compatible-tuples' : section === 'selection' ? 'snapshot-order' : 'what-recovery-loses') };
  if (section === 'loss') {
    const restoredLastSeq = 2 + n % 400;
    const highestBeforeRestore = restoredLastSeq + (n >>> 9) % 20;
    const restoredScore = (n >>> 14) % 30;
    const inputs = { service: 'shared repair credits', highestBeforeRestore, restoredLastSeq, scoreBeforeRestore: restoredScore + (n >>> 20) % 8, restoredScore, snapshotActuallyRestored: true, actionAppliedAfterRestore: n % 2 === 0 };
    const count = highestBeforeRestore - restoredLastSeq;
    const expected = { reopenedStart: count ? restoredLastSeq + 1 : null, reopenedEnd: count ? highestBeforeRestore : null, reopenedCount: count, lostScore: inputs.scoreBeforeRestore - restoredScore, sameActionWorks: inputs.actionAppliedAfterRestore, allAcknowledgedPreserved: count === 0 };
    return { ...base, inputs, expected, prompt: 'A service really restored this older snapshot. In this toy protocol, no separate sequence floor or recovery epoch survives the restore. Return {reopenedStart,reopenedEnd,reopenedCount,lostScore,sameActionWorks,allAcknowledgedPreserved}. Use null endpoints if no sequence reopens. Count inclusive sequence numbers; a successful new action does not compensate lost acknowledgments.',
      explanation: `The result is ${JSON.stringify(expected)}. Subtract restoredLastSeq from highestBeforeRestore for the reopened count, and restoredScore from scoreBeforeRestore for lost score. Action success is the supplied action result, not the restore result. Preserving all acknowledged sequence state requires no reopened range.`,
      hints: ['Keep restored state, original acknowledgments and the new action as three facts.', 'The reopened range starts one above restoredLastSeq and ends at highestBeforeRestore.', `The inclusive range and separate action evidence give ${JSON.stringify(expected)}.`] };
  }
  const inputs = evidenceCase(n);
  const selected = select(inputs);
  const expected = section === 'tuple' && selected.ok ? { ok: true, reason: 'compatible' } : selected;
  return { ...base, inputs, expected, prompt: `Find the declared release, validate configuration ID/hash/release/schema, then filter snapshots by schema and configuration ID/hash. ${section === 'tuple' ? 'Return {ok:true,reason:"compatible"} if at least one compatible snapshot exists.' : 'Among compatible snapshots select greatest ordinal, breaking ties by ascending JavaScript string comparison, and return {ok,releaseId,packageHash,configId,configHash,snapshotId,snapshotHash}.'} On failure return {ok:false,reason}, using unknown-target, configuration-mismatch or no-compatible-snapshot in that order. Preserve every supplied identity.`,
    explanation: `The result is ${JSON.stringify(expected)}. Compatibility must be checked before recency. A same-name configuration with a different hash cannot be used, and a newer snapshot with a different schema cannot win. For equal ordinals, Z-ready sorts before a-ready by JavaScript code-unit comparison. Nothing in this selection establishes that a restore or action already happened.`,
    hints: ['Resolve the declared release first; selecting a different release changes the request.', 'Require every configuration and snapshot identity to agree before ordering candidates.', `Applying those filters and the deterministic order yields ${JSON.stringify(expected)}.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const release = x.releases?.find((r) => r.id === x.targetReleaseId);
    const config = release && x.configurations.find((c) => c.id === release.configId);
    const candidates = release && config ? x.snapshots.filter((s) => s.stateSchema === release.stateSchema && s.configId === config.id && s.configHash === config.hash) : [];
    const steps = args.key === 'loss'
      ? [`The score difference has been calculated: ${x.scoreBeforeRestore} − ${x.restoredScore} = ${x.scoreBeforeRestore - x.restoredScore}. Complete the reopened sequence interval and distinguish the actual new-action result from the restore result.`]
      : args.key === 'tuple'
        ? [`The declared-target lookup gives ${release ? JSON.stringify({ id: release.id, stateSchema: release.stateSchema, configId: release.configId, configHash: release.configHash }) : 'no matching release'}. Continue the ordered configuration and snapshot checks when the target exists.`]
        : [`Snapshot filtering by the located release schema and configuration identity yields ${JSON.stringify(candidates.map((s) => ({ id: s.id, ordinal: s.ordinal })))}. This provisional list does not validate the configuration against its release; check that first, then complete the ordering and returned identities.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from the partial work in inputs.completedSteps without treating an unchecked identity as approved. ${item.prompt}` };
  }
  return item;
}
