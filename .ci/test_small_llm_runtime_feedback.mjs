// Small LLM runtime: feedback and grading regressions that need no learner solution.
// The runtimes below are test doubles: they replay public goldens or produce fixed
// logits, so they exercise the checks' rules and messages without implementing a model.
// Run: node --test .ci/test_small_llm_runtime_feedback.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const course=fileURLToPath(new URL('../courses/small-llm-runtime/',import.meta.url));
const {cases,close,firstDifference,formatResult}=await import(join(course,'checks.mjs'));
const {trainedCases}=await import(join(course,'trained-checks.mjs'));
const {parseAnswer,describeAnswer,practice}=await import(join(course,'practice.mjs'));
const {VOCAB}=await import(join(course,'spec.mjs'));
const manifest=JSON.parse(readFileSync(join(course,'fixtures/manifest.json'),'utf8'));
const fixture={text:readFileSync(join(course,'fixtures/tiny-original.json'),'utf8'),digest:manifest.sha256,golden:JSON.parse(readFileSync(join(course,'fixtures/golden.json'),'utf8'))};
const goldens=JSON.parse(readFileSync(join(course,'trained-goldens.json'),'utf8'));
const run=async(id,api,project={},data=fixture)=>{const c=[...cases,...trainedCases].find(x=>x.id===id);try{await c.run(api,project,data);return null;}catch(e){return String(e?.message??e);}};

test('boolean practice answers accept plain yes/no/true/false and refuse other text without grading',()=>{
  for(const [text,value] of [['no',false],[' NO ',false],['False',false],['yes',true],['True',true]])assert.deepEqual(parseAnswer(text,false),{ok:true,value});
  for(const text of ['','maybe','0','"no"x','n o'])assert.equal(parseAnswer(text,true).ok,false);
  assert.match(parseAnswer('maybe',false).hint,/Answer yes or no\. Nothing was recorded/);
  assert.equal(describeAnswer(false),'no');
});

test('number, list and word practice answers parse in plain form',()=>{
  assert.deepEqual(parseAnswer(' 3 ',3),{ok:true,value:3});
  assert.deepEqual(parseAnswer('[5,3,4]',[5,3,4]),{ok:true,value:[5,3,4]});
  assert.deepEqual(parseAnswer('5, 3 4',[5,3,4]),{ok:true,value:[5,3,4]});
  assert.deepEqual(parseAnswer('"Reject"','reject'),{ok:true,value:'reject'});
  assert.equal(parseAnswer('three',3).ok,false);
  assert.equal(parseAnswer('5,x',[5]).ok,false);
  for(const variants of Object.values(practice))for(const q of variants){const typed=typeof q.answer==='boolean'?(q.answer?'yes':'no'):Array.isArray(q.answer)?q.answer.join(', '):String(q.answer);assert.deepEqual(parseAnswer(typed,q.answer),{ok:true,value:q.answer},q.prompt);}
});

test('numeric mismatches name the first differing index instead of dumping vectors',()=>{
  const expected=fixture.golden.logits,observed=structuredClone(expected);observed[2][7]+=1;
  let message='';try{close(observed,expected,1e-10,'logits');}catch(e){message=e.message;}
  assert.match(message,/^logits\[2\]\[7\]: expected -?[\d.e-]+ \(within 1e-10\); observed/);
  assert.ok(message.length<220,message);
  assert.deepEqual(firstDifference([1,2,3],[1,2,4]),{path:'[2]',expected:'4',observed:'3'});
});

test('formatted results are short and point to a lesson section',()=>{
  const text=formatResult({kind:'check',report:{results:[{id:'cache-incremental-parity',lesson:'05',pass:false,input:'x',requirement:'R',section:'Worked parity trace',message:'m'.repeat(5000),next:'Reread lesson 05, "Worked parity trace".'},{id:'cache-prefill',lesson:'05',pass:true}]}},{lesson:'05'});
  assert.match(text,/^Module 05: 1 of 2 checks passed\./);
  assert.match(text,/Next: Reread lesson 05, "Worked parity trace"\./);
  assert.ok(text.length<900,String(text.length));
});

// Pocket test double: fixed logits (ID 5 wins) unless the output head is all zero (EOS wins).
function pocketDouble({extraDecodeAtLimit=false,contextBeforeEos=false}={}){
  const logitsFor=model=>{const zero=model.weights.lmHead.data.every(x=>x===0);return Array.from({length:32},(_,i)=>zero?0:i===5?1:0);};
  const api={
    async sha256(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');},
    async loadModel(text,digest){if(await api.sha256(text)!==digest)throw new Error('digest');const data=JSON.parse(text);return Object.freeze({format:data.format,config:data.config,vocab:data.vocab,weights:data.weights,fingerprint:digest});},
    prefill(model,tokens){return {logits:logitsFor(model),cache:{position:tokens.length}};},
    decodeStep(model,token,cache){if(cache.position>=32)throw new Error('full');return {logits:logitsFor(model),cache:{position:cache.position+1}};},
    generate(model,prompt,{maxNewTokens=8}={}){
      const tokens=[...prompt],generated=[],trace=[],done=stop=>({tokens,generated,text:generated.map(id=>id===0?'':VOCAB[id]).join(''),stop,trace});
      if(maxNewTokens===0)return done('limit');if(tokens.length>=32)return done('context');
      let {logits,cache}=api.prefill(model,prompt);
      for(;;){
        const t=logits.indexOf(Math.max(...logits));trace.push({position:tokens.length,token:t});tokens.push(t);generated.push(t);
        if(contextBeforeEos&&tokens.length>=32)return done('context');
        if(t===0)return done('eos');
        if(tokens.length>=32)return done('context');
        if(extraDecodeAtLimit)({logits,cache}=api.decodeStep(model,t,cache));
        if(generated.length>=maxNewTokens)return done('limit');
        if(!extraDecodeAtLimit)({logits,cache}=api.decodeStep(model,t,cache));
      }
    },
  };
  return api;
}

test('module 07 accepts the correct stop order and rejects an extra decode after the limit',async()=>{
  assert.equal(await run('generation-no-decode-after-stop',pocketDouble()),null);
  assert.equal(await run('generation-eos',pocketDouble()),null);
  assert.match(await run('generation-no-decode-after-stop',pocketDouble({extraDecodeAtLimit:true})),/lesson 07, Generation execution model; API\.md: "No extra decode occurs after stopping"/);
});

test('module 07 rejects reporting context when EOS fills the last slot',async()=>{
  assert.match(await run('generation-eos',pocketDouble({contextBeforeEos:true})),/lesson 07, Generation execution model.*EOS that fills the last context slot reports stop "eos"/);
});

test('module 05 says explicitly when decodeStep changes its input cache',async()=>{
  const cache=()=>({format:'pocket-cache-v1',fingerprint:fixture.digest,position:1,layers:[{keys:[[0]],values:[[0]]},{keys:[[0]],values:[[0]]}]});
  const api={loadModel:async()=>({fingerprint:fixture.digest}),prefill:()=>({logits:fixture.golden.logits[0],cache:cache()}),decodeStep:(m,t,c)=>{c.layers[0].keys.push([1]);return {logits:fixture.golden.logits[c.position],cache:{...c,position:c.position+1}};}};
  const message=await run('cache-incremental-parity',api);
  assert.match(message,/^decodeStep changed its input cache while decoding token 5 at position 1: cache\.layers\[0\]\.keys was 1 items and is now 2 items\./);
  assert.ok(message.length<300);
});

// Trained test double: replays the public goldens; optional wrong tie rule or wrong stop set.
function trainedDouble({rightmostTie=false,stopOnlyOn2=false}={}){
  const modelBytes=readFileSync(join(course,'fixtures/trained/stories260K.bin')),tokenizerBytes=readFileSync(join(course,'fixtures/trained/tok512.bin'));
  const encodeTable=new Map([...goldens.forward.map(c=>[c.text,c.tokens]),...goldens.mergeTies.map(c=>[c.text,rightmostTie?c.rightmostTieWouldGive:c.tokens])]);
  const generations=[...goldens.generation,...goldens.storyBoundary].map(c=>({key:JSON.stringify([c.prompt,c.options]),expected:c.expected}));
  const sameBytes=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  return {
    async loadModel(m,t){if(!sameBytes(m,modelBytes)||!sameBytes(t,tokenizerBytes))throw new Error('changed bytes');return {config:{architecture:'stories260k-v1',dim:64,hidden:172,layers:5,heads:8,kvHeads:4,vocabSize:512,maxContext:512,ropeBase:10000,epsilon:1e-5,bosId:1,eosId:2,stopIds:[1,2]},fingerprint:goldens.modelSha256,tokenizerFingerprint:goldens.tokenizerSha256};},
    encode(model,text){if(!encodeTable.has(text))throw new Error('not in replay table');return [...encodeTable.get(text)];},
    decode(model,ids){const hit=goldens.forward.find(c=>JSON.stringify(c.tokens)===JSON.stringify(ids));return hit?hit.text:'';},
    sample(logits,options={}){return logits.indexOf(Math.max(...logits));},
    generate(model,prompt,options={}){
      if(options.temperature!==undefined&&options.temperature<0)throw new Error('temperature');
      if(options.maxNewTokens===0)return {tokens:[...prompt],generated:[],text:'',stop:'limit',trace:[]};
      const hit=generations.find(g=>g.key===JSON.stringify([prompt,options]));if(!hit)throw new Error('not in replay table');
      const result=structuredClone(hit.expected);
      if(stopOnlyOn2&&result.generated.at(-1)===1){result.generated.push(403);result.tokens.push(403);result.trace.push({position:result.trace.at(-1).position+1,token:403});result.stop='limit';}
      return result;
    },
  };
}
const trainedData={modelBytes:readFileSync(join(course,'fixtures/trained/stories260K.bin')),tokenizerBytes:readFileSync(join(course,'fixtures/trained/tok512.bin')),goldens};

test('trained tokenizer check names the leftmost-tie rule',async()=>{
  assert.equal(await run('trained-loader-tokenizer',trainedDouble(),{},trainedData),null);
  assert.match(await run('trained-loader-tokenizer',trainedDouble({rightmostTie:true}),{},trainedData),/TRAINED\.md, 2\. Tokenize the trained vocabulary: "ties use the leftmost pair"\): encode\(model,"llll"\)/);
});

test('trained generation check names the story-delimiter stop rule',async()=>{
  assert.equal(await run('trained-generation',trainedDouble(),{},trainedData),null);
  assert.match(await run('trained-generation',trainedDouble({stopOnlyOn2:true}),{},trainedData),/TRAINED\.md, 4\. Generate with explicit limits: "After emission, ID 1 or 2 stops the story with eos"\)/);
});

test('missing trained exports name the learner file',async()=>{
  assert.match(await run('trained-stream-delivery',trainedDouble(),{},trainedData),/Export streamGenerate from work\/trained-project\.mjs/);
});

test('lab check prints plain text by default and JSON with --json',()=>{
  const parent=mkdtempSync(join(tmpdir(),'llm-feedback-')),work=join(parent,'work');
  try{
    execFileSync('node',[join(course,'lab.mjs'),'start',work],{stdio:'ignore'});
    const plain=(()=>{try{execFileSync('node',[join(course,'lab.mjs'),'check','01',work,'--help-used','none'],{encoding:'utf8'});}catch(e){assert.equal(e.status,1);return e.stdout;}})();
    assert.match(plain,/^Module 01: \d of 7 checks passed\./);assert.match(plain,/TODO lesson 01/);
    let json;try{execFileSync('node',[join(course,'lab.mjs'),'check','01',work,'--help-used','none','--json'],{encoding:'utf8'});}catch(e){json=JSON.parse(e.stdout);}
    assert.equal(json.kind,'check');assert.equal(json.report.pass,false);
  }finally{rmSync(parent,{recursive:true,force:true});}
});
