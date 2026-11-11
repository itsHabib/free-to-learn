// Finite disclosed checks for learner-owned trained.mjs and trained-project.mjs.
// No author/runtime solution is imported. Goldens come from the independent scalar path.
const MODEL_SHA='b0a507e7ad0f626624f17112325e66691f9076d622e1d3274d103d00299f2696';
const TOKEN_SHA='037cb335abb25d1fa9e8ecae30ed2a3a8ace9302862ebcdc05d51a6bbb10c312';
const fail=message=>{throw new Error(message);};
const must=(value,message)=>{if(!value)fail(message);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function equal(a,b,label='value'){
 if(Array.isArray(b)){must(Array.isArray(a)&&a.length===b.length,`${label}: array length/type differs`);for(let i=0;i<b.length;i++){must(i in a,`${label}: missing element${i}`);equal(a[i],b[i],`${label}[${i}]`);}return;}
 if(b&&typeof b==='object'){must(a&&typeof a==='object'&&!Array.isArray(a),`${label}: object required`);for(const k of Object.keys(b))equal(a[k],b[k],`${label}.${k}`);return;}
 must(a===b,`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function close(a,b,label){must(Array.isArray(a)&&a.length===b.length,`${label}: vector length/type differs`);let maximum=0;for(let i=0;i<b.length;i++){const error=Math.abs(a[i]-b[i]),limit=1e-10+1e-10*Math.max(Math.abs(a[i]),Math.abs(b[i]));must(finite(a[i])&&error<=limit,`${label}[${i}]: observed${a[i]}, expected${b[i]}, error${error}, limit${limit}`);maximum=Math.max(maximum,error);}return maximum;}
async function reject(fn,label){let rejected=false;try{await fn();}catch{rejected=true;}must(rejected,label+' must reject');}
const required=(object,key,file='trained.mjs')=>{must(typeof object?.[key]==='function',`Export ${key} from work/${file}; TRAINED.md gives the interface`);return object[key];};
const sameIds=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>a[i]===x);
const briefIds=x=>{const t=JSON.stringify(x)??String(x);return t.length>80?t.slice(0,77)+'...':t;};
const load=(a,f)=>required(a,'loadModel')(f.modelBytes,f.tokenizerBytes);
function view(a,m){return {forward:(model,prompt)=>required(a,'forward')(model,prompt),encode:(text,options)=>required(a,'encode')(m,text,options),prefill:(model,prompt)=>required(a,'prefill')(model,prompt),decodeStep:(model,t,c)=>required(a,'decodeStep')(model,t,c),generate:(model,prompt,options)=>required(a,'generate')(model,prompt,options),decode:ids=>required(a,'decode')(m,ids),sample:(logits,options,random)=>required(a,'sample')(logits,options,random),rng:seed=>required(a,'rng')(seed)};}
const clone=x=>JSON.parse(JSON.stringify(x));
const trace=(prompt,ids)=>ids.map((token,index)=>({position:prompt.length+index,token}));
function componentCache(m,position){const rows=()=>Array.from({length:position},()=>Object.freeze(Array(32).fill(0)));return Object.freeze({format:'stories260k-cache-v1',fingerprint:m.fingerprint,tokenizerFingerprint:m.tokenizerFingerprint,position,layers:Object.freeze(Array.from({length:5},()=>Object.freeze({keys:Object.freeze(rows()),values:Object.freeze(rows())})))});}
function retainBoundaryFailures(facade,violations){for(const key of ['prefill','decodeStep']){const call=facade[key];facade[key]=(...args)=>{try{return call(...args);}catch(error){violations.push(String(error?.message??error));throw error;}};}return facade;}
function observeRuntime(facade,onCall){
 for(const [name,call]of Object.entries(facade)){
  if(typeof call!=='function')continue;
  facade[name]=(...args)=>{onCall(name);const result=call(...args);if(name!=='rng'||typeof result!=='function')return result;return(...drawArgs)=>{onCall('rng.draw');return result(...drawArgs);};};
 }
 return facade;
}
function generationShape(result,prompt){must(result&&typeof result==='object','generation object required');must(Array.isArray(result.generated),'generated IDs required');must(typeof result.text==='string','generation text required');must(['eos','context','limit'].includes(result.stop),'declared stop required');equal(result.tokens,[...prompt,...result.generated],'complete tokens');equal(result.trace,trace(prompt,result.generated),'trace');}
export const trainedCases=[
 {id:'trained-loader-tokenizer',input:'pinned raw binaries, BPE, Unicode and changed/truncated bytes',run:async(a,p,f)=>{
  const m=await load(a,f);equal(m.config,{architecture:'stories260k-v1',dim:64,hidden:172,layers:5,heads:8,kvHeads:4,vocabSize:512,maxContext:512,ropeBase:10000,epsilon:1e-5,bosId:1,eosId:2},'trained config');equal([...m.config.stopIds].sort((x,y)=>x-y),[1,2],'terminal IDs');equal(m.fingerprint,MODEL_SHA,'checkpoint identity');equal(m.tokenizerFingerprint,TOKEN_SHA,'tokenizer identity');
  for(const c of f.goldens.forward){equal(required(a,'encode')(m,c.text),c.tokens,'BPE IDs');equal(required(a,'decode')(m,c.tokens),c.text,'full-text roundtrip');}
  for(const c of f.goldens.mergeTies??[]){const ids=a.encode(m,c.text);must(sameIds(ids,c.tokens),`Rule (TRAINED.md, 2. Tokenize the trained vocabulary: "ties use the leftmost pair"): encode(model,${JSON.stringify(c.text)}) expected ${JSON.stringify(c.tokens)}; observed ${briefIds(ids)}. When two adjacent pairs share the greatest merge score, merge the leftmost pair first.`);}
  const bad=Uint8Array.from(f.modelBytes);bad[40]^=1;await reject(()=>a.loadModel(bad,f.tokenizerBytes),'changed checkpoint');await reject(()=>a.loadModel(f.modelBytes,f.tokenizerBytes.subarray(0,-1)),'truncated tokenizer');
 }},
 {id:'trained-forward-goldens',input:'five independent scalar prefixes,512logits and last grouped KV rows',run:async(a,p,f)=>{
  const m=await load(a,f);let maximum=0;
  for(const c of f.goldens.forward){const full=required(a,'forward')(m,c.tokens),state=required(a,'prefill')(m,c.tokens);maximum=Math.max(maximum,close(state.logits,c.lastLogits,'trained final logits'));close(full.logits[0],c.firstLogits,'trained first logits');must(state.cache.position===c.tokens.length&&state.cache.layers.length===5,'trained cache position/layer count differs');for(let l=0;l<5;l++){close(state.cache.layers[l].keys.at(-1),c.cacheLastRows[l].lastKey,'grouped key'+l);close(state.cache.layers[l].values.at(-1),c.cacheLastRows[l].lastValue,'grouped value'+l);}}
  return {maxAbsError:maximum};
 }},
 {id:'trained-cache-parity',input:'two live branches, copied-cache alternative and foreign/malformed state',run:async(a,p,f)=>{
  const m=await load(a,f),prompt=a.encode(m,'A blue bird'),root=a.prefill(m,prompt),before=JSON.stringify(root.cache);
  for(const token of [347,421]){const state=a.decodeStep(m,token,root.cache),fresh=a.prefill(m,[...prompt,token]);close(state.logits,fresh.logits,'cached/full logits');equal(JSON.stringify(root.cache),before,'shared parent');const copied=clone(root.cache),owned=copied.layers[0].keys[0],properties=()=>({frozen:Object.isFrozen(owned),extensible:Object.isExtensible(owned),writable:Object.getOwnPropertyDescriptor(owned,'0').writable,configurable:Object.getOwnPropertyDescriptor(owned,'0').configurable}),initial=properties(),alternative=a.decodeStep(m,token,copied);close(alternative.logits,state.logits,'copied cache');equal(properties(),initial,'caller-owned row descriptors');const saved=alternative.cache.layers[0].keys[0][0];owned[0]+=1;equal(alternative.cache.layers[0].keys[0][0],saved,'output independent of later mutable caller edit');}
  for(const change of [c=>c.fingerprint='foreign',c=>c.tokenizerFingerprint='foreign',c=>c.layers[3].keys[0].pop(),c=>c.position=512]){const bad=clone(root.cache);change(bad);await reject(()=>a.decodeStep(m,347,bad),'invalid trained cache');}
 }},
 {id:'trained-generation',input:'independent full-prefix seeded/greedy results and settings-before-zero',run:async(a,p,f)=>{
  const m=await load(a,f);for(const c of f.goldens.generation){const actual=required(a,'generate')(m,c.prompt,c.options);generationShape(actual,c.prompt);equal(actual,c.expected,'scalar generation');equal(a.generate(m,c.prompt,c.options),actual,'seeded repeat');}
  for(const c of f.goldens.storyBoundary??[]){const actual=a.generate(m,c.prompt,c.options),terminal=c.expected.generated.at(-1);must(actual&&actual.stop==='eos'&&sameIds(actual.generated,c.expected.generated),`Rule (TRAINED.md, 4. Generate with explicit limits: "After emission, ID 1 or 2 stops the story with eos"): prompt ending ${JSON.stringify(c.promptText.slice(-24))} (${c.prompt.length} tokens) with ${JSON.stringify(c.options)} samples ID ${terminal} as generated[${c.expected.generated.length-1}]. Expected generated ${JSON.stringify(c.expected.generated)} with stop "eos"; observed generated ${briefIds(actual?.generated)} with stop ${JSON.stringify(actual?.stop)}. Stop on both story delimiters, BOS 1 and EOS 2.`);equal(actual,c.expected,'story-boundary generation');}
  const prompt=a.encode(m,'The little fox');equal(a.generate(m,prompt,{maxNewTokens:0}),{tokens:prompt,generated:[],text:'',stop:'limit',trace:[]},'zero limit');await reject(()=>a.generate(m,prompt,{maxNewTokens:0,temperature:-1}),'invalid settings at zero limit');let draws=0;const logits=Array(512).fill(0);logits[500]=2;equal(required(a,'sample')(logits,{temperature:0},()=>{draws++;return 0;}),500,'512-token greedy');equal(draws,0,'greedy draw count');
 }},
 {id:'trained-stream-delivery',input:'consumer receipt before later decode; checker-owned violations survive catches',run:async(a,p,f)=>{
  required(p,'streamGenerate','trained-project.mjs');const m=await load(a,f),runtime=view(a,m),prompt=[1,347],ids=[7,13,17],calls=[],violations=[];let received=0,decodes=0,prefills=0;
  const logits=token=>Array.from({length:512},(_,i)=>i===token?10:0);
  const facade={...runtime,prefill:(model,input)=>{prefills++;if(prefills!==1){violations.push('extra prefill');throw new Error('extra prefill');}equal(input,prompt,'stream prompt');return {logits:logits(ids[0]),cache:componentCache(m,prompt.length)};},decodeStep:(model,token,cache)=>{if(received!==decodes+1){violations.push('decode before consumer receipt');throw new Error('decode before consumer receipt');}equal(token,ids[decodes],'decode consumed token');equal(cache.position,prompt.length+decodes,'decode cache position');decodes++;return {logits:logits(ids[decodes]),cache:componentCache(m,prompt.length+decodes)};},generate:()=>{violations.push('generate-and-replay');throw new Error('generate-and-replay');}};
  retainBoundaryFailures(facade,violations);observeRuntime(facade,name=>calls.push(name));const it=p.streamGenerate(facade,m,prompt,{maxNewTokens:3,temperature:0});must(it&&typeof it.next==='function','streamGenerate must return an async iterator');must(calls.length===0,'stream construction must perform no work');const observed=[];
  for(let i=0;i<4;i++){const next=await it.next();must(!violations.length,violations.join('; '));must(!next.done,'stream ended before all required events');const event=next.value;if(i<3){equal(event,{type:'token',index:i,position:prompt.length+i,token:ids[i]},'delivered token');received++;}else{equal(event,{type:'complete',result:{tokens:[...prompt,...ids],generated:ids,text:runtime.decode(ids),stop:'limit',trace:trace(prompt,ids)}},'complete event');}observed.push(clone(event));}
  must((await it.next()).done,'iterator must end after one completion');must(!violations.length,violations.join('; '));equal(prefills,1);equal(decodes,2);return {events:observed.length,calls};
 }},
 {id:'trained-stream-stops',input:'zero/full/no-work and both trained story terminators',run:async(a,p,f)=>{
  required(p,'streamGenerate','trained-project.mjs');const m=await load(a,f),runtime=view(a,m);
  for(const [prompt,options,stop] of [[[1],{maxNewTokens:0},'limit'],[Array(512).fill(4),{maxNewTokens:2},'context'],[Array(512).fill(4),{maxNewTokens:0},'limit']]){const violations=[],forbid=name=>()=>{violations.push(name);throw new Error(name);};const facade={...runtime,forward:forbid('forward'),prefill:forbid('prefill'),decodeStep:forbid('decode'),sample:forbid('sample'),rng:forbid('rng'),generate:forbid('generate')},it=p.streamGenerate(facade,m,prompt,options);equal((await it.next()).value,{type:'complete',result:{tokens:prompt,generated:[],text:'',stop,trace:[]}},'empty completion');must((await it.next()).done,'empty iterator must end');must(!violations.length,'forbidden work survived catch: '+violations.join(','));}
  for(const terminal of [1,2]){let decodes=0,draws=0;const facade={...runtime,prefill:()=>({logits:Array.from({length:512},(_,i)=>i===terminal?1:0),cache:componentCache(m,1)}),decodeStep:()=>{decodes++;throw new Error('decode after terminal');},rng:()=>()=>{draws++;return 0.5;}};const it=p.streamGenerate(facade,m,[1],{temperature:0,maxNewTokens:4});equal((await it.next()).value,{type:'token',index:0,position:1,token:terminal},'story boundary');equal((await it.next()).value,{type:'complete',result:{tokens:[1,terminal],generated:[terminal],text:'',stop:'eos',trace:[{position:1,token:terminal}]}},'terminal completion');must((await it.next()).done,'terminal stream must end');equal(decodes,0,'decode after terminal');equal(draws,0,'greedy random draws');}
 }},
 {id:'trained-stream-runtime-error',input:'actual model parity/interleaving and exact later error retaining prefix',run:async(a,p,f)=>{
  required(p,'streamGenerate','trained-project.mjs');const m=await load(a,f),runtime=view(a,m),prompt=a.encode(m,'The little fox'),options={seed:42,maxNewTokens:8,temperature:0.8,topK:8},left=p.streamGenerate(runtime,m,prompt,options),right=p.streamGenerate(runtime,m,prompt,options),events=[];
  for(let i=0;i<10;i++){const l=await left.next(),r=await right.next();equal(l,r,'independent interleaved stream');if(l.done)break;events.push(l.value);}const tokens=events.filter(x=>x.type==='token').map(x=>x.token),complete=events.filter(x=>x.type==='complete');must(complete.length===1,'exactly one real completion required');equal(complete[0].result,a.generate(m,prompt,options),'real streamed generation');equal(tokens,complete[0].result.generated,'once-only generated IDs');
  const marker=new Error('trained later-decode marker');let calls=0,failed=false;const runtimeCalls=[],violations=[];
  const faulty=observeRuntime({...runtime,sample:()=>7,decodeStep:()=>{calls++;failed=true;throw marker;}},name=>{runtimeCalls.push(name);if(failed){violations.push(name);throw new Error('runtime work after error: '+name);}}),it=p.streamGenerate(faulty,m,prompt,{maxNewTokens:3,temperature:0});
  must(runtimeCalls.length===0,'error-stream construction must perform no runtime work');const first=await it.next();must(first.value?.type==='token'&&calls===0,'first token must arrive before failing decode');let caught;try{await it.next();}catch(e){caught=e;}must(caught===marker,'pending pull must reject with the original error object');must(!violations.length,'runtime work after error: '+violations.join(','));
  const before=runtimeCalls.length;let laterResult,laterRejected=false;try{laterResult=await it.next();}catch{laterRejected=true;}if(!laterRejected)must(laterResult.done,'no normal completion after error');must(!violations.length,'runtime work after error: '+violations.join(','));equal(runtimeCalls.length,before,'no runtime calls or RNG draws after error');
 }},
 {id:'trained-cache-investigation',input:'dimension-valid content corruption plus valid cache false-positive control',run:async(a,p,f)=>{
  required(p,'runProject','trained-project.mjs');const m=await load(a,f),runtime=view(a,m),prompt=a.encode(m,'A blue bird sat.'),fresh=a.prefill(m,prompt).cache,changed=clone(fresh);changed.layers[2].values[1][3]+=0.4;const before=JSON.stringify(changed),spec={prompt,cache:changed,maxNewTokens:4,seed:42,topK:8},result=await p.runProject(runtime,m,spec);must(Array.isArray(result?.differences)&&result.differences.length===1,'report exactly the observed corrupted component');const difference=result.differences[0],expected=Math.abs(changed.layers[2].values[1][3]-fresh.layers[2].values[1][3]);must(difference?.layer===2&&difference.component==='values'&&finite(difference.maxError)&&Math.abs(difference.maxError-expected)<=1e-10,'numeric cache finding must identify actual layer/component/error');equal(result.generation,a.generate(m,prompt,{maxNewTokens:4,seed:42,topK:8}),'investigated generation');equal(JSON.stringify(changed),before,'caller cache preservation');equal((await p.runProject(runtime,m,{...spec,cache:fresh})).differences,[],'valid-cache findings');
 }},
 {id:'trained-beam-extension',input:'trained width-one parity/cumulative rescoring/cache state and13call bound',run:async(a,p,f)=>{
  required(p,'beamDecode','trained-project.mjs');const m=await load(a,f),runtime=view(a,m),prompt=a.encode(m,'The little fox'),options={beamWidth:2,maxNewTokens:3},original=JSON.stringify(prompt);let prefills=0,decodes=0;const snapshots=[];
  const counted={...runtime,prefill:(model,input)=>{prefills++;const result=runtime.prefill(model,input);snapshots.push({cache:result.cache,before:JSON.stringify(result.cache)});return result;},decodeStep:(model,token,cache)=>{decodes++;const before=JSON.stringify(cache),result=runtime.decodeStep(model,token,cache);equal(JSON.stringify(cache),before,'beam parent cache preservation');snapshots.push({cache:result.cache,before:JSON.stringify(result.cache)});return result;}};
  const result=await p.beamDecode(counted,m,prompt,options);must(Array.isArray(result?.candidates)&&result.candidates.length===2,'return two ranked trained candidates');equal(prefills,1,'beam prefill count');must(decodes<=4,'width2/budget3 permits at most4cached steps');equal(JSON.stringify(prompt),original,'beam prompt');for(const snapshot of snapshots)equal(JSON.stringify(snapshot.cache),snapshot.before,'retained branch');
  for(const candidate of result.candidates){must(Array.isArray(candidate.generated)&&candidate.generated.length>0&&candidate.generated.length<=3&&finite(candidate.logProbability),'finite bounded beam candidate required');let score=0;const prefix=[...prompt];for(const token of candidate.generated){must(Number.isInteger(token)&&token>=0&&token<512,'valid beam token');const logits=a.prefill(m,prefix).logits,maximum=Math.max(...logits),sum=logits.reduce((s,x)=>s+Math.exp(x-maximum),0);score+=(logits[token]-maximum)-Math.log(sum);prefix.push(token);}must(Math.abs(score-candidate.logProbability)<=1e-9,'beam cumulative/full-prefix score differs');equal(candidate.text,a.decode(m,candidate.generated),'beam text');const last=candidate.generated.at(-1),stop=[1,2].includes(last)?'eos':prefix.length===512?'context':'limit';equal(candidate.stop,stop,'beam stop');}
  must(result.candidates[0].logProbability>=result.candidates[1].logProbability,'ranked scores required');equal((await p.beamDecode(runtime,m,prompt,{beamWidth:1,maxNewTokens:3})).candidates[0].generated,a.generate(m,prompt,{temperature:0,maxNewTokens:3}).generated,'width1 greedy');await reject(()=>p.beamDecode(runtime,m,prompt,{beamWidth:0,maxNewTokens:3}),'invalid beam width');
 }},
 {id:'trained-beam-limits',input:'both story delimiters, terminal carry, trained context and exact numeric ties',run:async(a,p,f)=>{
  required(p,'beamDecode','trained-project.mjs');const m=await load(a,f),runtime=view(a,m);
  const logits=entries=>{const row=Array(512).fill(-50);for(const [token,score]of entries)row[token]=score;return row;};
  const lp=(row,token)=>{const maximum=Math.max(...row);return(row[token]-maximum)-Math.log(row.reduce((sum,x)=>sum+Math.exp(x-maximum),0));};
  const scenarios=[
   ...[1,2].map(terminal=>({name:'terminal '+terminal,prompt:[1,347],budget:3,root:logits([[terminal,6],[350,5]]),next:logits([[349,10]]),paths:[[terminal],[350,349,349]],stops:['eos','limit'],decodeCount:2})),
   {name:'context511',prompt:Array(511).fill(4),budget:4,root:logits([[400,2],[401,2]]),paths:[[400],[401]],stops:['context','context'],decodeCount:0},
   {name:'exact tie',prompt:[1,347],budget:2,root:logits([[400,0],[401,0]]),next:logits([[500,2],[501,2]]),paths:[[400,500],[400,501]],stops:['limit','limit'],decodeCount:2}
  ];
  const observations=[];
  for(const scenario of scenarios){
   let prefills=0;const decodes=[],violations=[],snapshots=[];
   const forbid=message=>{violations.push(message);throw new Error(message);};
   const state=prefix=>{
    const value=clone(componentCache(m,prefix.length));
    prefix.forEach((token,index)=>{value.layers[0].keys[index][0]=token;});
    const freeze=x=>{if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;};
    const cache=freeze(value);snapshots.push({cache,before:JSON.stringify(cache)});
    return {cache,logits:[...(prefix.length===scenario.prompt.length?scenario.root:scenario.next)]};
   };
   const facade={...runtime,
    prefill:(model,prompt)=>{prefills++;if(prefills!==1)forbid('extra beam prefill');equal(prompt,scenario.prompt,'beam component prompt');return state(prompt);},
    decodeStep:(model,token,cache)=>{
     if(m.config.stopIds.includes(token))forbid('decode after story boundary');
     if(cache.position>=512||cache.position>=scenario.prompt.length+scenario.budget-1)forbid('decode beyond beam context/budget');
     const prefix=cache.layers[0].keys.map(row=>row[0]);
     equal(prefix.slice(0,scenario.prompt.length),scenario.prompt,'beam branch prompt');
     if(scenario.name==='exact tie'&&prefix.length!==scenario.prompt.length)forbid('advanced sibling cache');
     if(scenario.name.startsWith('terminal ')&&prefix.slice(scenario.prompt.length).some((id,i)=>id!==(i===0?350:349)))forbid('foreign terminal-case branch');
     decodes.push({prefix,token});return state([...prefix,token]);
    },
    generate:()=>forbid('beam cannot replay generate'),sample:()=>forbid('beam cannot sample'),rng:()=>forbid('beam cannot draw RNG')
   };
   retainBoundaryFailures(facade,violations);const result=await p.beamDecode(facade,m,[...scenario.prompt],{beamWidth:2,maxNewTokens:scenario.budget});
   must(!violations.length,scenario.name+': '+violations.join('; '));
   equal(prefills,1,scenario.name+' prefill count');equal(decodes.length,scenario.decodeCount,scenario.name+' decode count');
   must(Array.isArray(result?.candidates)&&result.candidates.length===2,scenario.name+': two candidates required');
   for(let i=0;i<2;i++){
    const candidate=result.candidates[i],path=scenario.paths[i];equal(candidate.generated,path,scenario.name+' ranked IDs');equal(candidate.stop,scenario.stops[i],scenario.name+' stop');equal(candidate.text,runtime.decode(path),scenario.name+' text');
    const score=path.reduce((sum,token,index)=>sum+lp(index===0?scenario.root:scenario.next,token),0);
    must(finite(candidate.logProbability)&&Math.abs(candidate.logProbability-score)<=1e-9,scenario.name+': cumulative score differs');
   }
   for(const snapshot of snapshots)equal(JSON.stringify(snapshot.cache),snapshot.before,scenario.name+' retained cache');
   observations.push({scenario:scenario.name,prefills,decodes:decodes.length});
  }
  for(const options of [{beamWidth:5,maxNewTokens:1},{beamWidth:1,maxNewTokens:0},{beamWidth:1,maxNewTokens:5}])await reject(()=>p.beamDecode(runtime,m,[1,347],options),'invalid trained beam bounds');
  await reject(()=>p.beamDecode(runtime,m,Array(512).fill(4),{beamWidth:1,maxNewTokens:1}),'full-context beam prompt');
  return {observations};
 }}
];
const TRAINED_SECTIONS={
 'trained-loader-tokenizer':'1. Check the bytes before using them; 2. Tokenize the trained vocabulary',
 'trained-forward-goldens':'3. Adapt the block and its state','trained-cache-parity':'3. Adapt the block and its state',
 'trained-generation':'4. Generate with explicit limits',
 'trained-stream-delivery':'5. Keep the project yours','trained-stream-stops':'5. Keep the project yours','trained-stream-runtime-error':'5. Keep the project yours',
 'trained-cache-investigation':'6. Diagnose and transfer','trained-beam-extension':'5. Keep the project yours','trained-beam-limits':'5. Keep the project yours',
};
export async function checkTrained(api,project,fixtures){
 const results=[];
 for(const c of trainedCases){try{const detail=await c.run(api,project,fixtures);results.push({id:c.id,pass:true,...(detail?{detail}:{})});}catch(e){const section=TRAINED_SECTIONS[c.id]??'';results.push({id:c.id,pass:false,input:c.input,section,message:String(e?.message??e),next:`Reread TRAINED.md, "${section}". Keep this attempt, change one cause in ${c.id.includes('stream')||c.id.includes('investigation')||c.id.includes('beam')?'trained-project.mjs (or the trained.mjs function it calls)':'trained.mjs'} and rerun node lab.mjs check trained.`});}}
 return {pass:results.every(x=>x.pass),passed:results.filter(x=>x.pass).length,total:results.length,results};
}
