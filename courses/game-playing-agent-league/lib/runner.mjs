/** Supplied trusted-local-code match host. This is not a hostile-code sandbox. */
import { GAME, generateScenario, legalActions, next, observe, stateKey, validateState, verifyScenario } from './game.mjs';
import { canonicalJSON, copyData, deepFreeze, sha256 } from './identity.mjs';
import { createRng, deriveSeed, uint32 } from './rng.mjs';

export class BudgetError extends Error {
  constructor(message = 'Simulation transition budget exceeded.') { super(message); this.name = 'BudgetError'; this.code = 'BUDGET_EXCEEDED'; }
}

function creditLimit(budget) {
  if (!Number.isInteger(budget) || budget < 0 || budget > 1_000_000) throw new RangeError('Decision budget must be an integer in 0..1000000.');
  return budget;
}

export function createDecisionContext(state, { player = state.currentPlayer, seed = 0, budget = 256, parameters = {}, rng } = {}) {
  validateState(state);
  if (player !== state.currentPlayer || state.terminal) throw new TypeError('A decision belongs to the current player of a nonterminal state.');
  creditLimit(budget);
  let used = 0;
  let exceeded = false;
  const oracle = Object.freeze({
    next(s, actionId) {
      if (used >= budget) { exceeded = true; throw new BudgetError(); }
      used++;
      return next(s, actionId).state;
    },
    legal: legalActions,
    terminal(s) { validateState(s); return s.terminal; },
    returns(s) { validateState(s); return s.returns === null ? null : s.returns.slice(); },
    currentPlayer(s) { validateState(s); return s.currentPlayer; },
    key: stateKey,
    get used() { return used; },
    get remaining() { return budget - used; },
    get exceeded() { return exceeded; },
  });
  return Object.freeze({
    state: deepFreeze(copyData(state)), observation: observe(state, player), player,
    legalActions: Object.freeze(legalActions(state)), rng: rng ?? createRng(uint32(seed)),
    parameters: deepFreeze(copyData(parameters)), budget, oracle,
  });
}

export function snapshotPolicy({ name, decide, source, parameters = {}, configuration = {}, metadata = {} }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof decide !== 'function') throw new TypeError('Snapshot needs a short name and a decision function.');
  if (source !== undefined && typeof source !== 'string') throw new TypeError('Source identity must be supplied as text.');
  const sourceText = source ?? Function.prototype.toString.call(decide);
  const data = { sourceHash: sha256(sourceText), parameterHash: sha256(parameters), configurationHash: sha256(configuration), metadataHash: sha256(metadata) };
  return Object.freeze({
    id: sha256(data), name, ...data, sourceIdentity: source === undefined ? 'function-text-only' : 'caller-supplied-source',
    parameters: deepFreeze(copyData(parameters)), configuration: deepFreeze(copyData(configuration)),
    metadata: deepFreeze(copyData(metadata)), decide,
  });
}

export function policyDescriptor(policy) {
  if (!policy || typeof policy.id !== 'string' || typeof policy.decide !== 'function') throw new TypeError('Expected a snapshotPolicy result.');
  return deepFreeze({ id: policy.id, name: policy.name, sourceHash: policy.sourceHash, parameterHash: policy.parameterHash,
    configurationHash: policy.configurationHash, metadataHash: policy.metadataHash, sourceIdentity: policy.sourceIdentity,
    parameters: copyData(policy.parameters), configuration: copyData(policy.configuration), metadata: copyData(policy.metadata) });
}

function canonicalEqual(actual, expected, message) {
  if (canonicalJSON(actual) !== canonicalJSON(expected)) throw new Error(message);
}

function matchIdentity({ planId, scenario, policySnapshots, policySeeds, budget }) {
  return sha256({ schemaVersion: 1, rulesHash: GAME.rulesHash, planId, scenarioId: scenario.id, stateHash: scenario.stateHash,
    policyIds: policySnapshots.map(policy => policy.id), policySeeds, budget });
}

/** Synchronous policies only. Arbitrary infinite loops need external process cancellation. */
export function runMatch({ policies, scenario = generateScenario(0, 0), seed = 0, policySeeds, budget = 256, planId = '' }) {
  if (!Array.isArray(policies) || policies.length !== 2) throw new TypeError('A match needs exactly two policy snapshots.');
  verifyScenario(scenario);
  uint32(seed);
  creditLimit(budget);
  if (typeof planId !== 'string') throw new TypeError('planId must be a string.');
  const policySnapshots = policies.map(policyDescriptor);
  const seeds = policySeeds ?? policies.map(policy => deriveSeed('match-policy', seed, scenario.stateHash, policy.id));
  if (!Array.isArray(seeds) || seeds.length !== 2) throw new TypeError('Need exactly two policy seeds.');
  seeds.forEach(value => uint32(value));
  const randoms = seeds.map(createRng);
  let state = deepFreeze(copyData(scenario.state));
  const initialState = copyData(state);
  const steps = [];
  const totalCredits = [0, 0];
  let failure = null;
  while (!state.terminal) {
    const actor = state.currentPlayer;
    const context = createDecisionContext(state, { player: actor, budget, parameters: policies[actor].parameters, rng: randoms[actor] });
    const observationHash = sha256(context.observation);
    let actionId = null;
    try {
      const answer = policies[actor].decide(context);
      if (answer && typeof answer.then === 'function') throw Object.assign(new Error('Async policies are not supported.'), { code: 'ASYNC_POLICY' });
      if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
        const keys = Object.keys(answer);
        if (keys.some(key => !['actionId', 'diagnostics'].includes(key))) throw Object.assign(new Error('Decision contains unknown fields.'), { code: 'INVALID_OUTPUT' });
        actionId = answer.actionId;
      } else actionId = answer;
      if (context.oracle.exceeded) throw new BudgetError();
      if (!Number.isInteger(actionId) || !context.legalActions.includes(actionId)) throw Object.assign(new Error('Policy returned an illegal action.'), { code: 'ILLEGAL_ACTION' });
    } catch (error) {
      failure = { actor, ply: state.ply, code: context.oracle.exceeded ? 'BUDGET_EXCEEDED' : String(error?.code ?? 'POLICY_EXCEPTION'),
        message: String(error?.message ?? error).slice(0, 500), observationHash, creditsUsed: context.oracle.used,
        returnedAction: Number.isFinite(actionId) ? actionId : null };
    }
    totalCredits[actor] += context.oracle.used;
    if (failure) break;
    const result = next(state, actionId);
    steps.push({ ply: state.ply, actor, observationHash, actionId, stateHash: stateKey(result.state),
      state: copyData(result.state), event: result.event, creditsUsed: context.oracle.used });
    state = result.state;
  }
  const winner = failure ? 1 - failure.actor : state.returns.indexOf(1);
  const record = {
    schemaVersion: 1, type: 'league-match', planId, scenario: copyData(scenario), rulesHash: GAME.rulesHash,
    initialState, policySnapshots, policySeeds: seeds.slice(), budget,
    runtime: { node: process.version, platform: process.platform, arch: process.arch }, steps,
    status: failure ? 'forfeit' : 'completed',
    result: { winner, returns: winner === 0 ? [1, -1] : [-1, 1], reason: failure ? 'policy-forfeit' : 'game-terminal', ...(failure ? { failure } : {}) },
    finalStateHash: stateKey(state), totalCredits,
  };
  record.id = matchIdentity(record);
  return deepFreeze(record);
}

export function verifyReplay(record) {
  if (!record || record.schemaVersion !== 1 || record.type !== 'league-match' || record.rulesHash !== GAME.rulesHash) throw new Error('Wrong replay schema or rules.');
  verifyScenario(record.scenario);
  creditLimit(record.budget);
  if (!Array.isArray(record.policySnapshots) || record.policySnapshots.length !== 2 || !Array.isArray(record.policySeeds) || record.policySeeds.length !== 2) throw new Error('Replay policy/seed roster is incomplete.');
  record.policySeeds.forEach(seed => uint32(seed));
  for (const policy of record.policySnapshots) {
    canonicalEqual(policy.parameterHash, sha256(policy.parameters), 'Replay parameter hash mismatch.');
    canonicalEqual(policy.configurationHash, sha256(policy.configuration), 'Replay configuration hash mismatch.');
    canonicalEqual(policy.metadataHash, sha256(policy.metadata), 'Replay metadata hash mismatch.');
    const identity = { sourceHash: policy.sourceHash, parameterHash: policy.parameterHash, configurationHash: policy.configurationHash, metadataHash: policy.metadataHash };
    canonicalEqual(policy.id, sha256(identity), 'Replay policy identity mismatch.');
  }
  canonicalEqual(record.id, matchIdentity(record), 'Replay match identity mismatch.');
  canonicalEqual(record.initialState, record.scenario.state, 'Replay initial state differs from scenario.');
  if (!Array.isArray(record.steps)) throw new Error('Replay needs a step list.');
  let state = copyData(record.initialState);
  const used = [0, 0];
  for (const entry of record.steps) {
    if (entry.ply !== state.ply || entry.actor !== state.currentPlayer) throw new Error('Replay actor/ply mismatch.');
    canonicalEqual(entry.observationHash, sha256(observe(state, state.currentPlayer)), 'Replay observation hash mismatch.');
    if (!Number.isInteger(entry.creditsUsed) || entry.creditsUsed < 0 || entry.creditsUsed > record.budget) throw new Error('Replay has invalid simulation credit use.');
    const result = next(state, entry.actionId);
    canonicalEqual(entry.event, result.event, 'Replay event differs from actual transition.');
    canonicalEqual(entry.state, result.state, 'Replay embedded state differs from actual transition.');
    canonicalEqual(entry.stateHash, stateKey(result.state), 'Replay state hash mismatch.');
    used[entry.actor] += entry.creditsUsed;
    state = result.state;
  }
  let winner;
  if (record.status === 'completed') {
    if (!state.terminal || record.result.failure !== undefined) throw new Error('Completed replay is not a game termination.');
    winner = state.returns.indexOf(1);
    canonicalEqual(record.result.reason, 'game-terminal', 'Completed replay reason mismatch.');
  } else if (record.status === 'forfeit') {
    const failure = record.result.failure;
    if (state.terminal || !failure || failure.actor !== state.currentPlayer || failure.ply !== state.ply || typeof failure.code !== 'string' || typeof failure.message !== 'string') throw new Error('Invalid forfeit declaration.');
    if (!Number.isInteger(failure.creditsUsed) || failure.creditsUsed < 0 || failure.creditsUsed > record.budget) throw new Error('Invalid forfeit credit use.');
    canonicalEqual(failure.observationHash, sha256(observe(state, state.currentPlayer)), 'Forfeit observation mismatch.');
    used[failure.actor] += failure.creditsUsed;
    winner = 1 - failure.actor;
    canonicalEqual(record.result.reason, 'policy-forfeit', 'Forfeit reason mismatch.');
  } else throw new Error('Replay must be completed or forfeit; unresolved runs are not scored.');
  canonicalEqual(record.result.winner, winner, 'Replay winner mismatch.');
  canonicalEqual(record.result.returns, winner === 0 ? [1, -1] : [-1, 1], 'Replay returns mismatch.');
  canonicalEqual(record.finalStateHash, stateKey(state), 'Replay final state hash mismatch.');
  canonicalEqual(record.totalCredits, used, 'Replay credit totals mismatch.');
  return true;
}

/** Stronger than trajectory replay: reruns the declared policies and compares decisions. */
export function verifyPolicyRerun(record, policies) {
  verifyReplay(record);
  if (!Array.isArray(policies) || policies.length !== 2) throw new TypeError('Policy rerun needs the two actual snapshots in seat order.');
  canonicalEqual(policies.map(policy => policy.id), record.policySnapshots.map(policy => policy.id), 'Policy rerun snapshot identity mismatch.');
  const fresh = runMatch({ policies, scenario: record.scenario, policySeeds: record.policySeeds, budget: record.budget, planId: record.planId });
  canonicalEqual(fresh.steps, record.steps, 'Policy rerun decisions or simulation credits differ.');
  canonicalEqual(fresh.status, record.status, 'Policy rerun status differs.');
  canonicalEqual(fresh.result, record.result, 'Policy rerun result differs.');
  canonicalEqual(fresh.finalStateHash, record.finalStateHash, 'Policy rerun final state differs.');
  return true;
}

export const rerunMatch = verifyPolicyRerun;

/** Stable paired schedule: same scenario, both policy-seat assignments, same policy seeds. */
export function runPaired({ policies, scenarios, seeds = [0], budget = 256, planId = '' }) {
  if (!Array.isArray(policies) || policies.length !== 2) throw new TypeError('runPaired expects two snapshots.');
  if (!Array.isArray(scenarios) || scenarios.length === 0 || !Array.isArray(seeds) || seeds.length === 0) throw new TypeError('Paired comparison needs scenarios and seeds.');
  const records = [];
  for (const scenario of scenarios) {
    for (const seed of seeds) {
      uint32(seed);
      const stableSeeds = new Map(policies.map(policy => [policy.id, deriveSeed('paired-policy', seed, scenario.stateHash, policy.id)]));
      for (const seatPolicies of [policies, [policies[1], policies[0]]]) {
        records.push(runMatch({ policies: seatPolicies, scenario, policySeeds: seatPolicies.map(policy => stableSeeds.get(policy.id)), budget, planId }));
      }
    }
  }
  return records;
}

