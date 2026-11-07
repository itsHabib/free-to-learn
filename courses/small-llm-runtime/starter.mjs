// Your runtime. numeric.mjs is supplied and independent of the tensor course.
import {finiteVector,zeros,dot,linear,add,multiply,row} from './numeric.mjs';
import {CONFIG,VOCAB} from './spec.mjs';
export {CONFIG,VOCAB};
// Supplied file identity; cryptography is outside this course's objectives.
export async function sha256(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
const todo=lesson=>{throw new Error(`TODO lesson ${lesson}: implement the named API in runtime.mjs; see the Build section.`);};
export const loadModel=async(text,expectedDigest)=>todo('01');
export const encode=text=>todo('01');
export const decode=ids=>todo('01');
export const softmax=xs=>todo('02');
export const silu=x=>todo('02');
export const rmsNorm=(x,g,epsilon=CONFIG.epsilon)=>todo('03');
export const mlp=(x,w1,w2,w3)=>todo('03');
export const rotary=(x,position,base=CONFIG.ropeBase)=>todo('04');
export const attention=(query,keys,values)=>todo('04');
export const forward=(model,tokens)=>todo('04');
export const prefill=(model,tokens)=>todo('05');
export const decodeStep=(model,token,cache)=>todo('05');
export const rng=seed=>todo('06');
export const sample=(logits,options={},random=Math.random)=>todo('06');
export const generate=(model,prompt,options={})=>todo('07');
