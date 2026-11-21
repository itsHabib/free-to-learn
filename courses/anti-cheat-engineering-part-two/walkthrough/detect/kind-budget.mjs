// Unit 14, new application: a false-flag budget for every kind of legal player. Lesson 14,
// "Use the idea on a new case", gives the task; examples/check-kind-budget.mjs checks it.
// No finished chooseThresholdByKind is supplied.
//
// chooseThresholdByKind(legal, budget): legal is one { kind, score } per legal dev session.
// Returns the smallest t among the scores such that, for every kind on its own, the share
// of that kind's scores at or above t is at most budget; Infinity when no score qualifies.
// It must not change the list it is given.
export function chooseThresholdByKind(legal, budget) {
  throw new Error('chooseThresholdByKind: not written yet');
}
