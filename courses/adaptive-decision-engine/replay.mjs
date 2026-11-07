import {canonical} from './shared.mjs';
export function createReplay(captures){return async request=>{const found=captures.find(c=>['live','recorded'].includes(c.origin)&&canonical(c.request)===canonical(request));if(!found)throw Error('unavailable: no exact recorded request');return structuredClone(found.raw);};}
