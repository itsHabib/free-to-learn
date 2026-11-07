import {validate} from '../game.mjs';
import {observe} from './observe.mjs';
import {chooseRules} from './rules.mjs';
import {hash,copy,VERSION} from '../shared.mjs';
export function policy(state,memory={}) {
 throw Error('TODO: implement policy; see the matching lesson and API.md');
}
export function checkpoint(state,memory,scheduler,identities) {
 throw Error('TODO: implement checkpoint; see the matching lesson and API.md');
}
export function restore(record,identities) {
 throw Error('TODO: implement restore; see the matching lesson and API.md');
}
