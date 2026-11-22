// Inject run from a learner or worked JIT. A live-query-only learner can use quantityOver.
export function jitMatcher(run, { threshold = 30, choose = () => 'compile', batchSize = 64, onTrace } = {}) {
  const program = [['load'], ['const', threshold], ['gt']];
  return values => {
    const { matches, trace } = run(program, values, { choose, batchSize });
    onTrace?.(trace);
    return matches;
  };
}
