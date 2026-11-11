/** Supplied adapter. The learner implements features and search, not this glue. */
import {features} from './value-model.mjs';
import {search} from './search.mjs';
import {evaluateLinear} from '../lib/training.mjs';
export function decide(context) {
  const weights=context.parameters.weights;
  return search({...context,evaluate:(state,player)=>evaluateLinear(state,player,weights,features)});
}
