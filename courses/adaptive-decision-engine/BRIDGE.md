# Optional prerequisite bridge · 60–90 minutes estimated

This course assumes JavaScript functions, arrays, objects, ES modules, async/await, JSON and elementary averages. These tasks recommend practice; they do not lock navigation.

## Preserve the original

Explain why `{...state, health:state.health-2}` preserves the original object, while assigning state.health changes it. Create an object with a nested history array, copy it, append one event without changing the original, and test both lengths. A shallow object spread does not copy the nested array.

Worked reasoning: copy the outer object and create a new history array with the old elements plus the new event. Completion task: replace the event's damage without altering either original object or array. Independent task: keep two alternate next states from the same prefix.

## Wait and fail explicitly

An async function returns a promise. Await pauses that function until resolution or rejection. Make a promise that resolves to a number, then one that rejects with an Error. Use try/catch to preserve the failure reason. Independent task: race a result against a timeout and verify that a late result does not execute a second state change.

## Validate JSON shape

Parsing JSON establishes syntax, not correctness. Parse a record with probability 2; require a finite number between zero and one and reject it. Completion task: validate every entry and sum a two-choice distribution. Independent task: reject missing and extra action keys without depending on their order.

## Compute a weighted measure

For health 6 of 12, missing fraction is 0.5. Weight it by 0.6 to obtain 0.3. If recent damage is 3 of a normalizing 6, its weighted term is 0.2. Together they make 0.5. Independent task: compute the same formula at health 8 with damage sum 6. Expected relation: the health term is smaller while the damage term reaches its cap. Explain why missing history must remain unknown.

If any task needed help, use the matching support route and record that assistance. These prerequisites support the course; they are not graded as independent mastery of its later director.
