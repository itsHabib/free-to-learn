# 8.2 Adapt under the original compute budget

The supplied rule patch changes when a player gets another move. Diagnose the failed assumption and adapt your agent within the declared budget.

## Read the new contract before changing the code

The base game alternates players, but your search interface exposes the actual current player. Those facts were deliberately separate. If a new rule sometimes gives the same player another move, a recursion that simply negates every returned value may apply the wrong perspective. A recursion that asks who acts next has a chance to remain correct without a structural rewrite.

Do not infer the new rules from an animation. Read the issued specification, inspect the supplied conformance example and check the state fields. New counters can matter to future legal moves. Two equal boards with different remaining privileges are different states and need different cache identities.

As a worked diagnostic on a generic tree, suppose the root and its child are both controlled by the maximizing player. At the child, the player can select between two outcomes. Treating that child as an opponent turn predicts the wrong choice. The mistake concerns who owns the decision, not the arithmetic sign of the terminal reward. Use an explicit actor trace to identify where your implementation's assumption diverges.

**Commit:** item `8.2-p1` asks you to locate the kind of component that can fail even when the visible board and legal-action encoding stay the same.

**Practice 8.2-p1:** The board and action IDs look unchanged, but a new visible phase field changes who moves next. Name two components that may still be wrong.

## Reproduce one failure before making a broad repair

Run the frozen old policy under the new supplied rules and the fixed evaluation plan. Find one small failing trace. Record its initial state, rule identity, action sequence and first consequential decision. A smaller witness is easier to reason about than an average season score.

State a hypothesis before editing. Perhaps the search backup assumes alternation, the transposition key omits a new counter, or the learned feature representation collapses strategically different states. Make the narrow change that addresses the hypothesis. Reproduce the witness, then test fresh positions. A patch that hardcodes the observed action can fix one replay while leaving the actual assumption unchanged.

If your generic policy already handles the changed rule, do not add a meaningless edit to look busy. Demonstrate that it obeys the new contract, explain why, and test the new state field and actor cases. Transfer can be preservation of a valid abstraction.

**Apply it:** commit item `8.2-p2` comparing a hardcoded trace repair with a state-representation repair. Then inspect feedback and revise your diagnosis if needed.

**Practice 8.2-p2:** A repair returns the known winning move whenever the failing board appears. Another repair includes the new phase in the state representation and follows the actual actor. Which better addresses the hypothesis, and what must still be tested?

## Learning and evaluation can break independently of search

A value model may have learned returns under the ordinary rule distribution. Correct search does not make those estimates automatically calibrated under the patch. New counters may need representation; different move sequences can change which training examples occur. If you refit the model, retain its new training provenance and count its computation against the adaptation budget.

Evaluate both ordinary and changed rules. Keep the original budget, opponent identities and declared scenario process for each comparison. If you choose among multiple adaptation candidates using a selection set, freeze the choice before final evaluation. A patch does not excuse test-set tuning.

For response search, distinguish a responder's limited failure from the absence of any exploit. The new game may enlarge the set of relevant strategies. Your old response family might simply be too narrow to detect the new weakness.

**Transfer:** item `8.2-p3` asks what you can conclude when the ordinary policy's score holds but its new-rule feature errors grow. Keep prediction quality, playing strength and uncertainty separate.

**Practice 8.2-p3:** After a patch, win rate appears unchanged but value prediction error increases. Does unchanged win rate prove the model still represents the game equally well?

## Your adapted artifact

Keep the original policy, adapted policy or justified unchanged policy, explanation of the changed premise, minimal witness, fresh checks, training credits and both evaluation reports. The supplied host and game remain supplied. Your capstone demonstrates the target reasoning and policy changes; it does not require building a second game engine.
