// Chapter 04. The runtime passes only information available at decision time.
export function feature(observation) {
  throw new Error('Implement feature in work/policy.mjs. Read lesson 04 for its input and cold-start contract.');
}

// model = { cutoff: number, low: action, high: action }.
export function chooseLearned(score, model) {
  throw new Error('Implement chooseLearned in work/policy.mjs. The fitted model supplies both actions.');
}
