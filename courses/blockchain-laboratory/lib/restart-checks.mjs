import assert from 'node:assert/strict';
import {clone,sha256} from './support.mjs';
import {executePlan,conflicts,sameVote} from './restart-model.mjs';

const vote=(height,label)=>({height,blockId:sha256(label)});
function freeze(x) { if(x && typeof x==='object') {Object.values(x).forEach(freeze);Object.freeze(x);} return x; }
const effect=(type,v)=>({type,vote:v});
const yes=effects=>({ok:true,effects});
const no=code=>({ok:false,code});

export function runRestartChecks(planVote) {
  const results=[];
  const test=(id,requirement,fn)=>{try{fn();results.push({id,requirement,ok:true});}catch(e){results.push({id,requirement,ok:false,diagnostic:e.message});}};
  const x=vote(7,'x'), y=vote(7,'y'), z=vote(12,'z');
  test('new-vote','Persist a new decision before sending it',()=>assert.deepEqual(planVote([],x),yes([effect('persist',x),effect('send',x)])));
  test('same-vote-retry','Retry an identical durable vote without growing the journal',()=>assert.deepEqual(planVote([x],x),yes([effect('send',x)])));
  test('same-height-conflict','Reject a competing value even after reconstructed startup',()=>assert.deepEqual(planVote(JSON.parse(JSON.stringify([x])),y),no('CONFLICT')));
  test('remember-all-heights','Later heights do not erase earlier decisions; independent lower heights are allowed',()=>{
    assert.deepEqual(planVote([x,z],y),no('CONFLICT'));
    assert.deepEqual(planVote([z],x),yes([effect('persist',x),effect('send',x)]));
  });
  test('duplicate-recovery','Identical replayed journal records are harmless',()=>assert.deepEqual(planVote([x,z,x],x),yes([effect('send',x)])));
  test('bad-journal','Malformed or internally conflicting history fails closed, even at unrelated heights',()=>{
    for(const j of [null,{},[null],[{...x,height:-1}],[{...x,blockId:'not-a-hash'}],[{...x,extra:true}],[x,y],[z,{...z,blockId:x.blockId}]]) assert.deepEqual(planVote(j,x),no('JOURNAL'));
    assert.deepEqual(planVote([x,y],null),no('JOURNAL'),'Journal validation precedes request validation');
  });
  test('bad-request','Reject malformed heights, IDs and shapes without a side effect',()=>{
    for(const r of [null,{},[],{...x,height:1.5},{...x,height:-1},{...x,height:Infinity},{...x,height:Number.MAX_SAFE_INTEGER+1},{...x,height:'7'},{...x,blockId:x.blockId.toUpperCase()},{...x,blockId:'a'.repeat(63)},{...x,extra:1}]) assert.deepEqual(planVote([],r),no('REQUEST'));
    for(const height of [0,Number.MAX_SAFE_INTEGER]) {const r={...x,height};assert.deepEqual(planVote([],r),yes([effect('persist',r),effect('send',r)]));}
  });
  test('pure-inputs','Planning never edits its journal or request',()=>{
    const j=freeze([clone(x)]),r=freeze(clone(z)),before=JSON.stringify({j,r});
    const result=planVote(j,r); assert.equal(result.ok,true); assert.equal(JSON.stringify({j,r}),before);
  });
  test('crash-cuts','Every boundary preserves non-equivocation across a restart and competing request',()=>{
    for(const cut of [0,1,2]) {
      const first=executePlan(planVote,[],x,{cut});
      const second=executePlan(planVote,JSON.parse(JSON.stringify(first.durable)),y);
      assert.equal(conflicts([...first.sent,...second.sent]),false,`Conflicting emissions at cut ${cut}`);
      if(cut===0) assert.deepEqual(second.sent,[y],'Nothing committed before first persist: Y can proceed');
      if(cut===1) {assert.deepEqual(first.sent,[]);assert.equal(second.decision.ok,false,'A durable unsent X still blocks Y');}
    }
  });
  test('retry-after-crash','The same vote remains sendable after every crash boundary',()=>{
    for(const cut of [0,1,2]) {
      const first=executePlan(planVote,[],x,{cut});
      const retry=executePlan(planVote,first.durable,x);
      assert.deepEqual(retry.sent,[x]);assert.deepEqual(retry.durable,[x]);
    }
  });
  test('storage-failure','A failed durable write stops the effect sequence before any send',()=>{
    const result=executePlan(planVote,[],x,{failPersist:true});assert.deepEqual(result.sent,[]);assert.deepEqual(result.durable,[]);
  });
  let explored=0;
  test('bounded-schedules','Explore all three-request schedules over two values, two heights and every effect cut',()=>{
    const requests=[x,y,z];
    function visit(journal,sent,depth) {
      if(depth===3) {explored++;return;}
      for(const request of requests) for(const cut of [0,1,2]) {
        const result=executePlan(planVote,journal,request,{cut});
        const combined=[...sent,...result.sent];
        assert.equal(conflicts(combined),false,`Conflicting emissions: ${JSON.stringify(combined)}`);
        for(const emitted of result.sent) assert.ok(result.durable.some(saved=>sameVote(saved,emitted)),'Sent vote is absent from durable history');
        visit(JSON.parse(JSON.stringify(result.durable)),combined,depth+1);
      }
    }
    visit([],[],0);assert.equal(explored,729);
  });
  return {passed:results.filter(r=>r.ok).length,total:results.length,exploredSchedules:explored,results,
    scope:'Public executable contract and 729 bounded schedules. Not exhaustive over arbitrary programs, storage faults or real networks.'};
}
