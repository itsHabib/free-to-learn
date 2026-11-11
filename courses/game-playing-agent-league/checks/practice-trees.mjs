/** Transparent abstract practice games, not Breakthrough states or held-out tests.
 * Abstract terminal utilities may include 0; the actual Breakthrough game has no draws.
 */
export const PRACTICE_TREES = Object.freeze([
  {
    id: 'reply-trap', maxDepth: 2, expected: [22],
    requirement: 'Choose a move that survives the opponent’s best reply, not the highest immediate heuristic.',
    nodes: {
      root: { player: 0, moves: { 11: 'tempting', 22: 'sound' } },
      tempting: { player: 1, heuristic: 0.9, moves: { 111: 'good', 112: 'bad' } },
      sound: { player: 1, heuristic: 0.2, moves: { 221: 'good', 222: 'good' } },
      good: { value: 1 }, bad: { value: -1 },
    },
  },
  {
    id: 'second-player', maxDepth: 1, expected: [8],
    requirement: 'Maximize the root player’s result when player 1 is deciding.',
    nodes: {
      root: { player: 1, moves: { 4: 'zero-wins', 8: 'one-wins' } },
      'zero-wins': { value: 1 }, 'one-wins': { value: -1 },
    },
  },
  {
    id: 'consecutive-turn', maxDepth: 2, expected: [3],
    requirement: 'Use the actual actor at each node; an edge need not change the player.',
    nodes: {
      root: { player: 0, moves: { 3: 'again', 9: 'opponent' } },
      again: { player: 0, heuristic: -0.4, moves: { 30: 'win', 31: 'loss' } },
      opponent: { player: 1, heuristic: 0.4, moves: { 90: 'neutral', 91: 'neutral' } },
      win: { value: 1 }, loss: { value: -1 }, neutral: { value: 0 },
    },
  },
  {
    id: 'equally-good-actions', maxDepth: 1, expected: [7, 9],
    requirement: 'Any equally optimal action is valid; the checker does not require one tie-break rule.',
    nodes: {
      root: { player: 0, moves: { 2: 'loss', 7: 'win-a', 9: 'win-b' } },
      loss: { value: -1 }, 'win-a': { value: 1 }, 'win-b': { value: 1 },
    },
  },
  {
    id: 'terminal-at-horizon', maxDepth: 1, expected: [13],
    requirement: 'Read terminal returns before applying a depth-limit estimate.',
    nodes: {
      root: { player: 0, moves: { 5: 'loss', 13: 'win' } },
      loss: { value: -1, heuristic: 0.99 }, win: { value: 1, heuristic: -0.99 },
    },
  },
  {
    id: 'declared-horizon', maxDepth: 1, expected: [12],
    requirement: 'Apply the supplied evaluation at the requested nonterminal horizon.',
    nodes: {
      root: { player: 0, moves: { 12: 'near', 24: 'far' } },
      near: { player: 1, heuristic: 0.4, moves: { 101: 'loss' } },
      far: { player: 1, heuristic: 0.1, moves: { 102: 'win' } },
      win: { value: 1 }, loss: { value: -1 },
    },
  },
]);
