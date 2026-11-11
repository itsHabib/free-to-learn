// Bounded pure-policy checks only. Full engine/persistence checks require Node.
export function runPolicyChecks(module, unit) {
  class Shell { static valueKey(v) { return JSON.stringify([typeof v,v]); } }
  const Engine=module.buildEngine(Shell), engine=new Engine(), results=[];
  const equal=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`Expected ${JSON.stringify(b)}, observed ${JSON.stringify(a)}`);};
  const check=(id,fn)=>{try{fn();results.push({id,passed:true});}catch(e){results.push({id,passed:false,message:e.message});}};
  const h=[{csn:2,row:{group:'A',value:4}},{csn:5,row:null},{csn:9,row:{group:'B',value:7}}];
  if(unit==='01') {
    check('R03 boundary',()=>equal(engine.visibleVersion(h,2)?.row.value,4));
    check('R03 future exclusion',()=>equal(engine.visibleVersion(h,4)?.row.value,4));
    check('R03 deletion',()=>equal(engine.visibleVersion(h,8)?.row,null));
    check('R03 absence',()=>equal(engine.visibleVersion(h,1),null));
    check('R03 examine',()=>{const one=[h[0]], seen=[];equal(engine.visibleVersion(one,2,v=>seen.push(v))?.row.value,4);equal(seen.length>0&&seen.every(v=>one.includes(v)),true);});
  } else if(unit==='05') {
    check('R10 historical membership',()=>equal(engine.indexMemberships(h,'group').slice().sort(),['A','B']));
    check('R10 unique membership',()=>equal(engine.indexMemberships([...h,{csn:10,row:{group:'B'}}],'group').slice().sort(),['A','B']));
  } else if(unit==='06') {
    check('R11 boundary retention',()=>{const kept=engine.retainedVersions(h,8).map(v=>v.csn);equal(kept.includes(5)&&kept.includes(9),true);});
    check('R11 no-reader progress',()=>equal(engine.retainedVersions(h,9).map(v=>v.csn),[9]));
  } else if(unit==='07') {
    const weights={candidateVisits:1,versionExaminations:2,predicateEvaluations:1,hashBuild:2,hashProbe:1,outputRows:1};
    const stats=n=>({rowCount:n,physicalKeys:n,versionProbes:n,frequencies:[{value:'A',count:n}],indexCandidates:[{value:'A',count:n}]});
    check('R16 many-match crossover',()=>equal(engine.planEqualityJoin(stats(8),stats(12),'A',weights).selected,'scan-hash'));
    check('R15 visible frequencies',()=>equal(engine.summarizeSnapshot([{key:1,row:{group:'A'}}],'group',{snapshot:4}).frequencies,[{value:'A',count:1}]));
  } else throw Error('Choose a supported pure-policy unit.');
  return results;
}
