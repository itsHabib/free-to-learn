# Hints for milestone 1

These hints apply to the baseline investigation, not the transfer task. Record the highest hint level you read in your next notebook record and name any other help in `assistance_details`. Keep your first prediction and code attempt.

## Hint 1: make one update visible

Use one tick and write two columns: the input state and the state after that tick. Ask which value changed and which stayed the same before naming a rule. Reason: several updates can hide the order of a single update.

Next action: choose two one-tick runs that differ in exactly one argument. Predict both outputs before running them.

## Hint 2: separate competing rules

If you think the command chooses a velocity, compare runs with the same command and position but different starting velocities. If you think it changes velocity, ask whether your rule still explains both signs and inputs near the accepted endpoints. Reason: rival rules often agree at a convenient starting value and disagree elsewhere.

Next action: write both rules in words, then pick an input where they predict different output. Use the observed output to reject or retain each rule. The accepted input endpoints alone do not establish output limits.

## Hint 3: trace a sibling update

Read this level after saving a prediction or model attempt. It uses the marker from the lesson, whose rule is different from the cart's.

For the marker, start with `p = -4`, `v = 2`, `flip = 1`. The true condition negates velocity, so the current `v` becomes `-2`. The later addition reads that current value: `p = -4 + -2 = -6`. The returned pair is `(-6, -2)`. Reason: tracking the value after each assignment reveals which version a later operation uses.

Next action: choose one native cart observation and annotate its `lab_step` instructions in the same way. Mark the first calculation where your model and the trace disagree. Keep uncertainty explicit if you cannot yet identify the value.

If repeated model attempts still fail, request the separately marked source walkthrough after preserving an attempt. Record that later work as `solution` assistance. The student bundle intentionally contains no source walkthrough.
