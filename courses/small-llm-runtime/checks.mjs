import {checkStreamDelivery,checkStreamRuntime} from './stream-checks.mjs';
import {checkBeamFixtures,checkBeamRuntime} from './beam-checks.mjs';
import {CONFIG,VOCAB} from './spec.mjs';
export const COURSE='small-llm-runtime';
export const REQUIREMENTS={
 '01':'Validate pinned checkpoint identity, names, shapes and values; tokenize without silent ID changes.',
 '02':'Compute stable probabilities and activation values; reject invalid numeric inputs.',
 '03':'Apply learned RMS normalization and gated MLP with the pinned matrix orientation.',
 '04':'Apply head-local rotary positions, scaled causal attention and residual blocks.',
 '05':'Match full-prefill logits during incremental decode; preserve and validate cache state.',
 '06':'Sample reproducibly under seed, temperature, top-k, EOS and context limits.',
 '07':'Run a complete local generator with deterministic evidence and explicit stop reasons.',
 '08':'Deliver generated tokens to a consumer, diagnose unfamiliar cache corruption, and implement bounded cumulative-score beam search.',
};
function same(a,b) {
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a))return a.length===b.length&&Array.from(a).every((value,i)=>same(value,b[i]));
 const keys=Object.keys(a).sort(),other=Object.keys(b).sort();
 return keys.length===other.length&&keys.every((key,i)=>key===other[i]&&same(a[key],b[key]));
}
const equal=(a,b)=>{if(!same(a,b))throw new Error(`expected ${JSON.stringify(b)}; observed ${JSON.stringify(a)}`);};
const reject=async fn=>{let caught=false;try{await fn();}catch{caught=true;}if(!caught)throw new Error('expected rejection; observed acceptance');};
const flat=x=>Array.isArray(x)?x.flat(Infinity):[x];
const close=(a,b,tol=1e-8)=>{const av=flat(a),bv=flat(b);if(av.length!==bv.length||av.some((v,i)=>!Number.isFinite(v)||Math.abs(v-bv[i])>tol))throw new Error(`numeric mismatch; expected ${JSON.stringify(b)} within ${tol}; observed ${JSON.stringify(a)}`);};
const model=async(a,f)=>a.loadModel(f.text,f.digest);
const digestText=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
function checkGeneration(result,prompt,{maxNewTokens=8}={},context=32) {
 const validIds=ids=>Array.isArray(ids)&&Array.from(ids).every(id=>Number.isInteger(id)&&id>=0&&id<VOCAB.length);
 if(!result||!validIds(result.tokens)||!validIds(result.generated)||!Array.isArray(result.trace))throw new Error('generation must return valid token arrays and a trace');
 equal(result.tokens,[...prompt,...result.generated]);
 const text=result.generated.map(id=>id===0?'':id===1?'\ufffd':VOCAB[id]).join('');
 equal(result.text,text);
 if(result.generated.length>maxNewTokens||result.tokens.length>context)throw new Error('generation exceeded token or context limit');
 equal(result.trace,result.generated.map((token,i)=>({position:prompt.length+i,token})));
 const eos=result.generated.indexOf(0);
 if(eos>=0&&eos!==result.generated.length-1)throw new Error('generation continued after EOS');
 const expectedStop=maxNewTokens===0?'limit':prompt.length===context?'context':eos>=0?'eos':result.tokens.length===context?'context':'limit';
 equal(result.stop,expectedStop);
 if(expectedStop==='limit'&&result.generated.length!==maxNewTokens)throw new Error('limit stop requires the requested number of generated tokens');
}
export const cases=[
 {id:'loader-valid',lesson:'01',input:'original 2-layer fixture and its SHA-256',run:async(a,p,f)=>{const m=await a.loadModel(f.text,f.digest);equal(m.config,CONFIG);equal(m.vocab,VOCAB);equal(m.fingerprint,f.digest);}},
 {id:'loader-reordered-fields',lesson:'01',input:'valid model config serialized in alphabetic field order with its own digest',run:async(a,p,f)=>{const data=JSON.parse(f.text);data.config=Object.fromEntries(Object.entries(data.config).sort(([x],[y])=>x.localeCompare(y)));const text=JSON.stringify(data),digest=await digestText(text),m=await a.loadModel(text,digest);equal(m.config,CONFIG);equal(m.vocab,VOCAB);equal(m.fingerprint,digest);}},
 {id:'loader-corrupt',lesson:'01',input:'one changed checkpoint byte with original digest',run:async(a,p,f)=>reject(()=>a.loadModel(f.text+' ',f.digest))},
 {id:'loader-wrong-shape',lesson:'01',input:'correctly hashed but malformed wq shape',run:async(a,p,f)=>{const x=JSON.parse(f.text);x.weights['layers.0.wq'].shape=[4,16];const t=JSON.stringify(x);await reject(async()=>a.loadModel(t,await a.sha256(t)));}},
 {id:'tokenizer-unicode',lesson:'01',input:'a🙂 b\n',run:a=>{equal(a.encode('a🙂 b\n'),[4,1,3,5,2]);equal(a.decode([4,1,3,5,2,0]),'a\ufffd b\n');}},
 {id:'tokenizer-invalid-id',lesson:'01',input:[32],run:a=>reject(()=>a.decode([32]))},
 {id:'loader-finite-and-extra',lesson:'01',input:'correctly hashed unexpected tensor or null weight entry',run:async(a,p,f)=>{for(const change of [x=>x.weights.extra={shape:[1],data:[1]},x=>x.weights.embedding.data[0]=null]){const x=JSON.parse(f.text);change(x);const t=JSON.stringify(x);await reject(async()=>a.loadModel(t,await a.sha256(t)));}}},
 {id:'softmax-extreme',lesson:'02',input:[1000,1001,-Infinity],run:a=>{const p=a.softmax([1000,1001,-Infinity]);close(p,[1/(1+Math.E),Math.E/(1+Math.E),0]);close(a.softmax([-1000,-999,-Infinity]),p);}},
 {id:'softmax-invalid',lesson:'02',input:'all masked / NaN / positive infinity / nonnumeric scores',run:async a=>{for(const scores of [[-Infinity,-Infinity],[0,NaN],[0,Infinity],[null,0],['1',0],[undefined,0],[,0]])await reject(()=>a.softmax(scores));}},
 {id:'silu-extreme',lesson:'02',input:[-1000,0,1000],run:a=>close([-1000,0,1000].map(a.silu),[0,0,1000])},
 {id:'normalization-gain',lesson:'03',input:{x:[2,-2],g:[1,2],epsilon:1},run:a=>{close(a.rmsNorm([2,-2],[1,2],1),[2/Math.sqrt(5),-4/Math.sqrt(5)]);close(a.rmsNorm([1,3],[1,1],1),[1/Math.sqrt(6),3/Math.sqrt(6)]);close(a.rmsNorm([0,0],[1,1]),[0,0]);}},
 {id:'normalization-large-finite',lesson:'03',input:{x:[1e300,-1e300],g:[1,2]},run:a=>close(a.rmsNorm([1e300,-1e300],[1,2]),[1,-2])},
 {id:'mlp-gating-orientation',lesson:'03',input:'x=[1,-1], w1=identity, w3=diag(2,3), w2=[[1,2],[3,4]]',run:a=>{const w1={shape:[2,2],data:[1,0,0,1]},w3={shape:[2,2],data:[2,0,0,3]},w2={shape:[2,2],data:[1,2,3,4]};const u=2/(1+Math.exp(-1)),v=3/(1+Math.E);close(a.mlp([1,-1],w1,w2,w3),[u+3*v,2*u+4*v]);}},
 {id:'rotary-position',lesson:'04',input:{x:[1,0,0,1],position:3},run:a=>{close(a.rotary([1,0,0,1],3),[Math.cos(3),Math.sin(3),-Math.sin(0.03),Math.cos(0.03)]);close(a.rotary([2,-1,3,4],0),[2,-1,3,4]);}},
 {id:'attention-scale-values',lesson:'04',input:{query:[1,1],keys:[[1,0],[0,1]],values:[[2,4],[8,-2]]},run:a=>close(a.attention([1,1],[[1,0],[0,1]],[[2,4],[8,-2]]),[5,1])},
 {id:'attention-nonuniform',lesson:'04',input:{query:[2,0],keys:[[1,0],[0,1]],values:[[1,0],[0,1]]},run:a=>{const t=Math.exp(Math.SQRT2);close(a.attention([2,0],[[1,0],[0,1]],[[1,0],[0,1]]),[t/(1+t),1/(1+t)]);}},
 {id:'forward-independent-oracle',lesson:'04',input:'original fixture, tokens [4,5,3,6,7], scalar oracle logits',run:async(a,p,f)=>{const m=await model(a,f);close(a.forward(m,[4,5,3,6,7]).logits,f.golden.logits,1e-10);}},
 {id:'forward-causal',lesson:'04',input:'prefix [4,5] and two distinct suffixes',run:async(a,p,f)=>{const m=await model(a,f);close(a.forward(m,[4,5,6,7]).logits.slice(0,2),a.forward(m,[4,5,20,21]).logits.slice(0,2));}},
 {id:'cache-prefill',lesson:'05',input:'prefill [4,5,3]',run:async(a,p,f)=>{const m=await model(a,f),s=a.prefill(m,[4,5,3]);close(s.logits,a.forward(m,[4,5,3]).logits.at(-1));equal(s.cache.position,3);equal(s.cache.layers.length,2);}},
 {id:'cache-incremental-parity',lesson:'05',input:'prefill [4], then decode [5,3,6,7]',run:async(a,p,f)=>{const m=await model(a,f),tokens=[4,5,3,6,7];let s=a.prefill(m,[4]);for(let pos=1;pos<tokens.length;pos++){const before=JSON.stringify(s.cache),old=s.cache;s=a.decodeStep(m,tokens[pos],old);equal(JSON.stringify(old),before);close(s.logits,f.golden.logits[pos],1e-10);equal(s.cache.position,pos+1);}}},
 {id:'cache-invalid-before-mutation',lesson:'05',input:'foreign fingerprint, wrong key length, bad token',run:async(a,p,f)=>{const m=await model(a,f),s=a.prefill(m,[4,5]);for(const change of [c=>c.fingerprint='foreign',c=>c.layers[1].keys.pop()]){const c=structuredClone(s.cache);change(c);const before=JSON.stringify(c);await reject(()=>a.decodeStep(m,6,c));equal(JSON.stringify(c),before);}await reject(()=>a.decodeStep(m,32,s.cache));}},
 {id:'cache-cross-checkpoint-identity',lesson:'05',input:'cache from one valid checkpoint under a differently hashed valid checkpoint',run:async(a,p,f)=>{const first=await model(a,f),changed=JSON.parse(f.text);changed.weights.embedding.data[0]+=0.125;const text=JSON.stringify(changed),digest=await digestText(text),second=await a.loadModel(text,digest);equal(first.fingerprint,f.digest);equal(second.fingerprint,digest);if(first.fingerprint===second.fingerprint)throw new Error('distinct checkpoint bytes must have distinct validated fingerprints');const cache=a.prefill(first,[0,4]).cache,before=structuredClone(cache);await reject(()=>a.decodeStep(second,5,cache));equal(cache,before);}},
 {id:'sampling-seed-ties',lesson:'06',input:'equal maxima at IDs 2 and 3; temperature zero',run:a=>{const logits=Array(32).fill(-20);logits[2]=logits[3]=5;equal(a.sample(logits,{temperature:0,topK:2},()=>{throw new Error('greedy must not draw randomness');}),2);const r=a.rng(0),q=a.rng(0);equal(Array.from({length:5},()=>r()),Array.from({length:5},()=>q()));}},
 {id:'sampling-seed-values',lesson:'06',input:'first draws for seeds 0 and 1',run:async a=>{close(a.rng(0)(),1013904223/4294967296,0);close(a.rng(1)(),1015568748/4294967296,0);await reject(()=>a.rng(-1));}},
 {id:'sampling-topk-draw',lesson:'06',input:'two equal top logits; draws 0, 0.5 and 0.999',run:a=>{const logits=Array(32).fill(-1000);logits[8]=logits[9]=0;equal(a.sample(logits,{topK:2},()=>0),8);equal(a.sample(logits,{topK:2},()=>0.5),9);equal(a.sample(logits,{topK:2},()=>0.999),9);}},
 {id:'sampling-invalid',lesson:'06',input:'negative temperature / topK=0 / random=1',run:async a=>{const logits=Array(32).fill(0);await reject(()=>a.sample(logits,{temperature:-1}));await reject(()=>a.sample(logits,{topK:0}));await reject(()=>a.sample(logits,{},()=>1));}},
 {id:'sampling-wrong-score-types',lesson:'06',input:'null, numeric string or missing logit under greedy sampling',run:async a=>{for(const invalid of ['null','string','missing']){const logits=Array(32).fill(0);if(invalid==='missing')delete logits[8];else logits[8]=invalid==='null'?null:'2';await reject(()=>a.sample(logits,{temperature:0}));}}},
 {id:'sampling-small-temperature',lesson:'06',input:'finite logit 1e300 and temperature 1e-300',run:a=>{const logits=Array(32).fill(0);logits[8]=1e300;equal(a.sample(logits,{temperature:1e-300,topK:2},()=>0.75),8);}},
 {id:'generation-repeat-limits',lesson:'07',input:'prompt ab, seed=42, 5 new tokens; zero limit and full context',run:async(a,p,f)=>{const m=await model(a,f),options={seed:42,maxNewTokens:5,topK:4},r=a.generate(m,[4,5],options);checkGeneration(r,[4,5],options);equal(r,a.generate(m,[4,5],options));checkGeneration(a.generate(m,[4],{maxNewTokens:0}),[4],{maxNewTokens:0});checkGeneration(a.generate(m,Array(32).fill(4)),Array(32).fill(4));}},
 {id:'generation-pinned-seed',lesson:'07',input:{prompt:[4,5],seed:42,maxNewTokens:5,topK:4},run:async(a,p,f)=>{const m=await model(a,f),options={seed:42,maxNewTokens:5,topK:4},r=a.generate(m,[4,5],options);checkGeneration(r,[4,5],options);equal(r.generated,[23,18,18,31,19]);equal(r.text,'too,p');}},
 {id:'generation-eos',lesson:'07',input:'model output head zeroed so greedy chooses EOS=0',run:async(a,p,f)=>{const source=JSON.parse(f.text);source.weights.lmHead.data.fill(0);const text=JSON.stringify(source),m=await a.loadModel(text,await a.sha256(text));const r=a.generate(m,[4],{temperature:0,maxNewTokens:8});equal(r.generated,[0]);equal(r.stop,'eos');}},
 {id:'generation-last-slot-controls',lesson:'07',input:'31-token prompt; invalid controls at zero limit',run:async(a,p,f)=>{const m=await model(a,f),r=a.generate(m,Array(31).fill(4),{temperature:0,maxNewTokens:8});equal(r.generated.length,1);if(r.stop!=='context'&&r.stop!=='eos')throw new Error('last slot must stop at context or EOS');await reject(()=>a.generate(m,[4],{maxNewTokens:0,temperature:-1}));}},
 {id:'capstone-generator-audit',lesson:'08',input:'new prompt, seeded generation and dimension-valid cache corruption',run:async(a,p,f)=>{
   if(typeof p.runProject!=='function')throw new Error('Create project.mjs with export async function runProject(runtime,model,spec); lesson 08 gives the interface, no starter.');
   const m=await model(a,f),prompt=[4,5,3,6,7],valid=a.prefill(m,prompt).cache,broken=structuredClone(valid);broken.layers[1].values.reverse();
   const r=await p.runProject(a,m,{prompt,cache:broken,maxNewTokens:4,seed:17,topK:3});
   checkGeneration(r.generation,prompt,{maxNewTokens:4});
   equal(r.generation,a.generate(m,prompt,{maxNewTokens:4,seed:17,topK:3}));
   if(!Array.isArray(r.differences)||r.differences.some(d=>!d||!Number.isInteger(d.layer)||d.layer<0||d.layer>=2||!['keys','values'].includes(d.component)||!Number.isFinite(d.maxError)||d.maxError<=1e-8)||!r.differences.some(d=>d.layer===1&&d.component==='values'))throw new Error('audit must locate layer 1 value corruption with finite numeric evidence');
   const ok=await p.runProject(a,m,{prompt,cache:valid,maxNewTokens:4,seed:17,topK:3});if(ok.differences.length)throw new Error('valid cache incorrectly flagged');
   const other=structuredClone(valid);other.layers[0].keys.at(-1)[0]+=0.25;const second=await p.runProject(a,m,{prompt,cache:other,maxNewTokens:4,seed:17,topK:3});if(!second.differences.some(d=>d.layer===0&&d.component==='keys'&&Math.abs(d.maxError-0.25)<1e-8))throw new Error('audit must also identify an unfamiliar key-component discrepancy');
 }},
 {id:'capstone-beam-fixtures',lesson:'08',input:'full-vocabulary sequence scores, global pruning, independent cache branches, limits and invalid controls',run:(a,p)=>checkBeamFixtures(a,p)},
 {id:'capstone-beam-runtime',lesson:'08',input:'original fixture: width-one greedy parity and independent fresh-path score replay',run:async(a,p,f)=>{
   if(typeof p.beamDecode!=='function')throw new Error('Create project.mjs exporting beamDecode(runtime,model,prompt,{beamWidth,maxNewTokens}); lesson08 defines the bounded extension.');
   return checkBeamRuntime(a,p,await model(a,f));
 }},
 {id:'capstone-stream-delivery',lesson:'08',input:'consumer pulls, guarded decode, stops and failure prefix',run:async(a,p,f)=>{if(typeof p.streamGenerate!=='function')throw new Error('Create project.mjs exporting streamGenerate(runtime,model,prompt,options); lesson08 defines consumer delivery.');return checkStreamDelivery(a,p,await model(a,f));}},
 {id:'capstone-stream-runtime',lesson:'08',input:'actual original model: streamed events and full result parity',run:async(a,p,f)=>{if(typeof p.streamGenerate!=='function')throw new Error('Create project.mjs exporting streamGenerate(runtime,model,prompt,options); lesson08 defines consumer delivery.');return checkStreamRuntime(a,p,await model(a,f));}},
];
function nextStep(c,project) {
 if(c.lesson!=='08')return `Read lesson ${c.lesson}, Mechanism and Build; edit runtime.mjs and rerun.`;
 if(c.id.startsWith('capstone-stream-'))return typeof project?.streamGenerate==='function'?'Follow the printed failure in API.md and lesson08; complete the named runtime prerequisite or repair the consumer loop, preserve the attempt and rerun.':'In project.mjs export streamGenerate(runtime,model,prompt,options); lesson08 defines token delivery and completion. Preserve the failed attempt and rerun.';
 if(c.id.startsWith('capstone-beam-'))return typeof project?.beamDecode==='function'?'beamDecode was found. Use the score/IDs/stop or parent-cache call diagnostic to compare your project with lesson08, Bounded search extension. Runtime prerequisite errors still need their earlier module check.':'Create your own beamDecode export in project.mjs; read lesson08, Bounded search extension, then rerun module08.';
 if(typeof project?.runProject!=='function')return 'Create project.mjs exporting async function runProject(runtime,model,spec), as described in lesson 08, Product and public interface; then rerun module 08.';
 return 'runProject was found, so this failure may come from project.mjs (its generation or differences) or from runtime.mjs methods the capstone also calls (loadModel, prefill, generate). Use the message to decide which; if it names an earlier module, repair and check that module first. Then compare with lesson 08, Product and public interface, and rerun module 08.';
}
export async function check(api,lesson,project={},fixture={}) {
 const selected=cases.filter(c=>lesson==='all'||c.lesson===lesson);if(!selected.length)throw new Error(`unknown lesson ${lesson}`);
 const results=[];
 for(const c of selected){try{await c.run(api,project,fixture);results.push({id:c.id,lesson:c.lesson,pass:true});}catch(e){results.push({id:c.id,lesson:c.lesson,pass:false,input:c.input,requirement:REQUIREMENTS[c.lesson],message:String(e.message??e),next:nextStep(c,project)});}}
 return {course:COURSE,lesson,pass:results.every(r=>r.pass),results};
}
