import assert from 'node:assert/strict';

export function checkPolicy({ feature, chooseLearned }) {
  function observed(rows, nulls, guardFailures = 0) {
    return { start: rows, end: rows + 32, remainingRows: 73, compiled: guardFailures > 0,
      previous: { rows, nulls, guardFailures } };
  }
  assert.equal(feature(observed(0, 0)), 0, 'At the first decision there are zero observed rows. Use the starter’s cold assumption of 0.');
  assert.equal(feature(observed(8, 2)), 0.25, 'Divide the previous null count by the previous row count, including interpreted rows.');
  assert.equal(feature(observed(5, 3, 1)), 0.6, 'One guard exit can cover several nulls. Read previous.nulls for the feature.');
  for (const low of ['compile', 'interpret']) {
    const high = low === 'compile' ? 'interpret' : 'compile';
    const model = { cutoff: 0.25, low, high };
    assert.equal(chooseLearned(0, model), low, 'Use the action in model.low below the fitted cutoff. Training can reverse the two actions.');
    assert.equal(chooseLearned(0.25, model), low, 'A score exactly at the cutoff belongs to the low leaf.');
    assert.equal(chooseLearned(1, model), high, 'Use the action in model.high above the fitted cutoff.');
  }
  return 'Cold start, last-batch feature, cutoff equality and both fitted action orientations passed.';
}
