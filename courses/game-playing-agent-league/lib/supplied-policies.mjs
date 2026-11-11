/** Supplied baselines, not learner search/evaluation solutions. */
import { decodeAction } from './game.mjs';
import { snapshotPolicy } from './runner.mjs';

export function randomPolicy(context) {
  return context.legalActions[Math.floor(context.rng() * context.legalActions.length)];
}

/** One-step material/advancement preference; no adversarial reply or learned value. */
export function greedyPolicy(context) {
  const { state, player } = context;
  let best = context.legalActions[0];
  let bestScore = -Infinity;
  for (const action of context.legalActions) {
    const { from, to } = decodeAction(action);
    const row = Math.floor(to / state.columns);
    const progress = player === 0 ? row : state.rows - 1 - row;
    const capture = state.board[to] === 1 - player ? 5 : 0;
    const score = (progress === state.rows - 1 ? 100 : 0) + capture + progress + (from % state.columns === 2 ? 0.01 : 0);
    if (score > bestScore) { best = action; bestScore = score; }
  }
  return best;
}

export const suppliedSnapshots = () => [
  snapshotPolicy({ name: 'random', decide: randomPolicy, metadata: { supplied: true, kind: 'random-baseline' } }),
  snapshotPolicy({ name: 'greedy', decide: greedyPolicy, metadata: { supplied: true, kind: 'one-step-rules-baseline' } }),
];
