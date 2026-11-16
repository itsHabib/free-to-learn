import {readFileSync} from 'node:fs';
import {support} from '../public/supplier.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStage} from '../public/checks.mjs';

// Observe grader inputs, not a learner solution. These probes deliberately do not
// implement DOM or layout and their aggregate checkStage results are not passes.
function probe() {
 const calls=[];
 return {calls,engine:{
  buildDOM(tokens){return {tokens,nodes:[]};},
  layout(doc,styles){
   calls.push({doc,styles});
   if(doc.tokens)throw new Error('structural fixture probe');
   return {boxes:[{nodeId:2,contentHeight:4},{nodeId:4,y:4}],glyphs:[],height:4};
  }
 }};
}
function visibleText({doc,styles}) {
 const found=[];
 function visit(id){
  const n=doc.nodes.find(n=>n.id===id);
  if(!n || styles[n.id]?.values.display==='none')return;
  if(n.kind==='text' && n.text.trim())found.push(n.text);
  for(const child of n.children)visit(child);
 }
 visit(doc.root);return found;
}
test('M3 successful geometry fixtures require no text-line implementation',()=>{
 const {calls,engine}=probe();const result=checkStage(engine,'M3');
 assert.equal(calls.length,result.results.length);
 for(let i=0;i<result.results.length;i++){
  if(result.results[i].expected==='diagnostic')continue;
  assert.deepEqual(visibleText(calls[i]),[],result.results[i].id);
 }
 const i=result.results.findIndex(r=>r.id==='fixed-height-overflow');
 assert.equal(calls[i].styles[2].values.height,4);
 assert.equal(calls[i].styles[3].values.height,20);
 assert.deepEqual(result.results[i].expected,[4,4]);
 assert.ok(result.results.some(r=>r.id==='block-in-inline'&&r.expected==='diagnostic'));
});
test('M4 retains the text-overflow requirement after introducing line layout',()=>{
 const {calls,engine}=probe();const result=checkStage(engine,'M4');
 assert.equal(result.results[0].id,'fixed-height-text-overflow');
 assert.deepEqual(visibleText(calls[0]),['AB CD']);
 assert.deepEqual(result.results[0].expected,[4,4]);
});

// Execute the actual displayed helper excerpt so documentation cannot drift from
// the supplied JavaScript interface. This does not implement learner methods.
test('displayed support helper calls match actual supplied types',()=>{
 const doc=readFileSync(new URL('../public/CONTRACT.md',import.meta.url),'utf8');
 const match=doc.match(/<!-- support-contract-example -->\s*```js\n([\s\S]*?)```/);
 assert.ok(match,'documented helper example exists');
 const result=new Function('support',match[1]+'\nreturn {supportsDiv,supportsImg,validId,text};')(support);
 assert.deepEqual(result,{supportsDiv:true,supportsImg:false,validId:true,text:'hello\nworld'});
 assert.ok(support.tags instanceof Set);
 assert.ok(support.identifier instanceof RegExp);
 for(const value of [12,'café','x'.repeat(support.LIMITS.text+1)]){
  assert.throws(()=>support.textValue(value),error=>error.code==='unsupported_character');
 }
});
