// Supplied prior-layer reference for module 04; record reference assistance.
import {finiteVector,zeros,dot,linear,add,multiply,row} from './numeric.mjs';
export const CONFIG=Object.freeze({architecture:'pocket-decoder-v1',vocabSize:32,dim:8,heads:2,layers:2,hidden:16,maxContext:32,ropeBase:10000,epsilon:1e-5});
export const VOCAB=['<eos>','<unk>','\n',' ',...'abcdefghijklmnopqrstuvwxyz','.',','];
const clone=x=>JSON.parse(JSON.stringify(x));
function freeze(x) { Object.freeze(x); Object.values(x).filter(v=>v && typeof v==='object').forEach(freeze); return x; }
export async function sha256(text) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export async function loadModel(text,expectedDigest) {
 if(typeof text!=='string' || !/^[0-9a-f]{64}$/.test(expectedDigest)) throw new Error('provide checkpoint text and expected SHA-256');
 if(await sha256(text)!==expectedDigest) throw new Error('checkpoint SHA-256 mismatch');
 const m=JSON.parse(text);
 if(!m.config||Object.keys(m.config).length!==Object.keys(CONFIG).length||Object.entries(CONFIG).some(([k,v])=>m.config[k]!==v)||JSON.stringify(m.vocab)!==JSON.stringify(VOCAB)||m.format!=='ivy-pocket-json-v1')throw new Error('unsupported architecture, config, vocabulary or format');
 const d=CONFIG.dim,f=CONFIG.hidden,v=CONFIG.vocabSize;
 const shapes={embedding:[v,d],finalNorm:[d],lmHead:[d,v]};
 for(let l=0;l<CONFIG.layers;l++) Object.assign(shapes,{[`layers.${l}.attnNorm`]:[d],[`layers.${l}.wq`]:[d,d],[`layers.${l}.wk`]:[d,d],[`layers.${l}.wv`]:[d,d],[`layers.${l}.wo`]:[d,d],[`layers.${l}.ffnNorm`]:[d],[`layers.${l}.w1`]:[d,f],[`layers.${l}.w2`]:[f,d],[`layers.${l}.w3`]:[d,f]});
 if(!m.weights || Object.keys(m.weights).sort().join('|')!==Object.keys(shapes).sort().join('|')) throw new Error('missing or unexpected weight names');
 for(const [name,shape] of Object.entries(shapes)) {
   const w=m.weights[name];
   if(JSON.stringify(w?.shape)!==JSON.stringify(shape)) throw new Error(`shape mismatch for ${name}`);
   finiteVector(w.data,shape.reduce((a,b)=>a*b,1),name);
 }
 return freeze({...m,fingerprint:expectedDigest});
}
export function encode(text) {
 if(typeof text!=='string') throw new Error('tokenizer input must be text');
 return [...text].map(ch=>{const i=VOCAB.indexOf(ch);return i<0?1:i;});
}
export function decode(ids) {
 validIds(ids,true);
 return ids.map(i=>i===0?'':i===1?'\ufffd':VOCAB[i]).join('');
}
function validIds(ids,empty=false) {
 if(!Array.isArray(ids) || (!empty && !ids.length) || ids.some(i=>!Number.isInteger(i) || i<0 || i>=32)) throw new Error('tokens must be valid integer IDs; prompt must be nonempty');
}
export function softmax(xs) {
 if(!Array.isArray(xs)||!xs.length||Array.from(xs).some(x=>typeof x!=='number'||(x!==-Infinity&&!Number.isFinite(x)))||xs.every(x=>x===-Infinity))throw new Error('softmax needs numeric scores and at least one finite unmasked value');
 const max=Math.max(...xs), ex=xs.map(v=>Math.exp(v-max)), sum=ex.reduce((a,b)=>a+b,0);
 return ex.map(v=>v/sum);
}
export function rmsNorm(x,g,epsilon=CONFIG.epsilon) {
 finiteVector(x,g.length); finiteVector(g,x.length);
 if(!(epsilon>0) || !Number.isFinite(epsilon)) throw new Error('invalid normalization epsilon');
 if(!x.length)throw new Error('normalization needs a nonempty vector');
 const peak=Math.max(...x.map(Math.abs));if(peak===0)return x.map(()=>0);
 const mean=x.reduce((s,v)=>s+(v/peak)**2,0)/x.length,denominator=Math.hypot(peak*Math.sqrt(mean),Math.sqrt(epsilon));
 return x.map((v,i)=>(v/denominator)*g[i]);
}
export function silu(x) { if(!Number.isFinite(x)) throw new Error('SiLU input must be finite'); return x/(1+Math.exp(-x)); }
export function mlp(x,w1,w2,w3) { return linear(multiply(linear(x,w1).map(silu),linear(x,w3)),w2); }
export function rotary(...args){throw new Error("TODO module 04: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function attention(...args){throw new Error("TODO module 04: implement the current runtime layer; supplied support completes earlier dependencies only.");}
function ropeHeads(){throw new Error("TODO module 04: implement the current runtime layer; supplied support completes earlier dependencies only.");}
function attendHeads(){throw new Error("TODO module 04: implement the current runtime layer; supplied support completes earlier dependencies only.");}
const weight=(m,l,n)=>m.weights[`layers.${l}.${n}`];
export function forward(...args){throw new Error("TODO module 04: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function prefill(...args){throw new Error("TODO module 05: implement the current runtime layer; supplied support completes earlier dependencies only.");}
function validCache(){throw new Error("TODO module 05: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function decodeStep(...args){throw new Error("TODO module 05: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function rng(...args){throw new Error("TODO module 06: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function sample(...args){throw new Error("TODO module 06: implement the current runtime layer; supplied support completes earlier dependencies only.");}
export function generate(...args){throw new Error("TODO module 07: implement the current runtime layer; supplied support completes earlier dependencies only.");}
