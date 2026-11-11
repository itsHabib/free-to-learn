const source = { path: 'lab/LEARNER.md', anchor: 'trace-and-predict-the-decision' };

// Original guided teaching. The owner keeps expected answers out of learner item responses.
export const unit = {
  id: 'spatial', title: 'M1 · Decide from the owner’s positions', prerequisites: [],
  intro: 'A courier requests a pickup while standing away from the core. Calculate whether the owner may change cargo, using its positions and the tick on which it acts.',
  difficulty: 'The hardest case combines two coordinates, movement before interaction, and an inclusive cooldown boundary. Work through one change at a time.',
  objectives: [
    { id: 'spatial.range', kind: 'procedure', text: 'Compute squared distance from owner positions and apply an inclusive interaction radius.', prerequisites: [] },
    { id: 'spatial.tick-order', kind: 'procedure', text: 'Compute the courier’s position and range after one owner movement tick.', prerequisites: ['spatial.range'] },
    { id: 'spatial.cooldown', kind: 'procedure', text: 'Apply cooldown and range checks before changing cargo or score.', prerequisites: ['spatial.range', 'spatial.tick-order'] },
  ],
  sections: [
    {
      id: 'range', title: 'Measure the owner’s distance', objectiveIds: ['spatial.range'],
      paragraphs: [
        'The owner is the process that keeps the game’s authoritative state: the positions, cargo and score that count. A request asks for an action; it does not supply a new position or score. The courier and target each have x and y coordinates in millimetres. Subtract their x values and their y values to obtain the two separations.',
        'Square each separation and add: distanceSquared = dx × dx + dy × dy. The legal radius is 250 mm, so compare the sum with 250 × 250 = 62,500. A sum of exactly 62,500 is inside the inclusive boundary. A negative separation still contributes a positive square. Looking at only x misses targets separated along y.',
      ],
      worked: { prompt: 'An idle courier is at (1000, 1200) and the core at (1150, 1000). Is the courier in range?', steps: ['dx = 1000 − 1150 = −150 and dy = 1200 − 1000 = 200.', 'The squared distance is 22,500 + 40,000 = 62,500.', 'The sum equals the allowed squared radius, so this position passes the range check.'], answer: 'distanceSquared = 62500; withinRange = true.' },
      completion: { prompt: 'An idle courier is at (1000, 1000) and the target at (1200, 1200). Complete the sum and comparison.', steps: ['Both separations have magnitude 200.', 'The first squared separation is 40,000.'], missing: 'Add the second square, then decide whether the total is at most 62,500.' }, source,
    },
    {
      id: 'tick-order', title: 'Move before measuring range', objectiveIds: ['spatial.tick-order'],
      paragraphs: [
        'A tick is one simulation step. Receiving a direction stages it; receipt does not move the courier. On the next tick, the engine first moves an active courier by 250 mm, then measures range for an interaction. E adds 250 to x; W subtracts 250 from x; N subtracts 250 from y; S adds 250 to y. These exercises use active movement on open floor, away from walls and edges.',
        'Use the position after movement for the range calculation. If a courier begins 500 mm west of its target and moves east, it becomes 250 mm away. If it starts at the boundary and moves away, its old in-range position does not make the new position in range. In this section report only the new x, new y, distanceSquared and withinRange. The next section teaches the other rules needed to decide a complete interaction.',
      ],
      worked: { prompt: 'At tick 8, a courier at (1000, 1000) stages E. Its target is at (1500, 1000). Find its position and range after one movement tick.', steps: ['Receipt at tick 8 changes intent, not position.', 'Tick 9 moves the courier east to (1250, 1000).', 'The squared distance is (1250 − 1500)² + (1000 − 1000)² = 62,500, inside the inclusive boundary.'], answer: '{"x":1250,"y":1000,"distanceSquared":62500,"withinRange":true}' },
      completion: { prompt: 'A courier begins at (1000, 1000), stages N, and targets (1000, 500). Find its position and range after one movement tick.', steps: ['N changes y by −250.', 'After movement x remains 1000.'], missing: 'Find the new y, compute distanceSquared, and set withinRange to true or false.' }, source,
    },
    {
      id: 'cooldown', title: 'Authorize the state change once', objectiveIds: ['spatial.cooldown'],
      paragraphs: [
        'Cooldown is the earliest tick at which another interaction may succeed. The field nextInteractTick stores that tick. If currentTick is smaller, the result is cooldown even when the courier is also too far away. Once cooldown is ready, a distance above 62,500 gives range. A denied interaction leaves cargo, score and nextInteractTick unchanged.',
        'A successful interaction sets nextInteractTick to currentTick + 4. Equality is ready: an interaction at tick 12 is allowed when nextInteractTick is 12. Cargo chooses the target: an empty courier picks up the core, setting cargo to true without changing score; a loaded courier deposits at the depot, setting cargo to false and adding one to score. In the JSON answer, reason is exactly "cooldown" for a wait, "range" for a distant target, "pickup" for a successful pickup, or "deposit" for a successful deposit. A handled HTTP request can still produce a denied game action; denial alone establishes neither intent nor cheating.',
      ],
      worked: { prompt: 'At tick 20, a loaded courier stands on the depot with score 3 and nextInteractTick 20. It has one pending idle interaction.', steps: ['20 is not smaller than 20, so cooldown is ready.', 'The distance to the depot is zero.', 'The deposit clears cargo, raises score by one, and sets the next allowed tick to 24.'], answer: 'reason = deposit; cargo = false; score = 4; nextInteractTick = 24.' },
      completion: { prompt: 'At tick 20, the same courier instead has nextInteractTick 21.', steps: ['Range is still zero.', 'The cooldown comparison comes first.'], missing: 'Name the denial reason and which of cargo, score and nextInteractTick can change.' }, source,
    },
  ],
  masterySlots: ['boundary', 'refusal', 'transfer'],
  support: {
    milestones: ['Calculate both coordinate squares before comparing the radius.', 'Trace receipt, movement, then interaction without merging those steps.', 'Complete the guided checks, then repair the single proximity guard in your prepared M1 source workspace and run its real HTTP checks.'],
    hints: ['Locate the owner’s current position and the relevant target.', 'Check cooldown first, then compare dx² + dy² with the inclusive squared radius.', 'After a committed attempt, use its worked correction to change only the mistaken step.'], reference: 'lab/LEARNER.md',
  },
};

function seedNumber(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new TypeError('seed must be a non-negative safe integer');
  return seed;
}

function answerInteraction(input) {
  const deltas = { E: [250, 0], W: [-250, 0], N: [0, -250], S: [0, 250], idle: [0, 0] };
  const [dx, dy] = deltas[input.move];
  const x = input.actor.x + dx;
  const y = input.actor.y + dy;
  const distanceSquared = (x - input.target.x) ** 2 + (y - input.target.y) ** 2;
  if (input.tick < input.actor.nextInteractTick) return { x, y, reason: 'cooldown', cargo: input.actor.cargo, score: input.actor.score, nextInteractTick: input.actor.nextInteractTick };
  if (distanceSquared > 62500) return { x, y, reason: 'range', cargo: input.actor.cargo, score: input.actor.score, nextInteractTick: input.actor.nextInteractTick };
  return { x, y, reason: input.actor.cargo ? 'deposit' : 'pickup', cargo: !input.actor.cargo, score: input.actor.score + Number(input.actor.cargo), nextInteractTick: input.tick + 4 };
}

function rangeCase(n) {
  const offsets = [[150, 200], [151, 200], [0, 249], [0, 251], [200, 200], [0, 250]];
  const [a, b] = offsets[n % offsets.length];
  const target = { x: 1400 + Math.floor(n / 6) % 29 * 10, y: 1100 + Math.floor(n / 13) % 19 * 10 };
  const actor = { x: target.x + (n % 2 ? -a : a), y: target.y + (n % 3 ? b : -b) };
  const distanceSquared = a * a + b * b;
  return { inputs: { actor, target, radiusMm: 250 }, expected: { distanceSquared, withinRange: distanceSquared <= 62500 }, prompt: 'Use these owner positions before any movement. Return exactly JSON {distanceSquared,withinRange}: distanceSquared is a number; withinRange is true when the position is inside the inclusive radius, otherwise false.', explanation: `Both coordinates count: (${actor.x} − ${target.x})² + (${actor.y} − ${target.y})² = ${distanceSquared}. Compare with 62,500 using ≤, so withinRange is ${distanceSquared <= 62500}. Both coordinate separations belong in this calculation. Equality is allowed; a strict < comparison would incorrectly reject an exact-boundary position.` };
}

function movementRangeCase(n) {
  const move = ['E', 'W', 'N', 'S'][Math.floor(n / 3) % 4];
  const [dx, dy] = { E: [250, 0], W: [-250, 0], N: [0, -250], S: [0, 250] }[move];
  const actor = { x: 1500 + Math.floor(n / 17) % 20 * 10, y: 1500 };
  const separation = [0, 250, 500, 750][n % 4];
  const sign = Math.floor(n / 12) % 2 ? -1 : 1;
  const target = { x: actor.x + sign * dx / 250 * separation, y: actor.y + sign * dy / 250 * separation };
  const x = actor.x + dx;
  const y = actor.y + dy;
  const distanceSquared = (x - target.x) ** 2 + (y - target.y) ** 2;
  return { inputs: { actor, target, move, stepMm: 250, radiusMm: 250, floor: 'unobstructed; movement is active' }, expected: { x, y, distanceSquared, withinRange: distanceSquared <= 62500 }, prompt: 'Move the courier once in the stated direction, then measure range from its new position. Return exactly JSON {x,y,distanceSquared,withinRange}: x, y and distanceSquared are numbers; withinRange is true when distanceSquared <= 62500, otherwise false.', explanation: `${move} moves the courier from (${actor.x}, ${actor.y}) to (${x}, ${y}). Measure from there: (${x} − ${target.x})² + (${y} − ${target.y})² = ${distanceSquared}. The inclusive range comparison gives withinRange=${distanceSquared <= 62500}. Measuring before movement can give a different result.` };
}

function interactionCase(n, moving) {
  const direction = ['E', 'W', 'N', 'S'][Math.floor(n / 3) % 4];
  const delta = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] }[direction];
  const actor = { x: 1500 + Math.floor(n / 17) % 20 * 10, y: 1500, cargo: Boolean(Math.floor(n / 2) % 2), score: n % 5, nextInteractTick: 10 + n % 19 };
  const tick = actor.nextInteractTick + (Math.floor(n / 3) % 3 - 1);
  const separation = [250, 500, 750][n % 3];
  const target = { x: actor.x + delta[0] * separation, y: actor.y + delta[1] * separation };
  const inputs = { tick, actor, target, targetKind: actor.cargo ? 'depot' : 'core', move: moving ? direction : 'idle', pendingInteract: true, floor: 'unobstructed; movement is active' };
  const expected = answerInteraction(inputs);
  return { inputs, expected, prompt: 'Process one pending interaction at the stated tick. Movement shown in inputs happens first. Return exactly JSON {x,y,reason,cargo,score,nextInteractTick}. reason is one of "cooldown", "range", "pickup", "deposit"; cargo is a boolean; the other fields are numbers. Apply the cooldown rule before range.', explanation: `The post-movement position is (${expected.x}, ${expected.y}). Cooldown is ready only at tick ${actor.nextInteractTick} or later; the target then must be within 250 mm. The result is ${expected.reason}. A denial preserves cargo, score and cooldown; success ${actor.cargo ? 'deposits once' : 'picks up once'} and sets the next allowed tick to ${tick + 4}.` };
}

function transferCase(n) {
  const offsets = [[240, 320], [241, 320], [0, 399], [0, 401]];
  const [dx, dy] = offsets[n % 4];
  const cost = 3 + Math.floor(n / 4) % 5;
  const inputs = { station: { x: 2000, y: 1600 }, vehicle: { x: 2000 - dx, y: 1600 + dy, energy: cost + (Math.floor(n / 3) % 3 - 1), readyAtTick: 30 + Math.floor(n / 7) % 9 }, radiusMm: 400, cost, currentTick: 30 + Math.floor(n / 7) % 9 + (Math.floor(n / 5) % 2 ? 0 : -1) };
  const d2 = dx * dx + dy * dy;
  let reason = 'repair';
  if (inputs.currentTick < inputs.vehicle.readyAtTick) reason = 'cooldown';
  if (reason === 'repair' && d2 > 160000) reason = 'range';
  if (reason === 'repair' && inputs.vehicle.energy < cost) reason = 'energy';
  const accepted = reason === 'repair';
  return { inputs, expected: { accepted, reason, energy: inputs.vehicle.energy - (accepted ? cost : 0) }, prompt: 'A repair station has a different rule: first reject cooldown, then reject outside its inclusive 400 mm radius, then reject insufficient energy. Only an accepted repair deducts cost once. No movement happens in this request. Return JSON {accepted, reason, energy}; reason is cooldown, range, energy or repair.', explanation: `This action also spends a resource, so position alone cannot authorize it. The squared distance is ${d2}; the limit is 160,000. Check readiness, range and energy in that order. The first applicable result is ${reason}, leaving energy ${inputs.vehicle.energy - (accepted ? cost : 0)}. Denial never spends the cost.` };
}

export function makeItem({ mode, key, seed }) {
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw new TypeError('unknown item mode');
  const valid = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
  if (!valid.includes(key)) throw new TypeError('unknown spatial item key');
  const n = seedNumber(seed) + (mode === 'completion' ? 127 : mode === 'mastery' ? 263 : 0);
  let item;
  let objectiveIds;
  if (key === 'range' || key === 'boundary') { item = rangeCase(n); objectiveIds = ['spatial.range']; }
  if (key === 'tick-order') { item = movementRangeCase(n); objectiveIds = ['spatial.tick-order', 'spatial.range']; }
  if (key === 'cooldown' || key === 'refusal') { item = interactionCase(n, mode === 'mastery'); objectiveIds = ['spatial.cooldown', 'spatial.tick-order', 'spatial.range']; }
  if (key === 'transfer') { item = transferCase(n); objectiveIds = ['spatial.range', 'spatial.cooldown']; }
  if (mode === 'completion') {
    const { actor, target } = item.inputs;
    item.inputs.completedSteps = key === 'range'
      ? [`The x separation is ${actor.x} − ${target.x} = ${actor.x - target.x}; its square is ${(actor.x - target.x) ** 2}.`]
      : key === 'tick-order'
        ? [`After the one active movement step the position is (${item.expected.x}, ${item.expected.y}). Continue by calculating the squared distance from this position and comparing the radius.`]
        : [`Cargo is ${actor.cargo}, so the relevant target is the ${item.inputs.targetKind}. Its coordinates are (${target.x}, ${target.y}). Continue with the ready-tick comparison.`];
  }
  const hints = ['Identify whether you are measuring before movement or after it.', key === 'range' || key === 'tick-order' ? 'Square the x and y separations from the position being measured, add them, and compare with 62,500 using <=.' : 'Write the two squared separations; check the ready tick before authorizing any state change.', item.explanation];
  return { id: `spatial:${mode}:${key}:${seed}`, objectiveIds, ...item, prompt: `${mode === 'completion' ? 'Completion step: retain the supplied rule and fill the resulting state. ' : ''}${item.prompt}`, format: { type: 'json' }, hints: mode === 'mastery' ? [] : hints, source };
}
