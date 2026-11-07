// Public behavioral cases, original to this course. No learner claim decides a result.
// Compare public JSON-shaped values. Object insertion order is not a contract;
// array positions, field presence and primitive values remain significant.
export function same(a,b) {
  if(a===b)return true;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)&&a.length!==b.length)return false;
  const left=Object.keys(a).sort(),right=Object.keys(b).sort();
  if(left.length!==right.length||left.some((key,n)=>key!==right[n]))return false;
  return left.every(key=>same(a[key],b[key]));
}
export const stages = ['01','02','03','04','05','06','07'];
export const program = [{op:'set',reg:'a',value:3},{op:'set',reg:'b',value:0},{op:'store',address:0,value:'b'},{op:'add',reg:'b',value:1},{op:'add',reg:'a',value:-1},{op:'jnz',value:'a',target:2},{op:'emit',value:'b'},{op:'halt'}];
function caseFailure(counterexample){const error=Error('The first concrete boundary case differs.');error.counterexample=counterexample;throw error;}
export function suite(api, stage) {
  const results = [];
  const test = (id, input, expected, run) => {
    if(typeof input==='string')input={program:id==='01.halt'?[{op:'halt'}]:id==='02.budget'?[{op:'jnz',value:1,target:0}]:id==='07.changed-program'?[{op:'set',reg:'d',value:9},{op:'store',address:6,value:'d'},{op:'load',reg:'a',address:6},{op:'emit',value:'a'},{op:'halt'}]:program,actions:input};
    try { const actual = run(); results.push({ id, input, expected, actual, pass: same(actual,expected), lesson: `lessons/${id.slice(0,2)}.md` }); }
    catch (e) { results.push({ id, input, expected, actual: { error: e.message }, counterexample:e.counterexample??null, pass:false, lesson:`lessons/${id.slice(0,2)}.md` }); }
  };
  const newD = p => new api.Debugger(p ?? program);
  const advance = (d,n) => { for(let k=0;k<n;k++) d.step(); return d; };
  if (Number(stage)>=1) {
    test('01.initial', 'construct counter', [0,0,0,false], () => { const s=newD().inspect(); return [s.pc,s.tick,s.regs.a,s.halted]; });
    test('01.detached', 'edit returned registers and memory', [0,0], () => { const d=newD(), s=d.inspect(); s.regs.a=99;s.mem[0]=99;return [d.inspect().regs.a,d.inspect().mem[0]]; });
    test('01.step', 'step set a=3', [1,1,3,0,'set'], () => {const d=newD(),e=d.step(),s=d.inspect();return [s.pc,s.tick,s.regs.a,e.pc,e.op];});
    test('01.halt', 'halt then step again', [true,1,null], () => {const d=newD([{op:'halt'}]);d.step();return [d.inspect().halted,d.inspect().tick,d.step()];});
  }
  if (Number(stage)>=2) {
    test('02.before-effects', {program:[{op:'emit',value:9},{op:'store',address:3,value:2},{op:'emit',value:20},{op:'halt'}],actions:'break1; run twice; step; break2; run twice'},
      [{stop:{reason:'breakpoint',tick:1,pc:1},memory:0,output:[9]},{stop:{reason:'breakpoint',tick:1,pc:1},memory:0,output:[9]},{stop:{reason:'breakpoint',tick:2,pc:2},memory:2,output:[9]},{stop:{reason:'breakpoint',tick:2,pc:2},memory:2,output:[9]}], () => {
        const d=newD([{op:'emit',value:9},{op:'store',address:3,value:2},{op:'emit',value:20},{op:'halt'}]);
        const observe=()=>{const r=d.run(10),s=d.inspect();return {stop:{reason:r.reason,tick:r.tick,pc:r.pc},memory:s.mem[3],output:s.output};};
        d.addBreakpoint({pc:1});const first=observe(),again=observe();d.step();d.addBreakpoint({pc:2});return [first,again,observe(),observe()];
      });
    test('02.before', 'break pc3 only when b=1', ['breakpoint',7,3,1], () => {const d=newD();d.addBreakpoint({pc:3,condition:{kind:'reg',name:'b',equals:1}});const r=d.run(100);return [r.reason,r.tick,r.pc,d.inspect().regs.b];});
    test('02.bypass', 'step explicitly past pc0 breakpoint', [0,1], () => {const d=newD();d.addBreakpoint({pc:0});const r=d.run();d.step();return [r.tick,d.inspect().tick];});
    test('02.halt-final-slot', {program:[{op:'emit',value:1},{op:'halt'}],runLimits:[1,1,1]},[['limit',1,1],['halt',2,2],['halt',2,2]],()=>{const d=newD([{op:'emit',value:1},{op:'halt'}]);return [d.run(1),d.run(1),d.run(1)].map(r=>[r.reason,r.tick,r.pc]);});
    test('02.halt-whole-budget', {program:[{op:'emit',value:1},{op:'halt'}],runLimit:2},['halt',2,2],()=>{const r=newD([{op:'emit',value:1},{op:'halt'}]).run(2);return [r.reason,r.tick,r.pc];});
    test('02.budget' , 'infinite jnz with limit3', ['limit',3], () => {const d=newD([{op:'jnz',value:1,target:0}]);const r=d.run(3);return [r.reason,r.tick];});
  }
  if (Number(stage)>=3) {
    test('03.change', 'watch addr0: ignore initial 0→0, stop 0→1', ['watchpoint',7,3,0,1], () => {const d=newD();d.watch(0);const r=d.run(100);return [r.reason,r.tick,r.pc,r.write.before,r.write.after];});
    test('03.address', 'watch addr7 while addr0 changes', 'halt', () => {const d=newD();d.watch(7);return d.run(100).reason;});
  }
  if (Number(stage)>=4) {
    const siblings=[{value:6,address:5},{value:-3,address:2}];
    test('04.nonzero-same-value', {programs:siblings.map(s=>[{op:'set',reg:'c',value:s.value},{op:'store',address:s.address,value:'c'},{op:'store',address:s.address,value:'c'},{op:'halt'}]),actions:'step all; retain both store writes'},
      siblings.map(s=>[{tick:1,pc:0,op:'set',writes:[],emitted:[]},{tick:2,pc:1,op:'store',writes:[{address:s.address,before:0,after:s.value}],emitted:[]},{tick:3,pc:2,op:'store',writes:[{address:s.address,before:s.value,after:s.value}],emitted:[]},{tick:4,pc:3,op:'halt',writes:[],emitted:[]}]),
      ()=>siblings.map(s=>{const d=advance(newD([{op:'set',reg:'c',value:s.value},{op:'store',address:s.address,value:'c'},{op:'store',address:s.address,value:'c'},{op:'halt'}]),4);return d.trace().map(e=>({tick:e.tick,pc:e.pc,op:e.op,writes:e.writes,emitted:e.emitted}));}));
    test('04.breakpoint-frontier', {program:[{op:'emit',value:9},{op:'store',address:3,value:2},{op:'emit',value:20},{op:'halt'}],actions:'pause twice at1; step; pause at2; compare recorded history'},
      [[{tick:1,pc:0,op:'emit',writes:[],emitted:[9]}],[{tick:1,pc:0,op:'emit',writes:[],emitted:[9]}],[{tick:1,pc:0,op:'emit',writes:[],emitted:[9]},{tick:2,pc:1,op:'store',writes:[{address:3,before:0,after:2}],emitted:[]}]],()=>{
        const d=newD([{op:'emit',value:9},{op:'store',address:3,value:2},{op:'emit',value:20},{op:'halt'}]),view=()=>d.trace().map(e=>({tick:e.tick,pc:e.pc,op:e.op,writes:e.writes,emitted:e.emitted}));
        d.addBreakpoint({pc:1});d.run(10);const first=view();d.run(10);const again=view();d.step();d.addBreakpoint({pc:2});d.run(10);return [first,again,view()];
      });
    test('04.events', 'five steps include store', [5,3,2,[{address:0,before:0,after:0}]], () => {const d=advance(newD(),5),t=d.trace();return [t.length,t[2].tick,t[2].pc,t[2].writes];});
    test('04.detached', 'mutate returned trace', 0, () => {const d=advance(newD(),3);d.trace()[2].writes[0].after=99;return d.trace()[2].writes[0].after;});
  }
  if (Number(stage)>=5) {
    test('05.replay', 'checkpoint at4; rewind0; seek9', [0,0,9,9,1,1], () => {const d=advance(newD(),4);const c=d.checkpoint('loop');c.state.regs.a=99;advance(d,5);const zero=d.seek(0);const s=d.seek(9);return [zero.tick,zero.regs.a,s.tick,d.trace().length,s.regs.a,s.mem[0]];});
    test('05.no-duplicate', 'seek2; step through existing history', 8, () => {const d=advance(newD(),8);d.seek(2);advance(d,3);return d.trace().length;});
    test('05.boundary', 'seek0 on a fresh instance, then seek beyond recorded tick', [0,true,0], () => {const d=newD();const zero=d.seek(0);let rejected=false;try{d.seek(1);}catch{rejected=true;}return [zero?.tick,rejected,d.inspect().tick];});
  }
  if (Number(stage)>=6) {
    test('06.nearest', 'from tick14, find earlier b=1', [7,7], () => {const d=advance(newD(),14);const tick=d.reverseFind({kind:'reg',name:'b',equals:1});return [tick,d.inspect().tick];});
    test('06.no-match', 'no previous a=999', [null,5], () => {const d=advance(newD(),5);const tick=d.reverseFind({kind:'reg',name:'a',equals:999});return [tick,d.inspect().tick];});
    test('06.explicit-bound', {program,advance:14,condition:{kind:'reg',name:'b',equals:1},beforeTick:5},[4,4],()=>{const d=advance(newD(),14);const found=d.reverseFind({kind:'reg',name:'b',equals:1},5);return [found,d.inspect().tick];});
    test('06.frontier-plus-one', {program,advance:14,seek:2,condition:{kind:'reg',name:'b',equals:3},beforeTick:15},[14,14],()=>{const d=advance(newD(),14);d.seek(2);const found=d.reverseFind({kind:'reg',name:'b',equals:3},15);return [found,d.inspect().tick];});
    test('06.zero-bound', {program,advance:14,condition:{kind:'reg',name:'b',equals:1},beforeTick:0},[null,14],()=>{const d=advance(newD(),14);const found=d.reverseFind({kind:'reg',name:'b',equals:1},0);return [found,d.inspect().tick];});
    test('06.invalid-bounds', {program,advance:1,condition:{kind:'reg',name:'a',equals:0},validBound:0,invalidBounds:[-1,1.5,3,'1']},[[null,1],[true,1],[true,1],[true,1],[true,1]],()=>{const d=advance(newD(),1);const valid=[d.reverseFind({kind:'reg',name:'a',equals:0},0),d.inspect().tick];return [valid,...[-1,1.5,3,'1'].map(bound=>{let rejected=false;try{d.reverseFind({kind:'reg',name:'a',equals:0},bound);}catch{rejected=true;}return [rejected,d.inspect().tick];})];});
    test('06.genesis' , 'zero state included in reverse search', 0, () => {const d=advance(newD(),1);return d.reverseFind({kind:'reg',name:'a',equals:0});});
  }
  if (Number(stage)>=7) {
    test('07.instance-isolation', {firstProgram:[{op:'set',reg:'d',value:9},{op:'store',address:6,value:'d'},{op:'emit',value:'d'},{op:'halt'}],nextProgram:[{op:'emit',value:4},{op:'halt'}],actions:'finish first; add old breakpoint/checkpoint; construct next; run next; seek first'},
      {genesis:{pc:0,tick:0,regs:{a:0,b:0,c:0,d:0},mem:[0,0,0,0,0,0,0,0],output:[],halted:false},initialTrace:[],stop:{reason:'halt',tick:2,pc:2},after:{pc:2,tick:2,regs:{a:0,b:0,c:0,d:0},mem:[0,0,0,0,0,0,0,0],output:[4],halted:true},trace:[{tick:1,pc:0,op:'emit',writes:[],emitted:[4]},{tick:2,pc:1,op:'halt',writes:[],emitted:[]}],firstUnchanged:[true,true],nextUnchangedAfterOtherSeek:[true,true]},()=>{
        const first=newD([{op:'set',reg:'d',value:9},{op:'store',address:6,value:'d'},{op:'emit',value:'d'},{op:'halt'}]);first.run(10);first.addBreakpoint({pc:0});first.checkpoint('old-program');const oldState=first.inspect(),oldTrace=first.trace();
        const next=newD([{op:'emit',value:4},{op:'halt'}]),genesis=next.inspect(),initialTrace=next.trace(),r=next.run(10),after=next.inspect(),trace=next.trace();
        const firstUnchanged=[same(first.inspect(),oldState),same(first.trace(),oldTrace)];first.seek(0);
        return {genesis,initialTrace,stop:{reason:r.reason,tick:r.tick,pc:r.pc},after,trace:trace.map(e=>({tick:e.tick,pc:e.pc,op:e.op,writes:e.writes,emitted:e.emitted})),firstUnchanged,nextUnchangedAfterOtherSeek:[same(next.inspect(),after),same(next.trace(),trace)]};
      });
    test('07.changed-program', 'store and emit through a different address', ['watchpoint',2,6,'halt',[9]], () => {const d=newD([{op:'set',reg:'d',value:9},{op:'store',address:6,value:'d'},{op:'load',reg:'a',address:6},{op:'emit',value:'a'},{op:'halt'}]);d.watch(6);const r=d.run(50);d.seek(0);d.step();d.step();d.step();const pc=d.inspect().pc;const done=d.run(50);return [r.reason,r.pc,r.write.address,done.reason,d.inspect().output];});
  }
  return results;
}
