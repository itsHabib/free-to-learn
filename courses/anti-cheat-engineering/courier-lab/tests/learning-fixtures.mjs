import { UNIT_IDS } from '../learning/runtime.mjs';

export const modules = UNIT_IDS.map((id) => ({
  sourceVersion: `fixture-${id}-v1`,
  unit: {
    id, title: `Test ${id}`, prerequisites: [],
    objectives: [{ id: `${id}.boundary`, kind: 'procedure', text: 'Compute the server-owned boundary.', prerequisites: [] }],
    sections: [{ id: 'boundary', title: 'Server boundary', objectiveIds: [`${id}.boundary`], paragraphs: ['The server compares the claimed amount with its own limit. Equality is accepted; a larger value is refused.'], worked: { prompt: 'A sibling case has limit 5 and request 4. Predict whether it is accepted.', steps: ['Compare 4 with 5.', 'The request is below the limit.'], answer: 'Accepted' }, completion: { prompt: 'Finish a boundary comparison.', steps: ['Read the server limit.', 'Compare the request.'], missing: 'Compute the remaining amount.' }, source: { path: 'lab/LEARNER.md', anchor: 'proximity' } }],
    masterySlots: ['boundary', 'refusal', 'transfer'], support: { milestones: ['Compare a request.'], hints: ['Orient', 'Compute', 'Solution'], reference: 'lab/LEARNER.md' },
  },
  makeItem({ mode, key, seed }) {
    return { id: `${id}:${mode}:${key}:${seed}`, objectiveIds: [`${id}.boundary`], prompt: `For request ${seed}, compute the remaining amount after spending 3 from ${seed + 3}.`, inputs: { available: seed + 3, spent: 3 }, format: { type: 'number' }, expected: seed, explanation: `Subtract 3 from ${seed + 3}; the remaining amount is ${seed}.`, hints: mode === 'mastery' ? [] : ['Find the available amount and the spent amount.', 'Subtract spent from available.', `Subtract 3 from ${seed + 3} to get ${seed}.`], source: { path: 'lab/LEARNER.md', anchor: 'proximity' } };
  },
}));
