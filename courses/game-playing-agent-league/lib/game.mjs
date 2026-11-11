/** Original supplied game rules for this course. No third-party source copied. */
import { canonicalJSON, copyData, deepFreeze, sha256 } from './identity.mjs';
import { createRng, uint32 } from './rng.mjs';

const ROWS = 5;
const COLUMNS = 5;
const CELLS = ROWS * COLUMNS;
const RULES = {
  id: 'breakthrough-5x5-v1', rows: ROWS, columns: COLUMNS, initialRanks: 1,
  advance: 1, diagonalEmpty: true, capture: 'diagonal-only',
  wins: ['far-rank', 'elimination', 'opponent-without-legal-move'],
  utility: 'terminal-zero-sum', turn: 'alternate',
};
export const RULES_HASH = sha256(RULES);
export const GAME = deepFreeze({
  schemaVersion: 1, gameId: RULES.id, rulesVersion: '1.0.0', rulesHash: RULES_HASH,
  rows: ROWS, columns: COLUMNS, players: 2, information: 'perfect',
  dynamics: 'sequential', chance: 'none', utility: 'zeroSum',
});

export class GameError extends Error {
  constructor(code, message) { super(message); this.name = 'GameError'; this.code = code; }
}

function playerId(player) {
  if (player !== 0 && player !== 1) throw new GameError('INVALID_PLAYER', 'Player must be 0 or 1.');
}

function validBoard(board) {
  if (!Array.isArray(board) || board.length !== CELLS || !Array.from(board).every(cell => cell === -1 || cell === 0 || cell === 1)) {
    throw new GameError('INVALID_BOARD', 'Board must contain exactly 25 values from -1, 0 and 1.');
  }
  for (const player of [0, 1]) {
    if (board.filter(cell => cell === player).length > 5) throw new GameError('INVALID_BOARD', 'A side may have at most five pawns.');
  }
}

export function encodeAction(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= CELLS || to < 0 || to >= CELLS) {
    throw new GameError('INVALID_ACTION', 'Action cells must be integers in 0..24.');
  }
  return from * CELLS + to;
}

export function decodeAction(actionId) {
  if (!Number.isInteger(actionId) || actionId < 0 || actionId >= CELLS * CELLS) {
    throw new GameError('INVALID_ACTION', 'Action ID must be an integer in 0..624.');
  }
  return { from: Math.floor(actionId / CELLS), to: actionId % CELLS };
}

function rawLegal(board, player) {
  const actions = [];
  const direction = player === 0 ? 1 : -1;
  for (let from = 0; from < CELLS; from++) {
    if (board[from] !== player) continue;
    const row = Math.floor(from / COLUMNS) + direction;
    if (row < 0 || row >= ROWS) continue;
    const column = from % COLUMNS;
    for (const delta of [-1, 0, 1]) {
      const nextColumn = column + delta;
      if (nextColumn < 0 || nextColumn >= COLUMNS) continue;
      const to = row * COLUMNS + nextColumn;
      if (board[to] === player || (delta === 0 && board[to] !== -1)) continue;
      actions.push(encodeAction(from, to));
    }
  }
  return actions.sort((a, b) => a - b);
}

function boardWinner(board, currentPlayer) {
  const counts = [board.filter(cell => cell === 0).length, board.filter(cell => cell === 1).length];
  const reached = [board.slice(20).includes(0), board.slice(0, 5).includes(1)];
  if ((!counts[0] && !counts[1]) || (reached[0] && reached[1])) throw new GameError('INVALID_BOARD', 'Board has contradictory terminal outcomes.');
  if (reached[0] || counts[1] === 0) return 0;
  if (reached[1] || counts[0] === 0) return 1;
  if (rawLegal(board, currentPlayer).length === 0) return 1 - currentPlayer;
  return null;
}

/** Explicit teaching positions are permitted; reachability is a separate property. */
export function createState({ board, currentPlayer = 0, ply = 0 } = {}) {
  validBoard(board);
  playerId(currentPlayer);
  if (!Number.isInteger(ply) || ply < 0 || ply > 40) throw new GameError('INVALID_PLY', 'Ply must be an integer in 0..40.');
  const winner = boardWinner(board, currentPlayer);
  const potential = board.reduce((sum, player, index) => player === -1 ? sum : sum + (player === 0 ? ROWS - 1 - Math.floor(index / COLUMNS) : Math.floor(index / COLUMNS)), 0);
  if (ply + potential > 40) throw new GameError('INVALID_PLY', 'Ply plus remaining pawn distance cannot exceed the initial bound of 40.');
  return deepFreeze({
    schemaVersion: 1, gameId: GAME.gameId, rulesHash: RULES_HASH,
    rows: ROWS, columns: COLUMNS, board: board.slice(), currentPlayer, ply,
    terminal: winner !== null, returns: winner === null ? null : winner === 0 ? [1, -1] : [-1, 1],
  });
}

export function initialState() {
  return createState({ board: [...Array(5).fill(0), ...Array(15).fill(-1), ...Array(5).fill(1)] });
}

export function validateState(state) {
  if (!state || typeof state !== 'object' || state.schemaVersion !== 1 || state.gameId !== GAME.gameId || state.rulesHash !== RULES_HASH || state.rows !== ROWS || state.columns !== COLUMNS) {
    throw new GameError('WRONG_RULES', 'State does not belong to breakthrough-5x5-v1.');
  }
  const expected = createState(state);
  if (state.terminal !== expected.terminal || canonicalJSON(state.returns) !== canonicalJSON(expected.returns)) {
    throw new GameError('INVALID_TERMINAL', 'Terminal flag/returns disagree with the board.');
  }
  return true;
}

export function legalActions(state) {
  validateState(state);
  return state.terminal ? [] : rawLegal(state.board, state.currentPlayer);
}

export function next(state, actionId) {
  validateState(state);
  if (state.terminal) throw new GameError('GAME_OVER', 'No move is legal after termination.');
  const { from, to } = decodeAction(actionId);
  if (!rawLegal(state.board, state.currentPlayer).includes(actionId)) throw new GameError('ILLEGAL_ACTION', `Action ${actionId} is not legal for player ${state.currentPlayer}.`);
  const board = state.board.slice();
  const actor = state.currentPlayer;
  const capture = board[to] === 1 - actor;
  board[from] = -1;
  board[to] = actor;
  const result = createState({ board, currentPlayer: 1 - actor, ply: state.ply + 1 });
  const winner = result.terminal ? result.returns.indexOf(1) : null;
  const reason = !result.terminal ? null : (Math.floor(to / COLUMNS) === (actor === 0 ? ROWS - 1 : 0)) ? 'far-rank' : !board.includes(1 - actor) ? 'elimination' : 'no-legal-move';
  return { state: result, event: deepFreeze({ ply: state.ply, actor, actionId, from, to, capture, winner, terminalReason: reason }) };
}

export function observe(state, player = state.currentPlayer) {
  validateState(state);
  playerId(player);
  return deepFreeze({ ...copyData(state), perspective: player, legalActions: !state.terminal && player === state.currentPlayer ? rawLegal(state.board, player) : [] });
}

export function stateKey(state) {
  validateState(state);
  return sha256({ schemaVersion: 1, gameId: state.gameId, rulesHash: state.rulesHash, rows: ROWS, columns: COLUMNS,
    board: state.board, currentPlayer: state.currentPlayer, ply: state.ply, terminal: state.terminal, returns: state.returns });
}

export function remainingPotential(state) {
  validateState(state);
  return state.board.reduce((sum, player, index) => player === -1 ? sum : sum + (player === 0 ? ROWS - 1 - Math.floor(index / COLUMNS) : Math.floor(index / COLUMNS)), 0);
}

export function formatBoard(state) {
  validateState(state);
  const symbols = { '-1': '.', '0': 'A', '1': 'B' };
  return Array.from({ length: ROWS }, (_, row) => state.board.slice(row * COLUMNS, (row + 1) * COLUMNS).map(value => symbols[value]).join(' ')).join('\n');
}

/** Legal prefixes are reproducible; this single generator does not enforce split deduplication. */
export function generateScenario(seed = 0, prefixPlies = 6) {
  uint32(seed);
  if (!Number.isInteger(prefixPlies) || prefixPlies < 0 || prefixPlies > 20) throw new RangeError('prefixPlies must be an integer in 0..20.');
  const rng = createRng(seed);
  let state = initialState();
  const prefix = [];
  for (let index = 0; index < prefixPlies && !state.terminal; index++) {
    const choices = legalActions(state);
    const selected = choices[Math.floor(rng() * choices.length)];
    const result = next(state, selected).state;
    if (result.terminal) break; // Final tournament starts remain playable.
    prefix.push(selected);
    state = result;
  }
  const stateHash = stateKey(state);
  return deepFreeze({ id: `prefix-${seed}-${prefix.length}-${stateHash.slice(0, 10)}`, generator: 'legal-prefix-lcg-v1', seed,
    requestedPrefixPlies: prefixPlies, prefix, state, stateHash, origin: 'legal-prefix' });
}

export function verifyScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || typeof scenario.id !== 'string' || !scenario.id) throw new TypeError('Scenario needs a nonempty ID.');
  validateState(scenario.state);
  if (stateKey(scenario.state) !== scenario.stateHash) throw new GameError('SCENARIO_MISMATCH', 'Scenario state hash does not match.');
  if (scenario.origin === 'legal-prefix') {
    if (!Array.isArray(scenario.prefix)) throw new GameError('SCENARIO_MISMATCH', 'Legal-prefix scenario needs its prefix.');
    let state = initialState();
    for (const action of scenario.prefix) state = next(state, action).state;
    if (stateKey(state) !== scenario.stateHash) throw new GameError('SCENARIO_MISMATCH', 'Prefix does not produce the declared state.');
  } else if (scenario.origin !== 'teaching-position') {
    throw new GameError('SCENARIO_MISMATCH', 'Scenario must declare legal-prefix or teaching-position origin.');
  }
  if (scenario.state.terminal) throw new GameError('SCENARIO_TERMINAL', 'A match must start from a nonterminal state.');
  return true;
}

export function teachingScenario(id, state) {
  validateState(state);
  return deepFreeze({ id, origin: 'teaching-position', state: copyData(state), stateHash: stateKey(state) });
}
