# 2.1 Value a position from the correct player's perspective

A search program gives a winning position a negative score because the turn changed. It can examine many moves and still choose badly if its values switch meaning. In this lesson you will implement an evaluation whose player perspective stays explicit and whose estimates never override a known terminal result.

You need module 1, signed numbers and simple arithmetic. Plan for approximately 5–7 minutes of reading and 25–40 minutes of practice and implementation; these targets are not measured learner times.

## A value needs an owner

An evaluation estimates how favorable a state is to a named player. In this course, larger values mean better outcomes for that player. The argument `player` in `evaluate(state, player)` is that owner. It is not automatically the player whose turn comes next.

Suppose player 0 has a clear advantage. An evaluator may give that state `+0.4` from player 0's perspective and `-0.4` from player 1's. The board did not become worse when you asked the second question. You changed whose interests the number describes. This game is zero-sum: one player's terminal gain is exactly the other's loss.

For a worked heuristic, imagine counting only a material difference in a different small position. Player 0 has four pawns and player 1 has two. A coefficient of `0.1` per extra pawn gives `+0.2` for player 0 and `-0.2` for player 1. That is an estimate, not a proof. Two advanced enemy pawns might be more dangerous than four poorly placed pawns. The feature is useful only to the extent that it guides decisions toward winning.

Commit **item `2.1-p1`:** A nonterminal state has heuristic value `+0.35` for player 1 under an antisymmetric evaluation. What value should the same evaluator give player 0? If `currentPlayer` changes but the question still asks for player 1's prospects, should the sign automatically change? Explain.

```sh
node cli.mjs attempt 2.1-p1 --answer 'Value; sign decision; reason'
node cli.mjs feedback 2.1-p1
```

## Known outcomes outrank estimates

A terminal state is no longer a prediction problem. The referee's `returns` array contains the outcome for both players. If player 0 won, `returns[0]` is `+1` and `returns[1]` is `-1`. Asking from player 1's perspective must not retrieve the first entry merely because player 0 started the game.

Terminal handling comes before any depth limit or heuristic. A search that reaches a terminal win on its final allowed edge should return the known win, not call a rough material estimator because its depth counter reached zero at the same moment. The order of those decisions changes what the number means.

Nonterminal heuristic scores in this course lie between `-0.99` and `+0.99`. Terminal outcomes remain exactly `-1` and `+1`. The separation prevents an overconfident estimate such as `1.4` from outranking an actual win. Later learned values will retain their raw predictions for analysis, but the search boundary will keep this score contract.

Commit **item `2.1-p2`:** A search reaches a terminal state with `returns=[-1,+1]` exactly at its depth limit. The requested perspective is player 1, and the material heuristic would give `-0.2`. Which value belongs in the search, and which condition must be checked first?

## Build an estimator you can explain

Open `learner/evaluation.mjs` and implement `evaluate(state, player)`. Handle terminal values from the referee first. For nonterminal states, choose a small set of visible features that you can explain. Material and progress toward the target row are possible starting ideas. Keep your output finite and within the heuristic range. Do not read final-game labels, hidden scenario names or future moves.

Changing a feature's direction when the player changes needs care. Player 0 advances toward larger row numbers; player 1 advances toward smaller ones. Raw row number therefore does not mean the same progress for both players. A useful representation converts geometry into a player's distance or advancement before combining features. Check the interpretation on one pawn near each player's target edge.

An all-zero nonterminal evaluation is a meaningful reference: it expresses no preference before a terminal result is found. It can support exact search when the whole relevant tree is explored, but it is weak guidance when search stops early. You may compare against it; do not call it a trained value or claim it understands positions.

Commit **item `2.1-p3`:** Player 0 has a pawn on row 3; player 1 has a pawn on row 1. Each is one move from its target row. A feature uses raw row number and therefore assigns greater advancement to player 0. Explain the representation error and describe a perspective-consistent replacement without writing the whole evaluator.

## Check meaning before strength

Run `node cli.mjs check 2` after implementing your evaluator and, in the next lesson, your search function. Early failures may include unfinished search. Read the individual requirement results rather than treating one overall failure as evidence that every component is wrong.

For your own inspection, retain three cases: a known terminal win, the same terminal result from the losing player's perspective, and a nonterminal state evaluated for both players. Those checks test the meaning of scores. They do not prove that your heuristic is strategically good. That requires matched games and tactical cases after the search works.

**Item `2.1-transfer`:** A future rule gives the same player another turn after a particular move. A programmer flips the sign whenever one move is simulated, assuming that each edge changes the player. Explain why this can fail and which explicit state information should determine the backup's role.

Commit before viewing feedback. If you miss a perspective question, mark the player who owns each value on a tiny tree and then try a fresh item. Preserve the first attempt. You are ready for search when your evaluator's sign, range and terminal behavior have a single consistent meaning.
