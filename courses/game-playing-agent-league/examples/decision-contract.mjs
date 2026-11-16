/** Supplied teaching probe for lessons 1.1–1.2; not a learner policy or assessment. */
import assert from 'node:assert/strict';
import { createState, initialState, encodeAction, decodeAction, formatBoard } from '../lib/game.mjs';
import { createDecisionContext } from '../lib/runner.mjs';

function inspectContract() {
  const board = Array(25).fill(-1);
  board[7] = 0;
  board[13] = 0;
  board[11] = 1;
  board[19] = 1; // Keep another opponent: a capture need not be terminal.
  const state = createState({ board, currentPlayer: 0 });
  const context = createDecisionContext(state, { seed: 7, budget: 1 });
  const before = JSON.stringify(context.state);
  console.log('Before (A = player 0, B = player 1):\n' + formatBoard(state));
  console.log('Actor:', context.player);
  console.log('All legal action IDs:', context.legalActions);
  console.log('Legal moves from cell 7:', context.legalActions.map(decodeAction).filter(move => move.from === 7));
  const actionId = encodeAction(7, 11); // Change only the destination for the lesson experiment.
  console.log('Requested action:', actionId, decodeAction(actionId));
  const after = context.oracle.next(context.state, actionId);
  console.log('After:\n' + formatBoard(after));
  console.log('Terminal:', after.terminal, 'returns:', after.returns);
  assert.equal(JSON.stringify(context.state), before);
  assert.equal(context.oracle.used, 1);
  console.log('PASS: input unchanged; one counted simulation. No learner policy was checked.');
}

// Sampling mechanics for inspection, not an implementation of learner/baseline.mjs.
function drawChoice(context) {
  const draw = context.rng();
  const index = Math.floor(draw * context.legalActions.length);
  return { draw, index, actionId: context.legalActions[index] };
}

function inspectRandomness() {
  const state = initialState();
  const fresh = seed => createDecisionContext(state, { seed, budget: 0 });
  const first = drawChoice(fresh(7));
  const repeat = drawChoice(fresh(7));
  const different = drawChoice(fresh(8));
  const skipped = fresh(7);
  skipped.rng(); // Deliberate extra consumption, as in the diagnostic experiment.
  const extraDraw = drawChoice(skipped);
  console.log('Ordered legal action IDs:', fresh(7).legalActions);
  console.table([
    { experiment: 'seed 7', ...first },
    { experiment: 'seed 7 repeated', ...repeat },
    { experiment: 'seed 8', ...different },
    { experiment: 'seed 7 after extra draw', ...extraDraw },
  ]);
  assert.deepEqual(first, repeat);
  console.log('PASS: fresh contexts repeat the seed-7 choice. No strength claim or learner check.');
}

const mode = process.argv[2] ?? 'contract';
if (mode === 'contract') inspectContract();
else if (mode === 'randomness') inspectRandomness();
else throw new Error('Use: node examples/decision-contract.mjs [contract|randomness]');
