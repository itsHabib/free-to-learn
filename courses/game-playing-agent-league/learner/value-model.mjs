/** Module 3 learner work. Supplied transport never fits these weights for you. */
export function features(state, player) {
  // Return 1–32 finite values in [-1,1], with stable order and dimension.
  // Distinguish some boards at a fixed requested player, actor and ply.
  // Preserve the requested perspective on some feature-relevant positions.
  // Material-only, advancement and other meaningful board measurements are
  // allowed; neither every move nor every perspective change must alter x.
  // Player identity, move count or a constant alone is not a board representation.
  // Do not use final outcomes, evaluation partition IDs or opponent names.
  throw new Error('Implement features(state, player) after lesson 3.1.');
}

export function fit(examples, {seed, epochs, learningRate}) {
  // examples: [{x:[...],target:-1|1,episodeId,scenarioId,...}]
  // Return {weights:[...]}; the weight order must match your feature order.
  // Train only on these examples. The caller retains validation separately.
  throw new Error('Implement a data-responsive value fit after lesson 3.2.');
}
