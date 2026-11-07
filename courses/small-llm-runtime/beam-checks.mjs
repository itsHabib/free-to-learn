import {TAPES,FIXTURES} from './beam-fixture-data.mjs';
const insist=(ok,message)=>{if(!ok)throw new Error('beam: '+message);};
const same=(a,b)=>{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
  return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&same(a[k],b[k]));
};
const close=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=1e-10+1e-9*Math.max(Math.abs(a),Math.abs(b));
const label=(p,g)=>`C([${p}];[${g}])`;
const inputFor=id=>{const t=TAPES.find(x=>x.id===id);return t.base?{...TAPES.find(x=>x.id===t.base),...t}:t;};
const promptFor=t=>t.prompt||Array(t.promptRepeat.count).fill(t.promptRepeat.token);
function logitsFor(t,prefix){
  if(t.literalLogits)return Array.from({length:32},(_,i)=>t.literalLogits.scores[i]??t.literalLogits.default);
  const state=prefix.length?(t.allPrefixes||t.states?.[prefix.join(',')]||{defaultWeight:1}):t.root;
  return Array.from({length:32},(_,i)=>Math.log(state.weights?.[i]??state.defaultWeight)+(t.addToEveryLogit||0));
}
function compare(a,b){
  if(a.logProbability!==b.logProbability)return a.logProbability>b.logProbability?-1:1;
  const n=Math.min(a.generated.length,b.generated.length);
  for(let i=0;i<n;i++)if(a.generated[i]!==b.generated[i])return a.generated[i]-b.generated[i];
  return a.generated.length-b.generated.length;
}
function candidates(result,width,vocabSize){
  insist(result&&Array.isArray(result.candidates)&&result.candidates.length>0&&result.candidates.length<=width,'return a nonempty candidates array within beamWidth');
  for(const c of Array.from(result.candidates)){
    insist(c&&Array.isArray(c.generated)&&c.generated.length>0&&Array.from(c.generated).every(x=>Number.isInteger(x)&&x>=0&&x<vocabSize),'candidate must have dense valid generated IDs');
    insist(typeof c.logProbability==='number'&&Number.isFinite(c.logProbability)&&['eos','context','limit'].includes(c.stop)&&typeof c.text==='string','finite score, decoded text and stop are required');
  }
  insist(new Set(result.candidates.map(c=>JSON.stringify(c.generated))).size===result.candidates.length,'duplicate candidate');
  for(let i=1;i<result.candidates.length;i++)insist(compare(result.candidates[i-1],result.candidates[i])<=0,'rank by exact score then numeric IDs');
  return result.candidates;
}
async function fixtureRun(api,project,c,control={}){
  const tape=inputFor(c.id),prompt=Object.freeze([...promptFor(tape)]),trace=[],violations=[],reads=[],issued=new Map();
  const config=Object.freeze(Object.defineProperties({}, {
    vocabSize:{enumerable:true,get(){reads.push('vocabSize');return 32;}},
    maxContext:{enumerable:true,get(){reads.push('maxContext');return 32;}}
  }));
  const model=Object.freeze({config}),sentinel=new Error('original beam runtime failure');let runtimeFailed=false;
  const require=(ok,message)=>{if(!ok){violations.push(message);insist(false,message);}};
  const issue=prefix=>{
    const cache=Object.freeze({label:label(prompt,prefix),position:prompt.length+prefix.length});
    issued.set(cache.label,{cache,prefix:[...prefix]});return cache;
  };
  const guarded=fn=>(...args)=>{try{return fn(...args);}catch(error){if(error!==sentinel)violations.push(String(error.message));throw error;}};
  const change=(kind,prefix,logits)=>control.changeLogits?control.changeLogits(kind,prefix,logits):logits;
  const methods={
    prefill:guarded((m,p)=>{
      require(!runtimeFailed,'work after original runtime failure');require(m===model&&same(p,prompt),'prefill inputs');
      require(!trace.length,'one initial prefill');const cache=issue([]);trace.push({kind:'prefill',label:cache.label,position:cache.position});
      if(control.throwAt==='prefill'){runtimeFailed=true;throw sentinel;}
      return {logits:change('prefill',[],logitsFor(tape,[])),cache};
    }),
    decodeStep:guarded((m,token,parent)=>{
      require(!runtimeFailed,'work after original runtime failure');require(m===model&&Number.isInteger(token)&&token>=0&&token<32,'decode inputs');
      const previous=issued.get(parent?.label);require(previous&&parent.position===previous.cache.position,'issued parent-cache value/position');
      const child=[...previous.prefix,token],cache=issue(child),row=[child.length,child,token,parent.label,parent.position,cache.label,cache.position];
      trace.push({kind:'decodeStep',row});
      if(control.throwAt==='decode'&&child.join(',')==='7'){runtimeFailed=true;throw sentinel;}
      return {logits:change('decodeStep',child,logitsFor(tape,child)),cache};
    }),
    decode:guarded(ids=>api.decode(ids)),
  };
  const runtime=new Proxy(Object.freeze(methods),{get(target,key){require(Object.hasOwn(target,key),'only prefill/decodeStep/decode are allowed; attempted '+String(key));return target[key];}});
  let value,error;
  try{value=await project.beamDecode(runtime,model,control.prompt??prompt,control.options??{beamWidth:c.beamWidth,maxNewTokens:c.maxNewTokens});}catch(e){error=e;}
  insist(!violations.length,'retained checker violation: '+violations[0]);
  for(const {cache,prefix}of issued.values())insist(same(cache,{label:label(prompt,prefix),position:prompt.length+prefix.length}),'caller/sibling cache changed');
  if(control.reject){
    insist(error&&value===undefined,'invalid input or runtime output must reject, not return candidates');
    if(control.throwAt)insist(error===sentinel,'propagate original runtime error');
    return {id:control.id,rejected:true,message:String(error.message),trace,inferenceCalls:trace.length,
      validationTiming:'Recorded only. Zero prefill on invalid options/prompt is not an added acceptance criterion.'};
  }
  if(error)throw error;
  const actual=candidates(value,c.beamWidth,32);insist(actual.length===c.final.length,'fixture candidate count');
  const comparisons=actual.map((got,i)=>{
    const expected=c.final[i];insist(same(got.generated,expected.generated)&&got.stop===expected.stop,'fixture IDs/ranking/stop');
    insist(got.text===api.decode(expected.generated),'decode generated IDs without prompt');
    insist(close(got.logProbability,expected.logProbability),'full-vocabulary cumulative log probability');
    return {generated:got.generated,actual:got.logProbability,expected:expected.logProbability,error:Math.abs(got.logProbability-expected.logProbability),limit:1e-10+1e-9*Math.max(Math.abs(got.logProbability),Math.abs(expected.logProbability))};
  });
  const observed=trace.filter(x=>x.kind==='decodeStep').map(x=>JSON.stringify(x.row)).sort(),expected=c.ledger.map(x=>JSON.stringify(x)).sort();
  insist(trace[0]?.kind==='prefill'&&trace.filter(x=>x.kind==='prefill').length===1&&same(observed,expected),'parent/child/position call ledger');
  insist(trace.length<=1+c.beamWidth*(c.maxNewTokens-1),'inference operation bound');
  insist(reads.includes('vocabSize')&&reads.includes('maxContext'),'read validated model metadata; source must also use it');
  return {id:c.id,run:c.run,result:value,comparisons,trace,metadataReads:reads};
}
export async function checkBeamFixtures(api,project){
  insist(typeof project.beamDecode==='function','create project.mjs exporting beamDecode(runtime,model,prompt,{beamWidth,maxNewTokens}); lesson08 defines the bounded extension');
  const records=[];for(const c of FIXTURES)records.push(await fixtureRun(api,project,c));
  const c=FIXTURES.find(x=>x.id==='sequence-score-beats-greedy'&&x.run==='w2');
  const invalid=[];
  for(const [field,bad]of [['beamWidth',[0,5,1.5,null,'2']],['maxNewTokens',[0,5,1.5,null,'2']]])for(const value of bad)invalid.push({id:field+'='+JSON.stringify(value),options:{beamWidth:2,maxNewTokens:2,[field]:value}});
  for(const p of [[],Array(32).fill(4),[32],[-1],[1.5],['4'],[null],Array(1)])invalid.push({id:'invalid-prompt-'+invalid.length,prompt:p});
  const badVectors=[Array(31).fill(0),Array(33).fill(0),Array(32),Array(32).fill(NaN),Array(32).fill(Infinity),Array(32).fill(-Infinity),Array(32).fill(null),Array(32).fill('0')];
  for(const [i,vector]of badVectors.entries()){
    invalid.push({id:'prefill-logits-'+i,changeLogits:(kind,prefix,original)=>kind==='prefill'?vector:original});
    invalid.push({id:'decode-logits-'+i,changeLogits:(kind,prefix,original)=>prefix.join(',')==='7'?vector:original});
  }
  invalid.push({id:'nonfinite-computed-score',changeLogits:()=>Array.from({length:32},(_,i)=>i===6?1e308:-1e308)});
  invalid.push({id:'prefill-error',throwAt:'prefill'},{id:'decode-error',throwAt:'decode'});
  for(const control of invalid)records.push(await fixtureRun(api,project,c,{...control,reject:true}));
  return records;
}
export async function checkBeamRuntime(api,project,model){
  insist(typeof project.beamDecode==='function','create the capstone beamDecode export');
  const records=[];
  for(const [prompt,beamWidth,maxNewTokens]of [[[4],1,2],[[4,5],1,4],[Array(31).fill(4),1,4],[[4,5],2,2],[[6,7,3],4,4]]){
    const callerPrompt=[...prompt],snapshots=[],calls=[],violations=[],before=JSON.stringify({model,prompt:callerPrompt});
    const require=(ok,msg)=>{if(!ok){violations.push(msg);insist(false,msg);}};
    const methods={
      prefill(...args){calls.push({kind:'prefill'});const value=api.prefill(...args);snapshots.push([value.cache,JSON.stringify(value.cache)]);return value;},
      decodeStep(...args){calls.push({kind:'decodeStep',token:args[1],position:args[2]?.position});const value=api.decodeStep(...args);snapshots.push([value.cache,JSON.stringify(value.cache)]);return value;},
      decode:api.decode,
    };
    const runtime=new Proxy(methods,{get(target,key){require(Object.hasOwn(target,key),'only prefill/decodeStep/decode are allowed');return target[key];}});
    const value=await project.beamDecode(runtime,model,callerPrompt,{beamWidth,maxNewTokens});
    insist(!violations.length,'retained checker violation: '+violations[0]);
    const actual=candidates(value,beamWidth,model.config.vocabSize),comparisons=[];
    insist(calls.filter(x=>x.kind==='prefill').length===1&&calls.length<=1+beamWidth*(maxNewTokens-1),'actual inference count/bound');
    for(const c of actual){
      insist(c.generated.length<=maxNewTokens&&prompt.length+c.generated.length<=model.config.maxContext,'actual candidate exceeds limits');
      const eos=c.generated.indexOf(0);insist(eos<0||eos===c.generated.length-1,'generation after EOS');
      const stop=eos>=0?'eos':prompt.length+c.generated.length===model.config.maxContext?'context':'limit';
      insist(c.stop===stop&&(stop!=='limit'||c.generated.length===maxNewTokens),'actual stop/budget');
      insist(c.text===api.decode(c.generated),'actual decoded text');
      let state=api.prefill(model,prompt),score=0;
      for(let i=0;i<c.generated.length;i++){
        const z=state.logits;insist(Array.isArray(z)&&z.length===model.config.vocabSize&&Array.from(z).every(Number.isFinite),'finite runtime logits');
        // Independent probability-ratio score for these ordinary fixture logits.
        const max=Math.max(...z),denominator=z.reduce((s,x)=>s+Math.exp(x-max),0);
        score+=Math.log(Math.exp(z[c.generated[i]]-max)/denominator);
        if(i+1<c.generated.length)state=api.decodeStep(model,c.generated[i],state.cache);
      }
      insist(close(c.logProbability,score),'actual score differs from independent fresh-prefix replay');
      comparisons.push({generated:c.generated,actual:c.logProbability,replayed:score,error:Math.abs(c.logProbability-score)});
    }
    if(beamWidth===1){
      const greedy=api.generate(model,prompt,{maxNewTokens,temperature:0,topK:model.config.vocabSize,seed:1});
      insist(same(actual[0].generated,greedy.generated)&&actual[0].text===greedy.text&&actual[0].stop===greedy.stop,'width-one greedy parity');
    }
    for(const [cache,encoded]of snapshots)insist(JSON.stringify(cache)===encoded,'actual caller/sibling cache changed');
    insist(JSON.stringify({model,prompt:callerPrompt})===before,'caller model/prompt changed');
    records.push({prompt,beamWidth,maxNewTokens,result:value,calls,comparisons,widthOneGreedyCompared:beamWidth===1});
  }
  return records;
}
