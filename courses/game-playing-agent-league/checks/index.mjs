import { createState, initialState, generateScenario, legalActions, next } from '../lib/game.mjs';
import { createDecisionContext } from '../lib/runner.mjs';
import { actionOf, makeTreeContext, report, requireCondition, runCheck, synchronousResult } from './check-utils.mjs';
import { PRACTICE_TREES } from './practice-trees.mjs';

function callable(value, name) {
  requireCondition(typeof value === 'function', `Export ${name} as a function from the learner file.`);
}

function decision(fn, context) {
  const before = JSON.stringify(context.state);
  const output = synchronousResult(fn, context);
  const action = actionOf(output);
  requireCondition(Number.isInteger(action) && context.legalActions.includes(action),
    'Return an integer action from context.legalActions.',
    { failureInput: { state: context.state, legalActions: context.legalActions }, observed: output });
  requireCondition(JSON.stringify(context.state) === before,
    'The policy changed the supplied state. Decisions must leave observations unchanged.');
  requireCondition(!context.oracle.exceeded && !context.oracle.overrun,
    'Catching a budget error does not erase the overrun. Check oracle.remaining before simulating.');
  return action;
}

export function checkBaseline(chooseAction) {
  const checks = [];
  checks.push(runCheck('B01', 'Choose a legal action in several supplied game positions.', () => {
    callable(chooseAction, 'chooseAction');
    const states = [initialState(), ...[3, 19, 47, 101].map(seed => generateScenario(seed, 5).state)];
    for (const [index, state] of states.entries()) {
      decision(chooseAction, createDecisionContext(state, { seed: 100 + index, budget: 0 }));
    }
    return { positions: states.length };
  }, '01.1'));
  checks.push(runCheck('B02', 'Repeat a decision with the same state and supplied seed.', () => {
    callable(chooseAction, 'chooseAction');
    for (const seed of [0, 1, 2, 7, 43, 500, 4294967295]) {
      const state = initialState();
      const first = decision(chooseAction, createDecisionContext(state, { seed, budget: 0 }));
      const repeat = decision(chooseAction, createDecisionContext(state, { seed, budget: 0 }));
      requireCondition(first === repeat,
        'The same seed and state produced different decisions. Use context.rng(), not ambient randomness or persistent counters.',
        { failureInput: { seed, state }, observed: { first, repeat } });
    }
    return { repeatedSeeds: 7, boundary: 'same process; the supplied runner also supports a fresh-process policy rerun' };
  }, '01.2'));
  checks.push(runCheck('B03', 'A baseline works for either player without a simulation budget.', () => {
    callable(chooseAction, 'chooseAction');
    const state = generateScenario(23, 1).state;
    const context = createDecisionContext(state, { seed: 8, budget: 0 });
    decision(chooseAction, context);
    requireCondition(context.oracle.used === 0, 'The baseline attempted a simulation with zero credits.');
    return { actor: state.currentPlayer, simulationCredits: 0 };
  }, '01.3'));
  return report('baseline', checks);
}

function position(pawns0, pawns1, currentPlayer = 0) {
  const board = Array(25).fill(-1);
  for (const cell of pawns0) board[cell] = 0;
  for (const cell of pawns1) board[cell] = 1;
  return createState({ board, currentPlayer });
}

function evaluated(evaluate, state, player) {
  const before = JSON.stringify(state);
  const value = evaluate(state, player);
  requireCondition(typeof value === 'number' && Number.isFinite(value),
    'Evaluation must return a finite number.', { failureInput: { state, player }, observed: value });
  requireCondition(JSON.stringify(state) === before, 'Evaluation changed its input state.');
  return value;
}

export function checkEvaluation(evaluate) {
  const checks = [];
  checks.push(runCheck('E01', 'Terminal values equal the requested player’s official return.', () => {
    callable(evaluate, 'evaluate');
    const states = [position([22], [8]), position([17], [2])];
    for (const state of states) for (const player of [0, 1]) {
      const value = evaluated(evaluate, state, player);
      requireCondition(value === state.returns[player],
        'A terminal result is exact and is measured from the requested player’s perspective.',
        { failureInput: { state, player }, observed: value, expected: state.returns[player] });
    }
    return { terminalPlayerCases: 4 };
  }, '02.1'));
  checks.push(runCheck('E02', 'Nonterminal values are bounded and reverse sign with the requested player.', () => {
    callable(evaluate, 'evaluate');
    const states = [initialState(), position([10, 12], [18]), position([6], [12, 14]), position([17], [8])];
    const values = [];
    for (const state of states) {
      const v0 = evaluated(evaluate, state, 0);
      const v1 = evaluated(evaluate, state, 1);
      requireCondition(Math.abs(v0) <= 0.99 && Math.abs(v1) <= 0.99,
        'A nonterminal estimate must stay inside [-0.99, 0.99], below a proved win.',
        { failureInput: state, observed: [v0, v1] });
      requireCondition(Math.abs(v0 + v1) < 1e-10,
        'The same zero-sum position must have opposite evaluations for the two requested players.',
        { failureInput: state, observed: [v0, v1] });
      values.push(v0);
    }
    requireCondition(new Set(values.map(value => value.toFixed(10))).size > 1,
      'This evaluator assigns the same score to every tested nonterminal position. Add a state-dependent feature; no exact weight vector is required.',
      { observed: values });
    return { positions: states.length, valuesForPlayer0: values, exactWeightsRequired: false };
  }, '02.1'));
  checks.push(runCheck('E03', 'Repeated evaluation is pure and deterministic.', () => {
    callable(evaluate, 'evaluate');
    const state = position([10, 13], [6, 19], 1);
    for (const player of [0, 1]) {
      const first = evaluated(evaluate, state, player);
      const second = evaluated(evaluate, state, player);
      requireCondition(first === second, 'Evaluation changed without any change in state or requested player.',
        { failureInput: { state, player }, observed: [first, second] });
    }
  }, '02.1'));
  return report('evaluation', checks);
}

export function checkSearch(search, { evaluate } = {}) {
  const checks = PRACTICE_TREES.map((fixture, index) => runCheck(`S${String(index + 1).padStart(2, '0')}`,
    fixture.requirement, () => {
      callable(search, 'search');
      const context = makeTreeContext(fixture, { maxDepth: fixture.maxDepth, budget: 256 });
      const action = decision(search, context);
      requireCondition(fixture.expected.includes(action),
        'The selected action does not meet this practice tree’s requested search contract. Trace the actual actor, horizon and terminal returns.',
        { failureInput: { tree: fixture, maxDepth: fixture.maxDepth }, observed: action, acceptedActions: fixture.expected });
      return { action, simulationCredits: context.oracle.used };
    }, index === 5 ? '02.3' : '02.2'));

  for (const budget of [0, 1, 3]) {
    checks.push(runCheck(`S-budget-${budget}`, 'An insufficient budget still returns a legal move without an extra simulation.', () => {
      callable(search, 'search');
      const context = makeTreeContext(PRACTICE_TREES[0], { budget, maxDepth: 4 });
      const action = decision(search, context);
      requireCondition(context.oracle.used <= budget && !context.oracle.overrun,
        'A simulation exceeded the allowed credits, even if its exception was caught.');
      return { budget, action, simulationCredits: context.oracle.used, strengthClaim: 'none at inadequate budget' };
    }, '02.3'));
  }
  checks.push(runCheck('S-game', 'Connect the same search to the supplied real game and recognize an immediate win.', () => {
    callable(search, 'search');
    callable(evaluate, 'evaluate');
    for (const player of [0, 1]) {
      const state = position([17], [7], player);
      const context = { ...createDecisionContext(state, { budget: 64, seed: 9, parameters: { maxDepth: 2 } }), evaluate };
      const action = decision(search, context);
      const result = next(state, action).state;
      requireCondition(result.terminal && result.returns[player] === 1,
        'This teaching position has a legal immediate win. The returned move did not take one.',
        { failureInput: { state, legalActions: legalActions(state) }, observed: { action, result } });
    }
    return { winningSeats: 2 };
  }, '02.2'));
  return report('search', checks);
}
