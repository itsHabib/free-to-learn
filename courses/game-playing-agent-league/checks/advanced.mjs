import {initialState, createState} from '../lib/game.mjs';
import {checkFeatures, predictLinear} from '../lib/training.mjs';
import {createRng} from '../lib/rng.mjs';
import {createPlan} from '../lib/league.mjs';
import {blockBootstrap} from '../lib/statistics.mjs';
import {copyData, deepFreeze} from '../lib/identity.mjs';

function suite(name, cases) {
  const checks = cases.map(([id, requirement, run]) => {
    try { const observed = run(); return {id, ok: true, requirement, ...(observed === undefined ? {} : {observed})}; }
    catch (error) { return {id, ok: false, requirement, reason: error.message, ...(error.input ? {failureInput: error.input} : {})}; }
  });
  return {ok: checks.every(check => check.ok), scope: 'public-practice', name, checks,
    limitation: 'These finite public controls are not a hidden assessment, proof of general correctness, or evidence of human learning.'};
}
function requireThat(condition, message, input) { if (!condition) throw Object.assign(new Error(message), {input}); }
function rejects(run, message) { let rejected = false; try { run(); } catch { rejected = true; } requireThat(rejected, message); }
function close(actual, expected, tolerance = 1e-9) { requireThat(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `Expected ${expected} within ${tolerance}; received ${actual}.`); }

// Public practice positions deliberately vary several plausible feature families.
// All are nonterminal, currentPlayer=0, ply=0: metadata cannot substitute for a board measurement.
function featurePosition(id, own, other) {
  const board = Array(25).fill(-1);
  for (const cell of own) board[cell] = 0;
  for (const cell of other) board[cell] = 1;
  return {id, state: createState({board, currentPlayer: 0, ply: 0})};
}
const FEATURE_POSITIONS = [
  {id: 'opening', state: initialState()},
  featurePosition('material-ahead', [6, 8], [18]),
  featurePosition('material-behind', [6], [16, 18]),
  featurePosition('balanced-counts', [6], [18]),
  featurePosition('advanced', [16], [18]),
  featurePosition('wide-arrangement', [10], [19]),
  featurePosition('central-arrangement', [12], [19]),
  featurePosition('mixed-advantage', [12, 13], [18]),
];
function featureObservations(features) {
  let dimensions;
  return FEATURE_POSITIONS.map(({id, state}) => ({id, vectors: [0, 1].map(player => {
    function extract() {
      const input = copyData(state), before = JSON.stringify(input);
      const vector = Array.from(checkFeatures(features(input, player)));
      requireThat(JSON.stringify(input) === before, 'Feature extraction changed its input state.', {id, player});
      if (dimensions === undefined) dimensions = vector.length;
      requireThat(vector.length === dimensions, 'Feature dimension changed between positions or perspectives.', {id, player});
      return vector;
    }
    const vector = extract();
    requireThat(JSON.stringify(vector) === JSON.stringify(extract()), 'Feature extraction changed on repeated identical input.', {id, player});
    return vector;
  })}));
}

export function checkValueModel({features, fit}) {
  const samples = [-1, -0.5, 0, 0.5, 1].map((x, index) => ({x: [1, x], target: 0.2 + 0.6 * x, episodeId: `e${index}`, scenarioId: `s${index}`}));
  return suite('Value features and fitting', [
    ['features-contract', 'Features have one bounded, reproducible dimension and do not mutate any supplied position.', () => {
      const vectors = featureObservations(features);
      return {dimensions: vectors[0].vectors[0].length, positions: vectors.length};
    }],
    ['features-board-sensitivity', 'At each fixed player perspective, distinguish at least some boards across material, advancement and arrangement changes; actor and ply stay fixed.', () => {
      const observations = featureObservations(features);
      const distinct = [0, 1].map(player => new Set(observations.map(item => JSON.stringify(item.vectors[player]))).size);
      requireThat(distinct.every(count => count > 1),
        'The feature vector did not change across the tested boards for a fixed requested player. Player ID, ply or a constant alone cannot represent a position.',
        {positions: FEATURE_POSITIONS.map(item => ({id: item.id, state: item.state})), distinctVectorsByPlayer: distinct});
      return {distinctVectorsByPlayer: distinct, everyMoveMustChangeFeatures: false};
    }],
    ['features-perspective', 'Preserve the requested player perspective on at least one feature-relevant position; balanced positions may legitimately have equal vectors.', () => {
      const observations = featureObservations(features);
      const witnesses = observations.filter(item => JSON.stringify(item.vectors[0]) !== JSON.stringify(item.vectors[1])).map(item => item.id);
      requireThat(witnesses.length > 0,
        'The tested representation never distinguishes the requested player. Keep the value target and feature perspective aligned; no exact sign convention or vector shape is required.');
      return {perspectiveWitnesses: witnesses};
    }],
    ['fit-synthetic', 'Fit an original small regression fixture rather than returning a fixed vector.', () => {
      const input = copyData(samples), before = JSON.stringify(input);
      const model = fit(input, {seed: 13, epochs: 600, learningRate: 0.1});
      requireThat(JSON.stringify(input) === before, 'Fitting mutated supplied training examples.');
      const errors = samples.map(example => (predictLinear(model.weights, example.x) - example.target) ** 2);
      const mse = errors.reduce((sum, value) => sum + value, 0) / errors.length;
      requireThat(mse < 0.002, `Synthetic-fit MSE ${mse} is too large; verify labels, update direction and coefficient order.`, samples);
      return {meanSquaredError: mse};
    }],
    ['fit-changed-labels', 'Changed training labels must produce corresponding changed predictions.', () => {
      const changed = samples.map(example => ({...example, target: -0.3 - 0.4 * example.x[1]}));
      const model = fit(copyData(changed), {seed: 19, epochs: 600, learningRate: 0.1});
      const mse = changed.reduce((sum, example) => sum + (predictLinear(model.weights, example.x) - example.target) ** 2, 0) / changed.length;
      requireThat(mse < 0.002, `Changed-label MSE ${mse} is too large. A model cannot ignore its data.`, changed);
      return {meanSquaredError: mse};
    }],
    ['fit-invalid', 'Reject nonfinite and inconsistent training examples instead of producing unusable parameters.', () => {
      rejects(() => fit([{x: [1, NaN], target: 1}], {seed: 1, epochs: 2, learningRate: 0.1}), 'NaN input was not rejected.');
      rejects(() => fit([{x: [1], target: 1}, {x: [1, 0], target: 0}], {seed: 1, epochs: 2, learningRate: 0.1}), 'Inconsistent dimensions were not rejected.');
    }],
  ]);
}

export function checkSampler(sampleOpponent) {
  const archive = [{id: 'first', weight: 0.2}, {id: 'middle', weight: 0.3}, {id: 'last', weight: 0.5}];
  return suite('Opponent archive sampling', [
    ['sampler-frequency', 'Sample the declared distribution, including its last entry.', () => {
      const rng = createRng(91), counts = {first: 0, middle: 0, last: 0}, before = JSON.stringify(archive);
      for (let i = 0; i < 8000; i++) { const id = sampleOpponent(archive, rng); requireThat(Object.hasOwn(counts, id), `Unknown opponent ${id}.`); counts[id]++; }
      requireThat(JSON.stringify(archive) === before, 'Sampler mutated its archive.');
      for (const entry of archive) requireThat(Math.abs(counts[entry.id] / 8000 - entry.weight) < 0.03, `Observed ${entry.id} frequency ${counts[entry.id] / 8000} differs from ${entry.weight}.`, archive);
      return counts;
    }],
    ['sampler-reproduce', 'A fixed seed and archive reproduce the same selected IDs.', () => {
      const one = createRng(7), two = createRng(7);
      const a = Array.from({length: 40}, () => sampleOpponent(archive, one)), b = Array.from({length: 40}, () => sampleOpponent(archive, two));
      requireThat(JSON.stringify(a) === JSON.stringify(b), 'Seeded sampling did not reproduce.');
    }],
    ['sampler-zero-mass', 'Never select a zero-probability opponent.', () => {
      const fixed = [{id: 'never', weight: 0}, {id: 'only', weight: 1}, {id: 'also-never', weight: 0}], rng = createRng(12);
      for (let i = 0; i < 30; i++) requireThat(sampleOpponent(fixed, rng) === 'only', 'A zero-weight item was selected.');
    }],
    ['sampler-invalid', 'Reject negative, unnormalized, nonfinite or duplicate-ID archive distributions.', () => {
      for (const bad of [[], [{id: 'a', weight: -1}, {id: 'b', weight: 2}], [{id: 'a', weight: 0.5}], [{id: 'a', weight: NaN}], [{id: 'a', weight: 0.5}, {id: 'a', weight: 0.5}]]) rejects(() => sampleOpponent(bad, createRng(1)), 'Invalid archive was not rejected.');
    }],
  ]);
}

export function reportPracticeFixture() {
  const plan = createPlan({policies: [{id: 'A'}, {id: 'B'}], scenarios: [{id: 'scenario-1', stateHash: 'state-1'}, {id: 'scenario-2', stateHash: 'state-2'}, {id: 'scenario-3', stateHash: 'state-3'}], seeds: [3, 9], budget: 16});
  const records = plan.roster.map(slot => {
    const valueForA = slot.scenarioId === 'scenario-3' ? -1 : 1;
    const first = slot.policies[0] === 'A' ? valueForA : -valueForA;
    return {slotId: slot.id, record: {planId: plan.id, scenario: {id: slot.scenarioId}, policySnapshots: slot.policies.map(id => ({id})), policySeeds: [...slot.policySeeds], budget: plan.budget, status: 'completed', result: {returns: [first, -first]}}};
  });
  return {plan, records};
}

export function checkReport(summarize) {
  return suite('Complete paired evaluation', [
    ['report-paired', 'Use the planned denominator, normalize seat perspective and aggregate by scenario.', () => {
      const {records, plan} = reportPracticeFixture(), before = JSON.stringify({records, plan});
      const result = summarize(records, plan);
      requireThat(result.complete === true && result.expected === 12 && result.observed === 12, 'A complete 12-game roster was not recognized.');
      close(result.matrix?.[0]?.[1], 1 / 3); close(result.matrix?.[1]?.[0], -1 / 3);
      const comparison = result.comparisons?.find(item => item.pair?.[0] === 'A' && item.pair?.[1] === 'B');
      requireThat(comparison?.units === 3 && comparison.blocks?.length === 3, 'The interval must use three scenario blocks, not twelve games.');
      const values = comparison.blocks.map(block => block.value).sort((a, b) => a - b);
      requireThat(JSON.stringify(values) === JSON.stringify([-1, 1, 1]), 'Incorrect scenario-block values.', records);
      close(comparison.estimate, 1 / 3);
      const expectedInterval=blockBootstrap(values,{seed:1,resamples:2000,confidence:0.95}).interval;
      requireThat(Array.isArray(comparison.interval)&&comparison.interval.length===2,'Missing interval');
      comparison.interval.forEach((v,i)=>close(v,expectedInterval[i]));
      requireThat(JSON.stringify({records, plan}) === before, 'Report generation changed its input evidence.');
    }],
    ['report-missing', 'Missing evidence leaves the planned denominator visible and the result incomplete.', () => {
      const {records, plan} = reportPracticeFixture(), missing = records.pop();
      const result = summarize(records, plan);
      requireThat(result.complete === false && result.expected === 12 && result.observed === 11 && result.missing?.includes(missing.slotId), 'A missing game was hidden or counted as a result.');
    }],
    ['report-duplicate', 'Recognize duplicate match IDs without counting the same game twice.', () => {
      const {records, plan} = reportPracticeFixture(); records.push(copyData(records[0]));
      const result = summarize(records, plan);
      requireThat(result.complete === false && result.expected === 12 && result.observed === 12 && result.duplicates?.includes(records[0].slotId), 'Duplicate evidence was double-counted or hidden.');
    }],
    ['report-conflict', 'Conflicting results for one slot cannot establish a complete comparison.', () => {
      const {records, plan} = reportPracticeFixture(), conflict = copyData(records[0]); conflict.record.result.returns.reverse(); records.push(conflict);
      const result = summarize(records, plan);
      requireThat(result.complete === false && result.observed <= 12, 'Conflicting duplicate evidence was silently accepted.');
    }],
    ['report-wrong-plan', 'Reject wrong-plan, wrong-seat and unresolved infrastructure records.', () => {
      for (const field of ['plan', 'seat', 'seed', 'budget', 'failure']) {
        const {records, plan} = reportPracticeFixture();
        if (field === 'plan') records[0].record.planId = 'other';
        if (field === 'seat') records[0].record.policySnapshots.reverse();
        if (field === 'seed') records[0].record.policySeeds[0]^=1;
        if (field === 'budget') records[0].record.budget+=1;
        if (field === 'failure') { records[0].record.status = 'infrastructure-failure'; records[0].record.result = null; }
        const result = summarize(records, plan);
        requireThat(result.complete === false && result.invalid?.length > 0, `Invalid ${field} record was accepted.`);
      }
    }],
  ]);
}

export function checkGap(nashGap) {
  return suite('Restricted-game Nash gap', [
    ['gap-cycle', 'Correctly compute a cyclic matrix gap and name both unilateral responses.', () => {
      const matrix = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]], uniform = [1 / 3, 1 / 3, 1 / 3];
      close(nashGap(matrix, uniform, uniform), 0);
      close(nashGap(matrix, [1, 0, 0], [1, 0, 0]), 2);
    }],
    ['gap-rectangular', 'Handle different row/column roster sizes and mixed weights.', () => close(nashGap([[1, -1, 0], [0, 1, -1]], [0.5, 0.5], [0.2, 0.3, 0.5]), 0.4)],
    ['gap-invalid', 'Reject malformed matrices/distributions instead of coercing missing payoffs to zero.', () => {
      for (const [matrix, x, y] of [[[[]], [1], []], [[[NaN]], [1], [1]], [[[1, 2], [0]], [0.5, 0.5], [0.5, 0.5]], [[[0]], [0.2], [1]], [[[0]], [-1], [1]]]) rejects(() => nashGap(matrix, x, y), 'An invalid empirical game was accepted.');
    }],
  ]);
}

function responseContext({optimisticTrap = false, responder = 0, tied = false, budget = 20} = {}) {
  const leaf = value => ({terminal: true, returns: responder === 0 ? [value, -value] : [-value, value], currentPlayer: -1});
  const nodes = {
    root: {terminal: false, returns: null, currentPlayer: responder, actions: [{id: 11, to: 'left'}, {id: 29, to: 'right'}]},
    left: {terminal: false, returns: null, currentPlayer: 1 - responder, actions: [{id: 3, to: 'a'}, {id: 8, to: 'b'}]},
    right: {terminal: false, returns: null, currentPlayer: 1 - responder, actions: [{id: 4, to: 'c'}, {id: 9, to: 'd'}]},
    a: leaf(1), b: leaf(-1), c: leaf(tied ? 0.8 : 0.4), d: leaf(tied ? 0.8 : 0.4),
  };
  let used = 0, exceeded = false;
  const state = id => deepFreeze({id, ...copyData(nodes[id])});
  const oracle = {next(s, action) { if (used >= budget) { exceeded=true; throw new Error('Response budget exceeded.'); } used++; const edge = nodes[s.id].actions?.find(edge => edge.id === action); if (!edge) throw new Error('Illegal tree action.'); return state(edge.to); },
    legal: s => nodes[s.id].actions?.map(edge => edge.id) ?? [], terminal: s => nodes[s.id].terminal, returns: s => nodes[s.id].returns,
    currentPlayer: s => nodes[s.id].currentPlayer, get used() {return used;}, get remaining() {return budget - used;}, get exceeded(){return exceeded;}};
  return {state: state('root'), player: responder, legalActions: [11, 29], parameters: {maxDepth: 2}, oracle, rng: createRng(1),
    evaluate: () => 0,
    opponentPolicy(s) { const actions = nodes[s.id].actions; if (s.id === 'left') return [{actionId: 3, probability: optimisticTrap ? 0.1 : 0.9}, {actionId: 8, probability: optimisticTrap ? 0.9 : 0.1}]; return actions.map(edge => ({actionId: edge.id, probability: 1 / actions.length})); }};
}
export function checkResponse(responsePolicy) {
  return suite('Counterpolicy against a fixed opponent model', [
    ['response-budget', 'Inadequate computation returns a legal fallback without hiding an overrun.',()=>{for(const budget of [0,1,3]){const context=responseContext({budget});const answer=responsePolicy(context);requireThat(context.legalActions.includes(answer?.actionId??answer),'Illegal fallback');requireThat(!context.oracle.exceeded && context.oracle.used<=budget,'Caught or uncaught budget overrun');}}],
    ['response-expectation', 'Use opponent probabilities: expected-value response can differ from minimax.', () => {
      const context = responseContext(), answer = responsePolicy(context); const action = answer?.actionId ?? answer;
      requireThat(action === 11, `Expected action 11 (return 0.8), not worst-case action 29 (return 0.4); got ${action}.`);
      requireThat(context.oracle.used <= 20, 'Response exceeded its simulation budget.');
    }],
    ['response-not-optimism', 'An opponent is not assumed to select the action most favorable to you.', () => {
      const answer = responsePolicy(responseContext({optimisticTrap: true}));
      requireThat((answer?.actionId ?? answer) === 29, 'Expected action 29; the tempting branch has mean -0.8 under this opponent.');
    }],
    ['response-perspective', 'The responder may be either player; ties accept either maximizing action.', () => {
      const answer = responsePolicy(responseContext({responder: 1})); requireThat((answer?.actionId ?? answer) === 11, 'Player-1 utility was inverted.');
      const tied = responsePolicy(responseContext({tied: true})); requireThat([11, 29].includes(tied?.actionId ?? tied), 'A tied maximizing move was not returned.');
    }],
  ]);
}
