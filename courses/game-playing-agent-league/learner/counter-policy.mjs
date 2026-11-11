/** Supplied adapter for a declared opponent model, not hidden opponent access. */
import {responsePolicy} from './vulnerability.mjs';
import {evaluate} from './evaluation.mjs';
import {greedyPolicy} from '../lib/supplied-policies.mjs';
export function decide(context) {
  const model=context.parameters.opponentModel??'greedy';
  if(!['greedy','uniform'].includes(model)) throw new Error('Supported declared opponent models are greedy and uniform.');
  function opponentPolicy(state) {
    const actions=context.oracle.legal(state);
    if(model==='uniform') return actions.map(actionId=>({actionId,probability:1/actions.length}));
    const selected=greedyPolicy({state,player:context.oracle.currentPlayer(state),legalActions:actions});
    return actions.map(actionId=>({actionId,probability:actionId===selected?1:0}));
  }
  return responsePolicy({...context,evaluate,opponentPolicy});
}
