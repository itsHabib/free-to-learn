// A complete ONE-layer sibling example. It does not solve the multi-hop project.
import { freshKey, seal, open, context } from '../runtime/crypto.mjs';
const key=freshKey();
const ctx=context('sibling-circuit','oak','forward',0);
const packet=seal(key,ctx,{next:'archive',body:{operation:'lookup',item:'tide'}});
const opened=open(key,ctx,packet);
console.log(JSON.stringify({packetFields:Object.keys(packet),opened},null,2));
