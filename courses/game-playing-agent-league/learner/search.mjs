/**
 * Modules 2.2–2.3 learner work.
 * Return one legal action ID. Search from context.player's perspective.
 * Use context.oracle for every hypothetical transition; next(s, a) returns
 * the next State and spends one credit. Do not call it when remaining is zero.
 * Use context.parameters.maxDepth as the requested horizon and
 * context.evaluate(state, player) for nonterminal horizon states.
 * Terminal values take precedence over the depth limit.
 * At inadequate budget any legal fallback is allowed; never overrun the quota.
 * Run: node cli.mjs check search
 */
export function search(context) {
  throw new Error('LEARNER_TODO: search adversarial replies within the supplied budget.');
}
