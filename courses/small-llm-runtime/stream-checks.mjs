import {CONFIG,VOCAB} from './spec.mjs';

const same=(a,b)=>{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a))return a.length===b.length&&Array.from(a).every((v,i)=>same(v,b[i]));
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return same(ak,bk)&&ak.every(k=>same(a[k],b[k]));
};
const insist=(condition,message)=>{if(!condition)throw new Error('stream: '+message);};
const decode=ids=>ids.map(id=>id===0?'':id===1?'\ufffd':VOCAB[id]).join('');
const options=(maxNewTokens,temperature=0,topK=1,seed=1)=>({maxNewTokens,seed,temperature,topK});
const result=(prompt,generated,stop)=>({tokens:[...prompt,...generated],generated,text:decode(generated),stop,trace:generated.map((token,index)=>({position:prompt.length+index,token}))});
const scenarios=[
  {id:'greedy-eos',prompt:[4,5],options:options(3),tapes:[{6:1},{0:1}],ids:[6,0],stop:'eos'},
  {id:'two-token-limit',prompt:[4],options:options(2),tapes:[{6:1},{7:1}],ids:[6,7],stop:'limit'},
  {id:'seeded-two-way-tie',prompt:[4,5],options:options(3,1,2),tapes:[{6:0,7:0},{6:0,7:0},{6:0,7:0}],ids:[6,6,7],stop:'limit'},
  {id:'zero-new-token',prompt:[4,5],options:options(0,1,2),tapes:[],ids:[],stop:'limit'},
  {id:'full-context',prompt:Array(32).fill(4),options:options(1,1,2),tapes:[],ids:[],stop:'context'},
  {id:'last-context-slot',prompt:Array(31).fill(4),options:options(5),tapes:[{6:1}],ids:[6],stop:'context'},
  {id:'EOS-at-token-limit',prompt:[4,5],options:options(1),tapes:[{0:1}],ids:[0],stop:'eos'},
  {id:'EOS-at-context-and-token-limit',prompt:Array(31).fill(4),options:options(1),tapes:[{0:1}],ids:[0],stop:'eos'},
  {id:'late-decode-error',prompt:[4,5],options:options(3),tapes:[{6:1}],ids:[6],error:true},
  {id:'invalid-empty-prompt',prompt:[],options:options(1),tapes:[],ids:[],invalid:true},
  {id:'invalid-limit',prompt:[4],options:options(-1),tapes:[],ids:[],invalid:true},
  {id:'invalid-seed',prompt:[4],options:{...options(1),seed:4294967296},tapes:[],ids:[],invalid:true},
  {id:'invalid-temperature',prompt:[4],options:{...options(1),temperature:-1},tapes:[],ids:[],invalid:true},
  {id:'invalid-topK',prompt:[4],options:{...options(1),topK:33},tapes:[],ids:[],invalid:true},
  {id:'invalid-token',prompt:[32],options:options(1),tapes:[],ids:[],invalid:true},
];

function tapeRun(api,project,model,s) {
  insist(typeof project.streamGenerate==='function','export streamGenerate(runtime,model,prompt,options) from your project.mjs; lesson08 defines the iterator');
  const calls=[],events=[],counter={prefill:0,decode:0,sample:0,draw:0,rng:0};
  const violations=[];
  const guard=(condition,message)=>{if(!condition){violations.push(message);insist(false,message);}};
  const noViolations=()=>insist(!violations.length,'retained checker violation: '+violations[0]);
  let delivered=0,terminal=false;
  const sentinel=Object.assign(new Error('original later decode failure'),{code:'TAPE_E1'});
  const logits=index=>{const scores=Array(32).fill(-1000);for(const [id,score]of Object.entries(s.tapes[index]??{}))scores[Number(id)]=score;return scores;};
  const note=name=>{calls.push(name);guard(!terminal,'runtime work after a terminal token');};
  const runtime={
    prefill(m,p){note('prefill');counter.prefill++;guard(counter.prefill===1&&same(p,s.prompt)&&m===model,'prefill input/count');return {logits:logits(0),cache:{position:p.length,tape:0}};},
    decodeStep(m,token,cache){note('decodeStep');guard(counter.decode<delivered,'decode before consumer received its preceding token');counter.decode++;guard(m===model&&token===s.ids[counter.decode-1]&&cache.tape===counter.decode-1&&cache.position===s.prompt.length+counter.decode-1,'decode token/cache alignment');if(s.error)throw sentinel;return {logits:logits(counter.decode),cache:{position:cache.position+1,tape:counter.decode}};},
    sample(scores,controls,random){note('sample');guard(counter.sample<=delivered,'sample prefetched before consumer receipt');guard(same(scores,logits(counter.sample))&&same(controls,{temperature:s.options.temperature,topK:s.options.topK}),'sample input/controls');counter.sample++;return api.sample(scores,controls,random);},
    rng(seed){note('rng');counter.rng++;guard(counter.rng===1&&seed===s.options.seed,'per-stream RNG creation');const random=api.rng(seed);return ()=>{note('draw');counter.draw++;return random();};},
    decode:api.decode,
    generate(){guard(false,'complete-generate shortcut cannot prove incremental delivery');},
  };
  const prompt=[...s.prompt],before=JSON.stringify(prompt),modelBefore=JSON.stringify(model);
  const iterator=project.streamGenerate(runtime,model,prompt,{...s.options});
  insist(iterator&&typeof iterator.next==='function'&&typeof iterator[Symbol.asyncIterator]==='function','return an async iterator');
  insist(!calls.length,'construction must be lazy');
  const next=async()=>{calls.push('pull');try{const value=await iterator.next();calls.push(value.done?'done':'recv');return value;}finally{noViolations();}};
  const unchanged=()=>{noViolations();insist(JSON.stringify(prompt)===before,'caller prompt changed');insist(JSON.stringify(model)===modelBefore,'caller model changed');};
  const endAfterError=async()=>{const count=calls.length;let end,rejected=false;try{end=await iterator.next();}catch{rejected=true;}insist(rejected||end?.done,'event after runtime or validation error');insist(calls.length===count,'post-error runtime work');unchanged();};
  const finish=async()=>{
    if(s.invalid){let error;try{await next();}catch(e){error=e;}insist(error,'invalid prompt/options accepted');insist(counter.prefill+counter.decode+counter.sample+counter.rng+counter.draw===0,'work before invalid-input rejection');await endAfterError();return {id:s.id,calls,counter,events,rejected:true};}
    for(let index=0;index<s.ids.length;index++) {
      const step=await next(),expected={type:'token',index,position:s.prompt.length+index,token:s.ids[index]};
      insist(!step.done&&same(step.value,expected),'token order/index/position for '+s.id);
      events.push(step.value);delivered++;
      terminal=!s.error&&(s.ids[index]===0||s.prompt.length+delivered===CONFIG.maxContext||delivered===s.options.maxNewTokens);
    }
    if(s.error){let error;try{await next();}catch(e){error=e;}insist(error===sentinel,'later failure must reject with original error and retain its delivered prefix');await endAfterError();return {id:s.id,calls,counter,events,rejected:true};}
    const completed=await next(),expected=result(s.prompt,s.ids,s.stop);
    insist(!completed.done&&same(completed.value,{type:'complete',result:expected}),'complete reconstruction/stop/text for '+s.id);
    const count=JSON.stringify(counter);
    for(let i=0;i<2;i++)insist((await next()).done,'event after completion');
    insist(JSON.stringify(counter)===count,'work after completion');
    insist(counter.prefill===(s.ids.length?1:0)&&counter.decode===Math.max(0,s.ids.length-1)&&counter.sample===s.ids.length,'prefill/decode/sample counts');
    insist(counter.draw===(s.options.temperature>0?s.ids.length:0),'RNG draw count');
    insist(s.ids.length?counter.rng<=1:counter.rng===0,'RNG work for empty generation');
    unchanged();
    return {id:s.id,calls,counter,events,result:completed.value.result};
  };
  return {iterator,finish};
}

export async function checkStreamDelivery(api,project,model) {
  const records=[];
  for(const s of scenarios)records.push(await tapeRun(api,project,model,s).finish());
  const seeded=scenarios.find(s=>s.id==='seeded-two-way-tie');
  records.push(await tapeRun(api,project,model,{...seeded,id:'seeded-repeat'}).finish());
  records.push(...await Promise.all(['A','B'].map(id=>tapeRun(api,project,model,{...seeded,id:'seeded-interleave-'+id}).finish())));
  return records;
}

export async function checkStreamRuntime(api,project,model) {
  insist(typeof project.streamGenerate==='function','create the capstone streamGenerate export');
  const records=[];
  for(const [prompt,opts]of [[[4,5],options(3,1,2)],[[4],options(2)],[[4,5],options(0,1,2)],[Array(32).fill(4),options(1)],[Array(31).fill(4),options(4)],[Array(32).fill(4),options(0)]]) {
    let delivered=0,prefills=0,decodes=0,samples=0;
    const violations=[];
    const guard=(condition,message)=>{if(!condition){violations.push(message);insist(false,message);}};
    const noViolations=()=>insist(!violations.length,'retained checker violation: '+violations[0]);
    const runtime={...api,prefill(...args){prefills++;return api.prefill(...args);},decodeStep(...args){guard(decodes<delivered,'actual runtime decode before first consumer receipt');decodes++;return api.decodeStep(...args);},sample(...args){guard(samples<=delivered,'actual runtime sample prefetch');samples++;return api.sample(...args);},generate(){guard(false,'buffered generate shortcut');}};
    const events=[];let completed;
    const iterator=project.streamGenerate(runtime,model,[...prompt],opts);
    const maxTokens=Math.min(opts.maxNewTokens,model.config.maxContext-prompt.length);
    for(let pull=0;pull<maxTokens+2;pull++) {
      const step=await iterator.next();noViolations();if(step.done)break;
      const event=step.value;
      if(event.type==='token'){insist(!completed&&delivered<maxTokens&&event.index===delivered&&event.position===prompt.length+delivered,'actual token sequence');delivered++;events.push(event);continue;}
      insist(event.type==='complete'&&!completed,'exactly one actual complete event');completed=event.result;
    }
    insist((await iterator.next()).done&&(await iterator.next()).done,'actual iterator must finish');
    noViolations();
    insist(completed&&same(completed,api.generate(model,prompt,opts)),'actual stream/generate result parity');
    insist(same(events.map(e=>e.token),completed.generated),'actual events/final IDs differ');
    insist(prefills===(delivered?1:0)&&decodes===Math.max(0,delivered-1)&&samples===delivered,'actual runtime call counts');
    records.push({prompt,options:opts,events,result:completed,calls:{prefills,decodes,samples}});
  }
  return records;
}
