export function feature({ previous }) {
  if (previous.rows === 0) return 0;
  return previous.nulls / previous.rows;
}

export function chooseLearned(score, model) {
  return score <= model.cutoff ? model.low : model.high;
}
