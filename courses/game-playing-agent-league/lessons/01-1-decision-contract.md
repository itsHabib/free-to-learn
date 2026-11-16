# 1.1 Read the decision contract

A pawn reaches the far edge, yet a program reports that the other player won. Before improving the program's strategy, you need to know which part of the system owns that result. In this lesson you will identify the actor, legal actions and terminal return for a supplied game state, then implement a policy that respects that contract.

You need arrays, functions and zero-based indexing. Read time is approximately 8–10 minutes, with 30–45 minutes of experiments and coding; these are targets awaiting learner trials.

## A move is a request to the referee

The supplied game is a small version of Breakthrough. Player 0 begins on row 0 and moves toward row 4. Player 1 begins on row 4 and moves toward row 0. Each player starts with five pawns. A turn moves one pawn one row forward. A straight move needs an empty destination. A diagonal move may enter an empty square or capture an opposing pawn. A friendly occupied destination is illegal.

Reaching the opposite edge or removing all opposing pawns wins immediately. If the player to move has no legal action, it loses. Official terminal returns are `+1` for the winner and `-1` for the loser. Capturing an ordinary pawn does not itself earn a game point. A policy may prefer captures as a useful heuristic, but it cannot change the referee's objective.

For a worked position, suppose player 0 has a pawn at `(1,2)`. The cell `(2,2)` is empty, `(2,1)` holds an opponent and `(2,3)` holds a friendly pawn. Moving straight is legal. Moving diagonally left is a legal capture. Moving diagonally right is illegal. The relevant facts are the actor, direction and destination occupancy; a visually attractive route has no authority over those rules.

Before proceeding, commit this application. **Item `1.1-p1`:** Player 1 has a pawn at `(3,1)`. Its forward cell `(2,1)` contains an opponent, `(2,0)` is empty, and `(2,2)` contains a friendly pawn. Which destinations are legal, and what rule excludes each other destination?

```sh
node cli.mjs attempt 1.1-p1 --answer 'Your destinations and reasons' --confidence medium
node cli.mjs feedback 1.1-p1
```

The feedback displays your saved answer beside the reference and its reasoning. This is self-assessed practice, not an automatic grade for the quality of your explanation.

## The board is only part of the state

`context.state.board` is a flat array of 25 cells. An empty cell is `-1`; a pawn contains its player ID, `0` or `1`. Cell index is `row * 5 + column`. The state also includes `currentPlayer`, `ply`, rule identity, terminal status and terminal returns. `returns` is `null` before the game ends. Two identical boards can allow different actions when different players are to move.

An action is an integer identifying its source and destination. For this board, the encoding is `fromCell * 25 + toCell`. The supplied engine already performs this conversion and validates moves. For example, source cell 6 and destination cell 11 encode as 161. An integer can have the right shape while still describing an illegal move: encoding is not validation.

The policy receives `context.legalActions`, an ordered list of actions the referee permits at the current state. Your first policy's job is to select from that list. It should not modify the board, invent a different action format, or turn the observation into a result record. The observation is information for making a decision; the referee remains responsible for applying the decision.

Commit **item `1.1-p2`:** An action moves from cell 8 to cell 13. What is its encoded ID? Does knowing that ID establish legality? Name two additional facts you would inspect.

```sh
node cli.mjs attempt 1.1-p2 --answer 'ID; legality explanation; two facts'
node cli.mjs feedback 1.1-p2
```

## Inspect one real decision

From the course directory, run the supplied experiment in `examples/decision-contract.mjs`:

```sh
node examples/decision-contract.mjs contract
```

The file imports the referee from `lib/game.mjs` and `createDecisionContext` from `lib/runner.mjs`. It constructs the worked position above, with another opposing pawn so that an ordinary capture does not end the game. `A` denotes player 0, `B` player 1, and `.` an empty cell. This small excerpt shows the boundary you will use:

```js
const context = createDecisionContext(state, { seed: 7, budget: 1 });
const actionId = encodeAction(7, 11); // the supplied worked capture
const after = context.oracle.next(context.state, actionId);
console.log(after.terminal, after.returns); // false, null
```

`state` and the imports are defined in the runnable file; the excerpt is not a standalone program. The context supplies an immutable observation and the legal-action list. `encodeAction` only encodes the chosen cells. The counted oracle validates and simulates the move, returning a new state. It consumes one credit; the old board is unchanged. This is a teaching probe, not code to put in your baseline: module 1 must choose an action with **zero** simulation credits. Later search must use `context.oracle.next`, not import the uncounted engine transition.

Before each experiment, predict the result in your notes, then run it and explain any disagreement:

1. Inspect the two destination cells listed for the pawn at cell 7: cells 11 and 12. Explain why cell 13 is excluded even though its encoded integer would be in range. Other friendly pawns also have actions in the full legal list.
2. Change the probe's `encodeAction(7, 11)` to `encodeAction(7, 12)` in a scratch copy under `examples/`. Predict which board cells change, whether an opponent disappears, and whether either move earns an immediate terminal return. Restore the worked value after the comparison.
3. Change that destination to 13. Predict whether the referee rejects it. The program should exit with `ILLEGAL_ACTION`, not display a new board or award a win. Restore the legal move before continuing.

The probe prints `PASS` only when its legal simulation leaves the input unchanged and consumes one credit. It neither calls your baseline nor saves an assessment attempt. Keep scratch observations with your own notes. Leave `lib/`, `checks/` and the journal records unchanged.

## Build the smallest honest policy

Your remaining work is in `learner/baseline.mjs`: replace its `LEARNER_TODO` with your own `chooseAction(context)` implementation that returns a legal action ID. Choose a simple documented rule: a fixed position in the legal list is enough to establish the contract. A later lesson will make randomized choices reproducible. You do not need to implement movement, capture detection, game storage or a user interface.

The copied state is not a scratch board. For hypothetical moves, later search code will use the supplied simulation oracle. Mutating an observation would make the program's reasoning difficult to reproduce and could make one branch of a search affect another. A policy should return a decision; it should not try to make that decision happen by editing state.

Run the actual policy checker once before editing to see the saved `LEARNER_TODO` failure, then again after your implementation:

```sh
node cli.mjs check 1
```

If instead you see a missing module, missing file or unsupported Node error, return to the README setup; that is not the intended unfinished-policy result. The CLI records the code snapshot and feedback in `work/attempts.json`; do not edit that file to turn a failure into a pass.

A passing code check establishes the finite behaviors it reports. It does not establish playing strength. If a check fails, identify the violated requirement before changing code. Fix that requirement and rerun; preserve the earlier attempt in your history instead of rewriting its result.

Commit **item `1.1-p3`:** A policy returns a valid-looking action ID and also sets the opponent's last pawn to empty in its copied observation. Which part should the referee use to determine the next state, and why must the modified observation not establish victory?

## Transfer and repair

**Item `1.1-transfer`:** A cache stores decisions using only the 25 board cells. The same board is later queried with the other player to move. Describe the failure this can cause and the additional identity the cache must preserve. You are diagnosing the policy, not redesigning the game.

Commit each item with `attempt`, then request its feedback. If your answer is incomplete, use `node cli.mjs hint <item-id> --level 1`; later hints become more specific. Record a revision as another attempt so that your first reasoning remains visible. You are ready to continue when your policy passes its public checks and you can explain why a legal decision and a winning decision are different claims.
