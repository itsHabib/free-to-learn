// Adapt the runtime mechanisms you built in modules01..07 to the one trained profile.
// These are only your prior numerical primitives, not a supplied trained decoder.
export {PROFILE,ASSETS} from './trained-spec.mjs';
export {rmsNorm,silu,mlp,rotary,attention,rng} from './runtime.mjs';
const todo=name=>{throw new Error(`TODO trained ${name}; read TRAINED.md and preserve this first attempt`);};
export async function loadModel(modelBytes,tokenizerBytes){return todo('checked binary/tokenizer loading');}
export function encode(model,text,options={}){return todo('UTF-8 byte fallback and scored BPE');}
export function decode(model,ids){return todo('token/byte reconstruction');}
export function forward(model,ids){return todo('full-prefix grouped-query causal decoder');}
export function prefill(model,ids){return todo('trained prefill');}
export function decodeStep(model,token,cache){return todo('trained immutable cache step');}
export function sample(logits,options={},random=Math.random){return todo('512-token stable sampling');}
export function generate(model,prompt,options={}){return todo('bounded trained generation');}
