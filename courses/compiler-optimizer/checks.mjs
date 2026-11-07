// Public requirement checks. Source inspection is permitted; these are not secret exams.
import { clone, run, equivalent, observation, cfg, dominates, verify, digest, cost } from './runtime.mjs';
import { Editor, checkChain } from './editor.mjs';
import { validate, reportFor, wrongResult, size } from './evidence.mjs';
import * as C from './cases.mjs';
import {measure,structuralMeasure,smaller} from './investigation.mjs';
const value = x => C.emptyInput({x:String(x)});
export const unitTitles = ['Observable behavior','SSA and dominance','Scalar optimizer','Conditional constants','Aliases and effects','Loop motion','Evidence and cost','Reduce a miscompilation','Unfamiliar optimization'];
function assert(value,message) { if(!value) throw new Error(message); }
export function faultyMemory(program) {
  const p=clone(program);
  for(const b of p.blocks) {
    const loads=b.instructions.filter(i=>i.op==='load');
    if(loads.length<2) continue;
    const first=loads[0],last=loads.at(-1);
    for(const i of b.instructions) if(i.args) i.args=i.args.map(id=>id===last.id?first.id:id);
    if(b.term.value===last.id)b.term.value=first.id;
    b.instructions=b.instructions.filter(i=>i.id!==last.id);
  }
  return p;
}
export async function grade(unit, learner, project = null) {
  const results=[];
  const check=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,message:e.message,repair:`Read lessons/${String(unit).padStart(2,'0')}.md and revise the named requirement.`});}};
  const artifact=async(fn,p,inputs,contract={},benefit=false)=>{
    const result=await learner[fn](clone(p),clone(contract));
    assert(result?.program && Array.isArray(result.events),`${fn} must return Editor.finish()`);
    const proof=checkChain(p,result,contract);assert(proof.ok,`Rewrite evidence rejected: ${proof.reason}`);
    const report=reportFor(p,result,inputs,{contract});
    assert(report.validation.status==='EXHAUSTIVE_WITHIN_DOMAIN',`Behavior changed or unresolved: ${report.validation.status}; witness ${JSON.stringify(report.validation.cases.find(c=>c.status!=='equal'))}`);
    if(benefit) assert(report.cost.after<report.cost.before,`Required useful opportunity was missed: before=${report.cost.before}, after=${report.cost.after}`);
    return result;
  };
  if(unit===1){
    const p=C.memoryKernel(),i=C.memoryInput(true),a=run(p,i),b=run(faultyMemory(p),i);
    await check('Equal completed observations; internal cost ignored',()=>assert(learner.compare(a,{...clone(a),steps:999,counts:{}})===true,'Same observations must compare equal despite cost counters'));
    await check('Return value matters',()=>assert(learner.compare(a,b)===false,'The alias witness returns different values'));
    await check('Heap, effects, trap codes and types matter',()=>{
      for(const changed of [{...clone(a),heap:{A:{type:'i8',cells:['8']}}},{...clone(a),events:[{type:'i8',value:'1'}]},{...clone(a),type:'i32'}]) assert(learner.compare(a,changed)===false,`Missed observable difference: ${JSON.stringify(changed)}`);
      const t={kind:'trap',code:'bounds',heap:{},events:[]};assert(learner.compare(t,{...t,code:'other'})===false,'Trap code differs');
    });
    await check('Unknown and invalid are never equivalence',()=>{for(const kind of ['unknown','invalid']) assert(learner.compare({kind},{kind})===false,`${kind} is not completed semantics`);});
  }
  if(unit===2){
    for(const [name,p] of [['diamond',C.diamond()],['loop with phis',C.swapLoop()]]) await check(name,()=>{
      const actual=learner.dominators(clone(p));
      for(const b of p.blocks){const expected=p.blocks.filter(a=>dominates(p,a.id,b.id)).map(x=>x.id).sort();assert(JSON.stringify([...(actual[b.id]??[])].sort())===JSON.stringify(expected),`${b.id}: expected dominators ${expected}; received ${JSON.stringify(actual[b.id])}`);}
    });
    await check('Analysis ignores textual block ordering',()=>{const p=C.diamond();p.blocks.reverse();const actual=learner.dominators(p);assert(JSON.stringify([...actual.join].sort())===JSON.stringify(['entry','join']),'Join is dominated by entry and itself; neither arm dominates it');});
  }
  if(unit===3){
    await check('Useful scalar kernel with all i8 inputs',()=>artifact('scalar',C.scalarKernel(),Array.from({length:256},(_,x)=>value(x)),{},true));
    const pairs=[['0','0'],['1','2'],['127','128'],['255','3']].map(([x,y])=>C.emptyInput({x,y}));
    await check('Reuse two live commutative expressions',()=>artifact('scalar',C.reuseKernel(),pairs,{},true));
    await check('Noncommutative operands are not interchangeable',()=>artifact('scalar',C.reuseKernel('sub'),pairs));
    await check('Remove an unused total dependency chain',()=>artifact('scalar',C.deadKernel(),[value(0),value(255)],{},true));
    await check('Large multiplication folds exactly',async()=>{const p=C.wordKernel();p.params=[];p.blocks[0].instructions.unshift({id:'a',op:'const',type:'i32',value:'4294967295'},{id:'b',op:'const',type:'i32',value:'4294967295'});await artifact('scalar',p,[C.emptyInput({})],{},true);});
    await check('Trap-bearing unused work is preserved',()=>artifact('scalar',C.trapKernel(),[{args:{p:{object:'A',offset:'0'}},heap:{A:{type:'i8',cells:['4']}}}]));
  }
  if(unit===4){
    await check('Constant branch and phi simplify usefully',()=>artifact('constants',C.diamond(true),[C.emptyInput({})],{},true));
    await check('Unknown branch stays correct on both edges',()=>artifact('constants',C.diamond(false),[C.emptyInput({gate:false}),C.emptyInput({gate:true})]));
    await check('Loop-carried values do not freeze at entry',()=>artifact('constants',C.swapLoop(),[0,1,2,3].map(n=>C.emptyInput({n:String(n)}))));
    await check('Equal incoming values expose a further fold',()=>artifact('constants',C.equalPhiKernel(),[C.emptyInput({gate:false}),C.emptyInput({gate:true})],{},true));
  }
  if(unit===5){
    const p=C.memoryKernel();
    await check('Static alias facts are conservative',()=>{assert(learner.aliases(p,'p','p',{})==='must','Same pointer must alias itself');assert(learner.aliases(p,'p','q',{})==='may','Different parameter names do not prove separation');assert(learner.aliases(p,'p','q',{distinct:[['p','q']]})==='no','Explicit validated separation should be recognized');});
    await check('Constant offsets compose; unknown offsets remain conservative',()=>{const q=C.pointerAliasKernel();for(const [a,b,want]of [['p','same','must'],['p','next','no'],['p','back','must'],['p','unknown','may']])assert(learner.aliases(q,a,b,{})===want,`${a}/${b}: expected ${want}`);});
    await check('Alias write prevents reuse',()=>artifact('memory',p,[C.memoryInput(true),C.memoryInput(false)]));
    await check('Proven distinct objects enable useful reuse',()=>artifact('memory',p,[C.memoryInput(false)],{distinct:[['p','q']]},true));
    await check('Forward a completed store across a retained event',()=>artifact('memory',C.forwardingKernel(),[0,255].map(v=>({args:{p:{object:'A',offset:'0'},v:String(v)},heap:{A:{type:'i8',cells:['4']}}})),{},true));
  }
  if(unit===6){
    await check('Total scalar work moves usefully',()=>artifact('loops',C.loopKernel({scalar:true}),[0,1,3,5].map(n=>C.loopInput(String(n))),{},true));
    await check('Safe load motion with frozen preconditions',()=>artifact('loops',C.loopKernel(),[0,1,3,5].map(n=>C.loopInput(String(n))),{offsets:{p:'0'},minLengths:{p:1}},true));
    await check('Zero-trip possibly empty heap does not gain a trap',()=>artifact('loops',C.loopKernel(),[C.loopInput('0',[]),C.loopInput('2',['5'])]));
    await check('Loop alias write remains visible',()=>artifact('loops',C.loopKernel({write:true}),[C.loopInput('2',['1'],true),C.loopInput('3',['255'],true)]));
  }
  if(unit===7){
    const good={validation:{status:'EXHAUSTIVE_WITHIN_DOMAIN',complete:true},proof:{ok:true},identitiesCurrent:true,cost:{complete:true,before:12,after:8,sameWorkload:true}};
    await check('Accept a supported useful translation',()=>assert(learner.decide(clone(good))?.accept===true,'Complete supported lower-cost result should be accepted'));
    for(const status of ['COUNTEREXAMPLE','SAMPLED_NO_DIFFERENCE','UNKNOWN','INVALID']) await check(`Reject ${status}`,()=>assert(learner.decide({...clone(good),validation:{status,complete:status==='SAMPLED_NO_DIFFERENCE'}})?.accept===false,`${status} does not justify default adoption`));
    await check('Reject stale/unsupported/incomplete/noncomparable/no-win reports',()=>{for(const bad of [{...clone(good),identitiesCurrent:false},{...clone(good),proof:{ok:false}},{...clone(good),validation:{...good.validation,complete:false}},{...clone(good),cost:{...good.cost,sameWorkload:false}},{...clone(good),cost:{...good.cost,complete:false}},{...clone(good),cost:{...good.cost,after:12}}]) assert(learner.decide(bad)?.accept===false,'An unmet identity/proof/cost requirement was ignored');});
  }
  if(unit===8){
    await check('Reduce the original wrong-result behavior',async()=>{
      const p=C.memoryKernel();p.blocks[0].instructions.unshift({id:'irrelevant',op:'const',type:'i8',value:'42'});
      const input=C.memoryInput(true),reduced=await learner.reduce(clone(p),clone(input),faultyMemory);
      assert(reduced?.program&&reduced.input,'Return program and input');assert(wrongResult(reduced.program,reduced.input,faultyMemory),'Reduced candidate must remain a legal normal-return wrong result');
      assert(smaller(measure(reduced.program,reduced.input),measure(p,input)),'Reduce structure or numeric witness complexity; names and serialization do not count');
      assert(digest(reduced.program.params)===digest(p.params)&&reduced.program.returns===p.returns,'Preserve the parameter/return contract');
      assert(typeof reduced.explanation==='string'&&reduced.explanation.trim().length>=30,'Explain your reduction family and stopping condition for rubric review');
    });
  }
  if(unit===9){
    await check('Independent investigation project exists',()=>assert(typeof project?.investigate==='function','Create project.mjs exporting investigate(program, foreignPass); see API.md. No project solution is supplied.'));
    if(typeof project?.investigate==='function') await check('Fresh witness, meaningful reduction and useful repair',async()=>{
      const p=C.transferKernel(),result=await project.investigate(clone(p),C.foreignPass);
      assert(wrongResult(p,result.input,C.foreignPass),'Your input must demonstrate a legal normal-return wrong result');
      assert(wrongResult(result.reduced,result.input,C.foreignPass),'Reduced source must regenerate the same class of wrong result');
      assert(smaller(structuralMeasure(result.reduced),structuralMeasure(p)),'The final project requires fewer blocks, definitions/instructions or operands; cosmetic and literal-only changes do not count');
      assert(digest(result.reduced.params)===digest(p.params)&&result.reduced.returns===p.returns,'Keep the function signature');
      assert(typeof result.repair==='function','Return repair(program) for the foreign pass replacement');
      const fixed=await result.repair(clone(p)),grid=[0,1,2,63,127,128,129,255].flatMap(sample=>[0,1,20,127,128,255].map(bias=>C.emptyInput({sample:String(sample),bias:String(bias)})));
      assert(checkChain(p,fixed).ok,'Repaired transform must carry valid checked edits');
      assert(validate(p,fixed.program,grid).status==='EXHAUSTIVE_WITHIN_DOMAIN','Repair changes behavior on boundary domain');
      assert(wrongResult(p,result.input,C.foreignPass)&&equivalent(run(p,result.input),run(fixed.program,result.input)),'Repair must fix your original witness');
      const sample=C.scalarKernel(),win=await result.repair(clone(sample));assert(checkChain(sample,win).ok,'Repair must preserve checked-edit protocol');
      const report=reportFor(sample,win,[value(0),value(10),value(255)]);assert(report.validation.status==='EXHAUSTIVE_WITHIN_DOMAIN'&&report.cost.after<report.cost.before,'Disabling all optimization is not a useful repair');
      assert(typeof result.explanation==='string'&&result.explanation.trim().length>=40,'Include a causal explanation and limits for rubric review; prose is not auto-certified');
    });
  }
  if(!Number.isInteger(unit)||unit<1||unit>9)throw new Error('Unit must be 01 through 09');
  return {unit,title:unitTitles[unit-1],passed:results.length>0&&results.every(r=>r.ok),results,reasoningReview:unit===9?'Manual/self-review required; mechanical success is not causal-explanation acceptance':null};
}
