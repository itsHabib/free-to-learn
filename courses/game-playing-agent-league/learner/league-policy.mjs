// Supplied adapter. Your search and evaluation remain in their learner files.
import {search} from './search.mjs';
import {evaluate} from './evaluation.mjs';
export function searchPolicy(context) {
  return search({...context, evaluate});
}
// Stable export used by the supplied roster assembler.
export const decide = searchPolicy;
