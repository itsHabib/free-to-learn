// Sources: teaching-repair/interface.md (base bf923c11) and retention/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'retention/LEARNER.md', anchor });
export const unit = {
  id: 'retention', title: 'M9 · Keep a bounded export', prerequisites: ['evaluation'],
  objectives: [
    { id: 'retention.window', kind: 'procedure', text: 'Apply the exclusive old edge, inclusive current edge and newest-entry count bound.', prerequisites: ['evaluation.window'] },
    { id: 'retention.projection', kind: 'procedure', text: 'Construct exactly four exported fields without changing the source.', prerequisites: ['retention.window'] },
    { id: 'retention.evidence', kind: 'concept', text: 'Determine which inspection question a shortened export can still support.', prerequisites: ['retention.projection', 'evaluation.claim'] },
  ],
  sections: [
    { id: 'window', title: 'Age first, count second', objectiveIds: ['retention.window'],
      paragraphs: [
        'Retention chooses which observations remain in an export. Keep an event when nowTick-maxAgeTicks < tick <= nowTick. The old edge is excluded; the current tick is included. A future event is excluded even when the export has room.',
        'After filtering age, keep the newest maxEvents entries. The source is already ordered by tick, so take its tail and keep the supplied order. Equal-tick events are separate observations; their original order decides which survive a count limit.',
      ],
      worked: { prompt: 'Now is 30, maxAgeTicks is 6, maxEvents is 2. Events arrive in order at 24, 25, 29, 30 and 31.', steps: ['The age window is (24,30]. Keep 25, 29 and 30.', 'Remove future tick 31 before applying the count bound.', 'The newest two eligible events are 29 and 30, in that order.'], answer: 'Retain ticks [29,30].' },
      completion: { prompt: 'Eligible events are A@8, B@9, C@9, D@10 and maxEvents is 3.', steps: ['The list is already in observed order.', 'Take the last three entries.'], missing: 'Supply their IDs in order, preserving the tie at tick 9.' }, source: source('the-count-bound') },
    { id: 'projection', title: 'Copy the fields the export needs', objectiveIds: ['retention.projection'],
      paragraphs: [
        'A projection constructs a smaller record from selected fields. This export keeps exactly tick, actorId, reason and distanceSquared. Construct a new record; copying the whole source object also copies unrelated fields, while deleting fields from the source destroys evidence another caller may need.',
        'An actorId is pseudonymous: it names a repeated actor without directly naming a person. Repeated actions may still be linked to other information. A four-field export is smaller, but that does not establish anonymity or reproduce a complete game checkpoint.',
      ],
      worked: { prompt: 'One eligible source record contains tick 9, actorId courier-a, reason range, distanceSquared 81, capability demo-only and device synthetic-device.', steps: ['Select the eligible record.', 'Create a new object with the four required names.', 'Leave capability and device in the original source only.'], answer: '{"tick":9,"actorId":"courier-a","reason":"range","distanceSquared":81}' },
      completion: { prompt: 'An eligible record also contains an address field.', steps: ['Select tick, actorId, reason and distanceSquared into a new object.'], missing: 'State whether address belongs in the exported object and whether the original address is deleted.' }, source: source('four-fields-only') },
    { id: 'evidence', title: 'Budget evidence for the question', objectiveIds: ['retention.evidence'],
      paragraphs: [
        'A detector window and an export window answer different questions. The live detector may use observations that a shorter export has already dropped. To recompute every decision from the export alone, you need the observations that decision used; a small file cannot recover omitted observations.',
        'Deletion also has a named scope. Deleting one export removes that file, not another export, a copy, a learner attempt or live detector state. Compare encoded bytes when studying storage cost. A smaller JSON file does not measure all process memory, and timing the policy alone does not include file I/O.',
      ],
      worked: { prompt: 'At tick 50, a detector uses (30,50] and sees denials at 34, 42 and 49. An export keeps only (42,50].', steps: ['All three denials belong to the detector window.', 'Only tick 49 survives the export’s exclusive old edge.', 'The export alone cannot reconstruct the original three-observation window.'], answer: 'The missing 34 and 42 observations limit later inspection; deleting this export would not erase the detector’s live state.' },
      completion: { prompt: 'You delete export A. Export B is a separate file with some of the same observations.', steps: ['The deletion receipt names A only.'], missing: 'Supply which export remains and which broader deletion claim would be unsupported.' }, source: source('reconcile-the-detector-window') },
  ],
  masterySlots: ['boundary', 'projection', 'transfer'],
  support: {
    milestones: ['Select age-eligible events before enforcing the count bound.', 'Return only four fields and preserve the source.', 'Implement retain, then measure declared settings and inspect the scope of one export deletion.'],
    hints: ['Write the two strictness signs before selecting any event.', 'Apply the count limit to the eligible list, then construct new four-field records.', 'After committing, compare the saved and required windows before claiming that an export explains a decision.'], reference: 'retention/LEARNER.md',
  },
};

function hashSeed(seed) { let n = 2166136261; for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0; return n; }
function retained(events, s) {
  return events.filter((event) => event.tick > s.nowTick - s.maxAgeTicks && event.tick <= s.nowTick).slice(-s.maxEvents).map(({ tick, actorId, reason, distanceSquared }) => ({ tick, actorId, reason, distanceSquared }));
}
function makeEvents(n, now, age) {
  return [now - age - 1, now - age, now - age + 1, now - 2, now - 1, now - 1, now, now + 1].sort((a, b) => a - b).map((tick, i) => ({ tick, actorId: `synthetic-${n % 29}-${i}`, reason: i % 2 ? 'range' : 'cooldown', distanceSquared: (i + 2) ** 2, capability: 'synthetic-not-a-token', device: 'synthetic-device' }));
}
function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown retention item mode');
  const section = mode === 'mastery' ? { boundary: 'window', projection: 'projection', transfer: 'evidence' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown retention item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `retention:${mode}:${key}:${seed}`, objectiveIds: [`retention.${section}`], format: { type: 'json' }, source: source(section === 'evidence' ? 'reconcile-the-detector-window' : section === 'projection' ? 'four-fields-only' : 'the-count-bound') };
  const settings = { nowTick: 30 + n % 60, maxAgeTicks: 4 + n % 8, maxEvents: 1 + n % 6 };
  const events = makeEvents(n, settings.nowTick, settings.maxAgeTicks);
  if (section !== 'evidence') {
    const output = retained(events, settings);
    const expected = section === 'window' ? { actorIds: output.map((e) => e.actorId) } : output;
    return { ...base, inputs: { events, settings }, expected,
      prompt: `${mode === 'completion' ? 'The input is already in nondecreasing tick order. Complete the selection. ' : ''}Keep events with nowTick-maxAgeTicks < tick <= nowTick, then the newest maxEvents in supplied order. ${section === 'window' ? 'Return {actorIds} containing retained actor IDs in order.' : 'Return the retained array with exactly tick, actorId, reason and distanceSquared on each new record. Do not include synthetic capability/device fields.'}`,
      explanation: `The old edge is ${settings.nowTick - settings.maxAgeTicks}, excluded, and the current edge ${settings.nowTick} is included. Remove future records before taking the newest ${settings.maxEvents}. Equal-tick entries retain source order. The answer is ${JSON.stringify(expected)}; constructing this projection leaves the original records intact.`,
      hints: ['Mark events inside the age interval before using the count limit.', 'Take the eligible tail without sorting tied records, then select only the requested fields.', `The retained answer is ${JSON.stringify(expected)}.`] };
  }
  const detectorWindowTicks = settings.maxAgeTicks + (n % 2 ? 0 : 5);
  const required = events.filter((e) => e.tick > settings.nowTick - detectorWindowTicks && e.tick <= settings.nowTick);
  const output = retained(events, settings);
  const retainedIds = new Set(output.map((e) => e.actorId));
  const expected = { canReconstructWindow: required.every((e) => retainedIds.has(e.actorId)), missingCount: required.filter((e) => !retainedIds.has(e.actorId)).length, otherExportRemains: true };
  return { ...base, inputs: { events, settings, detectorWindowTicks, deletedExport: 'export-A', separateExport: 'export-B' }, expected,
    prompt: 'A document service needs every denial in (nowTick-detectorWindowTicks,nowTick] to recompute an inspection window. It exports with the supplied retention settings, then deletes only export-A; export-B is a separate existing file. Return {canReconstructWindow,missingCount,otherExportRemains}. Count missing source observations, not missing tick values; tied observations are separate.',
    explanation: `The result is ${JSON.stringify(expected)}. The detector needs ${required.length} source observations; compare their identities with the retained four-field records, after both age and count limits. A dropped observation cannot be recovered from the export alone. The named deletion of export-A leaves export-B untouched.`,
    hints: ['Find the complete detector interval separately from the export interval.', 'Compare observation IDs after both export limits, counting tied observations individually.', `There are ${expected.missingCount} missing observations; the complete response is ${JSON.stringify(expected)}.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const edge = x.settings.nowTick - x.settings.maxAgeTicks;
    const eligible = x.events.filter((e) => e.tick > edge && e.tick <= x.settings.nowTick);
    const steps = args.key === 'window'
      ? [`Age filtering for (${edge},${x.settings.nowTick}] is complete. Eligible actor IDs in source order are ${JSON.stringify(eligible.map((e) => e.actorId))}. Apply the count bound next.`]
      : args.key === 'projection'
        ? [`Selection is complete: the retained source positions are ${JSON.stringify(eligible.slice(-x.settings.maxEvents).map((e) => x.events.indexOf(e)))} (zero-based). Build new four-field records from those positions; do not copy the source objects wholesale.`]
        : [`The export age edge is ${edge}, while the detector's old edge is ${x.settings.nowTick - x.detectorWindowTicks}. Both old edges are exclusive and the current edge is ${x.settings.nowTick}. Compare the actual observation identities after the export count bound.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from inputs.completedSteps and fill the remaining selection or evidence decision. ${item.prompt}` };
  }
  return item;
}
