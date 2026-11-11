import {createRng} from './rng.mjs';

function finiteArray(values, label) {
  if (!Array.isArray(values) || !values.length || Array.from(values).some(value => !Number.isFinite(value))) throw new TypeError(`${label} must be a nonempty array of finite numbers.`);
}
export function mean(values) { finiteArray(values, 'Values'); return values.reduce((sum, value) => sum + value, 0) / values.length; }
export function quantile(sorted, probability) {
  finiteArray(sorted, 'Sorted values');
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('Probability must be in [0,1].');
  if (sorted.some((value, index) => index && value < sorted[index - 1])) throw new Error('Quantile input must be sorted.');
  const location = (sorted.length - 1) * probability;
  const left = Math.floor(location), right = Math.ceil(location);
  return sorted[left] + (location - left) * (sorted[right] - sorted[left]);
}

// Callers own the experimental unit: pass one value per independent scenario
// block, never one value per move, seat or bootstrap replicate.
export function blockBootstrap(blockValues, {seed = 1, resamples = 2000, confidence = 0.95} = {}) {
  finiteArray(blockValues, 'Scenario block values');
  if (!Number.isInteger(resamples) || resamples < 100 || resamples > 20000) throw new RangeError('Use 100–20,000 bootstrap resamples.');
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) throw new RangeError('Confidence must be between zero and one.');
  const rng = createRng(seed), values = [];
  for (let replicate = 0; replicate < resamples; replicate++) {
    let total = 0;
    for (let index = 0; index < blockValues.length; index++) total += blockValues[Math.floor(rng() * blockValues.length)];
    values.push(total / blockValues.length);
  }
  values.sort((left, right) => left - right);
  const tail = (1 - confidence) / 2;
  return {
    estimate: mean(blockValues), interval: [quantile(values, tail), quantile(values, 1 - tail)],
    units: blockValues.length, resamples, seed, confidence, method: 'paired-scenario-block-percentile',
    scope: 'Approximate interval conditional on the declared scenario sampling model. Small samples and dependent blocks can invalidate interpretation.',
  };
}

export function validateDistribution(weights, length) {
  if (!Array.isArray(weights) || weights.length !== length || Array.from(weights).some(weight => !Number.isFinite(weight) || weight < 0)) throw new TypeError('Distribution has invalid weights or length.');
  if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-12) throw new RangeError('Distribution weights must sum to one.');
  return weights;
}

// A supplied exact oracle on small explicit trees, not a full-game solver.
// Node: {player:0|1, actions:[{id,to}]} or {returns:[r0,r1]}.
// Opponent policy: {nodeId:{actionId:probability}}. Fixed Markov policy only.
export function exactBestResponse(tree, opponentPolicy, responder) {
  if (![0, 1].includes(responder) || !tree || typeof tree.root !== 'string' || !tree.nodes || typeof tree.nodes !== 'object') throw new TypeError('Invalid tree or responder.');
  const active = new Set(), choices = {}, memo = new Map();
  function solve(id, depth = 0) {
    if (depth > 100 || active.has(id)) throw new Error('Tree is cyclic or exceeds the bounded oracle depth.');
    if (memo.has(id)) return memo.get(id);
    const node = tree.nodes[id];
    if (!node || typeof node !== 'object') throw new Error(`Missing tree node ${id}.`);
    if (Array.isArray(node.returns)) {
      if (node.returns.length !== 2 || node.returns.some(value => !Number.isFinite(value)) || Math.abs(node.returns[0] + node.returns[1]) > 1e-12) throw new Error('Terminal returns must be finite and zero-sum.');
      return node.returns[responder];
    }
    if (![0, 1].includes(node.player) || !Array.isArray(node.actions) || !node.actions.length || new Set(node.actions.map(action => String(action.id))).size !== node.actions.length) throw new Error(`Malformed action node ${id}.`);
    active.add(id);
    const values = node.actions.map(action => solve(action.to, depth + 1));
    active.delete(id);
    let value;
    if (node.player === responder) {
      value = Math.max(...values);
      choices[id] = node.actions.filter((_, index) => Math.abs(values[index] - value) < 1e-12).map(action => action.id);
    } else {
      const policy = opponentPolicy?.[id];
      if (!policy || Object.keys(policy).length !== node.actions.length) throw new Error(`Missing complete opponent distribution at ${id}.`);
      const probabilities = node.actions.map(action => policy[String(action.id)]);
      validateDistribution(probabilities, node.actions.length);
      value = values.reduce((sum, outcome, index) => sum + outcome * probabilities[index], 0);
    }
    memo.set(id, value);
    return value;
  }
  return {value: solve(tree.root), choices, scope: 'Exact response to this supplied finite tree and fixed Markov policy only.'};
}
