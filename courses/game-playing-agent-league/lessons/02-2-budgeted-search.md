# 2.2 Search adversarial replies under a node budget

A move wins a pawn immediately but lets the opponent reach the far edge next turn. Looking at only your move rewards the wrong consequence. In this lesson you will implement bounded adversarial search that chooses a move by accounting for the opponent's reply.

You need lesson 2.1, recursion and the difference between a maximum and a minimum. Allow approximately 5–7 minutes to read and 45–75 minutes to implement and repair; these are design estimates.

## Back up the consequence the opponent can force

Keep every value in one named player's perspective—the root player for this decision. At a state where that player acts, it chooses the largest child value. At a state where its opponent acts, the opponent can choose the smallest value for the root player. Propagating these choices back through the tree is minimax search.

Consider a worked sibling tree. You choose between `north` and `south`. After `north`, the opponent can force values `-0.2` or `+0.7`; after `south`, it can force `+0.1` or `+0.3`. The backed-up value of `north` is `-0.2`, because the opponent need not cooperate. The backed-up value of `south` is `+0.1`. You select `south`. Selecting the largest leaf anywhere in the tree would assume the opponent chooses the outcome you want.

This calculation depends on the player's identity at each state. The ordinary game alternates turns, but the interface tells you `currentPlayer` explicitly. Use that fact. A generic tree or a later rule change can give the same player consecutive decisions; the backup should follow the actor, not the recursion level's parity.

Commit **item `2.2-p1`:** At a root where player 0 acts, move A lets player 1 choose between `+0.8` and `-0.4` for player 0. Move B lets player 1 choose between `+0.2` and `0`. What are the two backed-up values, and which root move should player 0 select?

```sh
node cli.mjs attempt 2.2-p1 --answer 'A value; B value; chosen move; reason'
node cli.mjs feedback 2.2-p1
```

## Stop a branch for the right reason

At each state, first ask whether it is terminal. If so, use the requested player's exact return. Otherwise, if the declared depth is exhausted, use `context.evaluate(state, player)`. A depth counts simulated transition edges: depth one examines the states after one move; it does not mean one complete pair of turns.

For a nonterminal state below the limit, inspect its legal actions, simulate children and combine their values according to the actual actor. The supplied oracle exposes `terminal`, `returns`, `currentPlayer`, `legal` and `next`. The search implementation owns traversal and choice. It does not own game rules. In particular, `context.oracle.next(state, action)` returns the hypothetical child **State**; it does not apply an action to the actual match.

Commit **item `2.2-p2`:** A root move leads to another decision by the root player. Its two possible children have values `-0.6` and `+0.25` from that player's perspective. What value should this intermediate state back up? Explain why “always minimize on the second level” gives the wrong answer.

## A budget is part of the algorithm's contract

`context.oracle.remaining` reports unused simulation credits, and `used` reports consumed credits. Every call to `next` consumes a credit. Asking for an extra child after the budget is exhausted violates the contract even if your code catches the resulting error. Choosing a legal move afterward does not undo that extra work.

Select a legal fallback before expanding children. With no simulation credits, a policy still has to return a legal action from `context.legalActions`. When there are credits, avoid claiming an unfinished branch's partial result as if every relevant reply had been examined. A partial opponent node can look unusually strong simply because its dangerous reply has not yet been visited.

A clear initial policy can restrict itself to work it can finish at its chosen depth, or use a documented safe result from an earlier completed search. More sophisticated methods are welcome, but their treatment of incomplete work must be explicit. The next lesson develops iterative deepening as one way to retain a complete earlier result.

Commit **item `2.2-p3`:** A search fully checks candidate A and finds value `0`. It starts candidate B, sees one favorable reply worth `+0.7`, and runs out of credits before examining B's other replies. Why is selecting B as a proved `+0.7` move unjustified? State what evidence is missing.

## Implement and test your search

Open `learner/search.mjs` and implement `search(context)`. It returns one legal action ID. The context supplies `state`, `player`, `legalActions`, `parameters.maxDepth`, `evaluate`, the seeded `rng`, and the counted `oracle`. Keep values in the explicit root player's perspective. Any documented tie choice among equally best legal moves is acceptable.

Run `node cli.mjs check 2`. The checker includes small independently understood cases; it does not merely demand that your code resemble a reference implementation. Unpruned minimax and correct alpha-beta search can both meet the contract. If a tiny endgame fails, keep its state, predicted action and actual returned action. Trace one branch by hand before adding more search depth.

**Item `2.2-transfer`:** A tree contains two different states with the same board layout but different players to move. A transposition cache returns the first stored value for both. Describe how this can change the selected root move and which information the cache key must include.

Commit, obtain feedback and record your repair as a new attempt. Finish with a legal search policy that respects credits and explains its fallback. Finding a winning move once is weaker evidence than choosing correctly on the targeted adverse and valid-alternative cases.
