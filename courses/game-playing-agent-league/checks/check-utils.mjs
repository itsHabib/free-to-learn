/** Public practice-check plumbing. This is not a held-out assessment. */
export function actionOf(result) {
  return Number.isInteger(result) ? result : result?.actionId;
}

export function requireCondition(condition, message, details = {}) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

export function runCheck(id, requirement, execute, lesson) {
  try {
    const evidence = execute() ?? {};
    return { id, ok: true, requirement, lesson, ...evidence };
  } catch (error) {
    return {
      id, ok: false, requirement, lesson,
      reason: error?.message ?? String(error),
      ...(error?.details ?? {}),
    };
  }
}

export function report(kind, checks) {
  return {
    schemaVersion: 1,
    kind,
    ok: checks.every(check => check.ok),
    scope: 'public-practice',
    claim: 'Finite public practice checks, not a hidden assessment, security audit, or evidence of learning.',
    checks,
  };
}

export function synchronousResult(fn, argument) {
  const result = fn(argument);
  requireCondition(!result || typeof result.then !== 'function',
    'This exercise uses synchronous decisions; returning a Promise is not an action.');
  return result;
}

/**
 * A small supplied game-tree adapter. Values are part of the game's declared
 * payoffs, not learner answers. Expected choices are checked by the caller.
 * It deliberately has the same oracle shape as the real game runner.
 */
export function makeTreeContext(fixture, {
  budget = 256, maxDepth = 3, seed = 17,
} = {}) {
  let used = 0;
  let overrun = false;
  let randomState = seed >>> 0;
  const nodes = fixture.nodes;
  function state(id) {
    const node = nodes[id];
    if (!node) throw new Error(`Unknown supplied tree state ${id}`);
    return Object.freeze({
      gameId: 'public-practice-tree', rulesHash: fixture.id,
      id, currentPlayer: node.player ?? 0,
      terminal: Object.hasOwn(node, 'value'),
      returns: Object.hasOwn(node, 'value') ? Object.freeze([node.value, -node.value]) : null,
      ply: node.ply ?? 0,
      board: Object.freeze([]),
    });
  }
  const root = state(fixture.root ?? 'root');
  function nodeFor(input) {
    requireCondition(input?.rulesHash === fixture.id && nodes[input?.id],
      'The search passed a state from another game or invented a tree state.');
    return nodes[input.id];
  }
  const oracle = Object.freeze({
    legal(input) {
      return Object.keys(nodeFor(input).moves ?? {}).map(Number).sort((a, b) => a - b);
    },
    next(input, action) {
      if (used >= budget) {
        overrun = true;
        throw new Error('SIMULATION_BUDGET_EXCEEDED');
      }
      used += 1;
      const node = nodeFor(input);
      requireCondition(Number.isInteger(action) && Object.hasOwn(node.moves ?? {}, action),
        'The search simulated an illegal action.', { observed: action, failureInput: input });
      return state(node.moves[action]);
    },
    terminal(input) { return Object.hasOwn(nodeFor(input), 'value'); },
    returns(input) {
      const node = nodeFor(input);
      return Object.hasOwn(node, 'value') ? [node.value, -node.value] : null;
    },
    currentPlayer(input) { return nodeFor(input).player ?? 0; },
    get used() { return used; },
    get remaining() { return Math.max(0, budget - used); },
    get overrun() { return overrun; },
    get exceeded() { return overrun; },
  });
  const context = Object.freeze({
    state: root, observation: root, player: root.currentPlayer,
    legalActions: Object.freeze(oracle.legal(root)),
    seed, parameters: Object.freeze({ maxDepth }), oracle,
    rng() {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    },
    evaluate(input, player) {
      const node = nodeFor(input);
      const value = Object.hasOwn(node, 'value') ? node.value : (node.heuristic ?? 0);
      return player === 0 ? value : -value;
    },
  });
  return context;
}
