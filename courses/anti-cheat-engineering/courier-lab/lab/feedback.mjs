// Author-side answers. Never copy this module into a prepared learner workspace.
const copy = (value) => JSON.parse(JSON.stringify(value));

const predictions = [
  {
    id: 'axis-edge',
    question: '250 mm east, 0 north — decision and reason:',
    answer: 'Passes the proximity check: 250²+0²=62500, exactly the inclusive 250² limit.',
    reason: 'Equality is legal. This proximity decision does not bypass the separate cooldown or other gameplay requirements.',
    source: 'LEARNER.md#trace-and-predict-the-decision',
    freshVariant: { question: 'A target is 250 mm north of the courier with no east/west offset. Does the proximity check change when the same boundary is on the y axis?' },
  },
  {
    id: 'outside-edge',
    question: '251 mm east, 0 north — decision and reason:',
    answer: 'Fails with range: 251²+0²=63001, which exceeds 62500.',
    reason: 'One millimetre beyond the radius is outside. An outside interaction must not create cargo or score.',
    source: 'LEARNER.md#trace-and-predict-the-decision',
    freshVariant: { question: 'The courier is 250 mm west and 1 mm south of the target. Both coordinate magnitudes are at most 250. Does the combined displacement pass?' },
  },
  {
    id: 'diagonal-edge',
    question: '150 mm east, 200 mm north — decision and reason:',
    answer: 'Passes the proximity check: 150²+200²=22500+40000=62500.',
    reason: 'Both coordinate differences contribute to squared distance. This diagonal lies exactly on the same inclusive circular boundary.',
    source: 'LEARNER.md#trace-and-predict-the-decision',
    freshVariant: { question: 'The courier is 200 mm west and 150 mm north of the target. Does changing direction signs or swapping the coordinate magnitudes change this boundary decision?' },
  },
  {
    id: 'diagonal-outside',
    question: '200 mm east, 200 mm north — decision and reason:',
    answer: 'Fails with range: 200²+200²=80000, greater than 62500.',
    reason: 'Two individually small coordinate differences can combine into a distance beyond the radius. Independent per-axis limits would admit this invalid diagonal.',
    source: 'LEARNER.md#trace-and-predict-the-decision',
    freshVariant: { question: 'The courier is 180 mm west and 180 mm south of the target. Compare its squared distance with 250² and decide the proximity result.' },
  },
];

const freshVariantAnswers = [
  { id: 'axis-edge', answer: 'It still passes: 0²+250²=62500. Both axes use the same inclusive radius rule.' },
  { id: 'outside-edge', answer: 'It fails with range: (-250)²+(-1)²=62501>62500. Per-axis bounds do not decide circular distance.' },
  { id: 'diagonal-edge', answer: 'It still passes: (-200)²+150²=62500. Squaring removes the signs and addition makes the coordinate order irrelevant.' },
  { id: 'diagonal-outside', answer: 'It fails with range: 180²+180²=64800>62500.' },
];

const transfer = {
  question: 'Transfer: a repair station has a radius of 400 mm and a resource cost. Outline a server-owned predicate and one legal boundary test, one invalid-state test and one retry test. Account for charging the resource at most once.',
  rubric: [
    { criterion: 'Server authority', evidence: 'Uses server-owned actor/station positions, balances and configured cost rather than client claims.' },
    { criterion: 'Geometry and state', evidence: 'Tests an inclusive squared-distance edge and an invalid state such as insufficient resources; refusal leaves resource state unchanged.' },
    { criterion: 'Retry accounting', evidence: 'Uses a stable actor-scoped request identity and retained success result so one accepted repair is charged at most once.' },
  ],
  referenceAnswer: 'The owner checks squared distance <=400² and sufficient server-owned resources before applying the repair and debit together. Test a displacement of (400,0), a nearby actor without enough resources, and a repeated identity after one successful repair. Keep the original successful result and acknowledge the retry without charging again; failed requests must not become successful receipts. Geometry alone cannot supply this transaction or retry rule.',
};

/** Release only after the check has captured the learner's original response. */
export function postCheckFeedback() {
  return copy({ schema: 1, module: 'proximity', predictions });
}

/** Author/reviewer material; do not release as first prediction feedback. */
export function reviewerFeedback() {
  return copy({ schema: 1, module: 'proximity', freshVariantAnswers, transfer });
}
