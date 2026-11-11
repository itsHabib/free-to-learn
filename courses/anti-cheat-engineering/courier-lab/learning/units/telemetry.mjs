// Sources: teaching-repair/interface.md (base bf923c11) and telemetry/{policy.mjs,LEARNER.md}.
const source = (anchor) => ({ path: 'telemetry/LEARNER.md', anchor });
export const unit = {
  id: 'telemetry', title: 'M6 · Reproduce a complete window', prerequisites: ['order', 'integrity'],
  objectives: [
    { id: 'telemetry.checkpoint', kind: 'procedure', text: 'Compute a retained window from its checkpoint instead of a new initial state.', prerequisites: ['order.coalescing'] },
    { id: 'telemetry.sequence', kind: 'procedure', text: 'Check absolute event indices and the ordered replay refusal phases.', prerequisites: ['telemetry.checkpoint'] },
    { id: 'telemetry.claim', kind: 'concept', text: 'Separate a reproducible record from evidence of its producer’s identity.', prerequisites: ['telemetry.sequence', 'integrity.trust'] },
  ],
  sections: [
    { id: 'checkpoint', title: 'Start where retained history starts', objectiveIds: ['telemetry.checkpoint'],
      paragraphs: [
        'A checkpoint saves enough state to continue the game: positions, movement intent, pending interaction, expiry, cooldown and detector history. A public picture of the score leaves some of that state out. Starting again from an empty game can therefore produce a different next tick.',
        'A window consists of a checkpoint followed by a bounded list of operations. The checkpoint describes the state after startIndex. Restore it, then apply every retained operation. An empty window still restores and compares its checkpoint; empty does not mean invalid.',
      ],
      worked: { prompt: 'A small score register is 7 in the checkpoint. Its retained operations add 2, add 0 and add 3.', steps: ['Restore 7 rather than resetting to 0.', 'Apply all operations in order: 7 + 2 = 9, then 9 + 0 = 9.', 'The last operation gives 9 + 3 = 12. The zero-change operation remains part of the history.'], answer: 'The reproduced register is 12. This arithmetic rehearsal is not a complete Courier replay.' },
      completion: { prompt: 'A checkpoint register is 9; retained additions are 4 and 1.', steps: ['Restore 9.', 'Apply the first operation to reach 13.'], missing: 'Supply the register after the final operation.' }, source: source('causal-state') },
    { id: 'sequence', title: 'Check the history before trusting its result', objectiveIds: ['telemetry.sequence'],
      paragraphs: [
        'An absolute index is an operation’s position in the whole recorded history. If startIndex is 40, the next entries must be 41, 42 and so on. endIndex must equal startIndex plus the number of entries. Sorting or renumbering a damaged record would invent evidence.',
        'Check schema, release, completeness, sequence, checkpoint/events and final state in that order. Completeness requires an event array of at most 256 entries and complete:true. A matching final score does not repair a missing index: a stale operation may leave the score unchanged while still belonging in the history.',
      ],
      worked: { prompt: 'A complete supported window starts at 80, contains indices 81 and 83, and ends at 82. Its claimed final score matches a replay.', steps: ['Schema, release and completeness pass.', 'The second entry should be 82 but is 83.', 'Stop at sequence before considering the final score.'], answer: '{"ok":false,"reason":"sequence"}' },
      completion: { prompt: 'A supported record starts at 15, has no events, has complete:true and ends at 15.', steps: ['The array length is zero, within the bound.', 'endIndex equals startIndex plus zero.'], missing: 'Supply whether sequence passes and what state must next be restored.' }, source: source('absolute-order') },
    { id: 'claim', title: 'State exactly what replay establishes', objectiveIds: ['telemetry.claim'],
      paragraphs: [
        'Replay establishes that a supplied checkpoint and operation sequence reproduce a supplied final state under a particular engine. It does not authenticate the producer. A person able to replace the checkpoint, events and final claim can create another internally consistent history.',
        'For an audit, keep consistency and provenance as separate questions. Refusing an inconsistent record means the record cannot support that replay. It does not, by itself, identify cheating, intent, token ownership or actual network timing. The source project performs replay through the real engine; these small questions rehearse its decisions.',
      ],
      worked: { prompt: 'An inventory counter’s exported checkpoint and all later operations reproduce its final total, but the exporter can replace the whole record.', steps: ['The arithmetic and operation sequence are internally consistent.', 'No independent identity or custody evidence was supplied.', 'Report consistency and leave producer authenticity unresolved.'], answer: 'Internally consistent; producer authenticity is not established.' },
      completion: { prompt: 'A rewritten record still replays to its rewritten final claim.', steps: ['The replay calculation agrees with the supplied claim.'], missing: 'Name the identity claim that still needs separate evidence.' }, source: source('repair-and-scope') },
  ],
  masterySlots: ['boundary', 'refusal', 'transfer'],
  support: {
    milestones: ['Compute from a checkpoint, including a zero-change operation.', 'Reject a sequence gap before comparing the final state.', 'Implement replayWindow with the supplied engine facade and run the source checker.'],
    hints: ['Locate the saved state immediately before the retained operations.', 'Check envelope phases before applying any event; never repair the record.', 'After a committed response, use the sibling calculation to separate consistency from provenance.'],
    reference: 'telemetry/LEARNER.md',
  },
};

function hashSeed(seed) {
  let n = 2166136261;
  for (const char of String(seed)) n = Math.imul(n ^ char.charCodeAt(0), 16777619) >>> 0;
  return n;
}

function windowCase(n) {
  const startIndex = 10 + n % 180;
  const initial = 2 + n % 23;
  const deltas = [n % 5, 0, 1 + n % 7];
  const events = deltas.map((add, i) => ({ index: startIndex + i + 1, event: { add } }));
  const record = { schema: 1, runtimeRelease: 'counter-1', startIndex, checkpoint: { score: initial }, events, endIndex: startIndex + events.length, complete: true, final: { score: initial + deltas.reduce((a, b) => a + b, 0) } };
  const variant = n % 7;
  if (variant === 1) record.runtimeRelease = 'counter-2';
  if (variant === 2) record.complete = false;
  if (variant === 3) record.events[1].index += 1;
  if (variant === 4) record.final.score += 1;
  if (variant === 5) record.schema = 2;
  if (variant === 6) { record.events = []; record.endIndex = startIndex; record.final.score = initial; }
  const reason = ['reproduced', 'incompatible', 'incomplete', 'sequence', 'final', 'schema', 'reproduced'][variant];
  return { record, reason };
}

function generateItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new Error('Unknown telemetry item mode');
  const section = mode === 'mastery' ? { boundary: 'checkpoint', refusal: 'sequence', transfer: 'claim' }[key] : key;
  if (!unit.sections.some(({ id }) => id === section)) throw new Error('Unknown telemetry item key');
  const n = hashSeed(`${mode}:${key}:${seed}`);
  const base = { id: `telemetry:${mode}:${key}:${seed}`, objectiveIds: [`telemetry.${section}`], source: source(section === 'checkpoint' ? 'causal-state' : section === 'sequence' ? 'absolute-order' : 'repair-and-scope') };
  if (section === 'checkpoint') {
    const score = 4 + n % 47;
    const additions = n % 4 === 0 && mode !== 'completion' ? [] : [1 + n % 7, 0, 2 + n % 5];
    const expected = additions.reduce((total, add) => total + add, score);
    return { ...base, inputs: { checkpoint: { score }, additions }, format: { type: 'number' }, tolerance: 0,
      prompt: `${mode === 'completion' ? 'The checkpoint has already been restored. Complete the remaining additions. ' : ''}This score-register rehearsal adds each listed value in order to the checkpoint score. Return the final score as an exact integer in score units. An empty list leaves the checkpoint score unchanged.`, expected,
      explanation: `Start from ${score}, then add ${JSON.stringify(additions)}. The result is ${expected} score units. Starting at zero discards history saved in the checkpoint; dropping a zero addition may keep this number but would not preserve the event sequence.`,
      hints: ['The checkpoint is the starting value, not an output to ignore.', 'Add every listed value, preserving the checkpoint when the list is empty.', `${score} + ${additions.length ? additions.join(' + ') : '0'} = ${expected} score units.`] };
  }
  const { record, reason } = windowCase(n);
  const inputs = { engineRelease: 'counter-1', record, producerCanRewriteRecord: true };
  const expected = section === 'sequence' ? { ok: reason === 'reproduced', reason } : { reason, claim: reason === 'reproduced' ? 'consistent-only' : 'not-reproduced' };
  return { ...base, inputs, format: { type: 'json' },
    prompt: `${section === 'claim' ? 'A warehouse register exports this record; the producer can rewrite its contents. ' : ''}The simple engine restores checkpoint.score and adds event.add in order. Apply schema 1, matching release, complete:true and <=256 entries, consecutive absolute indices/end boundary, then final-score equality. ${section === 'claim' ? 'Return {reason,claim}, with claim consistent-only on reproduction or not-reproduced on refusal; replay supplies no producer authentication.' : 'Return {ok,reason}.'} Use reason reproduced for success, or schema, incompatible, incomplete, sequence, final for the first failed phase.`, expected,
    explanation: `The ordered checks give ${reason}, so the answer is ${JSON.stringify(expected)}. Each event index must be startIndex plus its one-based position, even when its addition is zero. A reproduced total establishes agreement within these supplied values; replacing all values can preserve that agreement without authenticating their origin.`,
    hints: ['Check the envelope and sequence before computing a total.', 'After those checks, start from checkpoint.score and compare the computed total with final.score.', `The first applicable phase is ${reason}; the complete response is ${JSON.stringify(expected)}.`] };
}

export function makeItem(args) {
  const item = generateItem(args);
  if (args.mode === 'mastery') return { ...item, hints: [] };
  if (args.mode === 'completion') {
    const x = item.inputs;
    const steps = args.key === 'checkpoint'
      ? [`The checkpoint was restored to ${x.checkpoint.score}. After the first addition ${x.additions[0]}, the register is ${x.checkpoint.score + x.additions[0]}. Apply the remaining ${x.additions.length - 1} operations.`]
      : args.key === 'sequence'
        ? [`The end-boundary arithmetic is ${x.record.startIndex} + ${x.record.events.length} = ${x.record.startIndex + x.record.events.length}. The first retained index, if present, should be ${x.record.startIndex + 1}. Continue through the refusal phases in their stated order.`]
        : [`The retained additions sum to ${x.record.events.reduce((sum, e) => sum + e.event.add, 0)}. This subtotal excludes the saved checkpoint. Check the envelope and sequence, then finish the reproduction and provenance decisions.`];
    return { ...item, inputs: { ...x, completedSteps: steps }, prompt: `Continue from the calculated work in inputs.completedSteps; the final decision is still yours. ${item.prompt}` };
  }
  return item;
}
