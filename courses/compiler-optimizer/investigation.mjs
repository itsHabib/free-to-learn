// Supplied execution/accounting tools. Learners choose reductions and stopping rules.
import {clone,digest,run,verify,equivalent} from './runtime.mjs';

// Counts, not spelling: alpha-renaming and JSON presentation carry no weight.
export function structuralMeasure(program) {
  const definitions=program.params.length+program.blocks.reduce((n,b)=>n+b.phis.length+b.instructions.length,0);
  const operands=program.blocks.reduce((n,b)=>n+b.phis.reduce((s,p)=>s+Object.keys(p.incoming).length,0)+b.instructions.reduce((s,i)=>s+(i.args?.length??0),0),0);
  return [program.blocks.length,definitions,operands];
}
function valueComplexity(value) {
  if(typeof value==='boolean')return Number(value);
  if(value&&typeof value==='object')return valueComplexity(value.offset);
  const n=BigInt(value),magnitude=n<0n?-n:n;
  return (magnitude===0n?0:magnitude.toString(2).length)+(n<0n?1:0);
}
export function measure(program,input) {
  const objects=Object.values(input.heap),cells=objects.reduce((n,o)=>n+o.cells.length,0);
  const literals=program.blocks.flatMap(b=>b.instructions.filter(i=>i.op==='const').map(i=>i.value));
  const values=[...literals,...Object.values(input.args),...objects.flatMap(o=>o.cells)];
  return [...structuralMeasure(program),objects.length,cells,values.reduce((sum,v)=>sum+valueComplexity(v),0)];
}
export function smaller(left,right) {
  if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)throw new Error('measure.shape');
  for(let n=0;n<left.length;n++){if(left[n]<right[n])return true;if(left[n]>right[n])return false;}return false;
}
export function inspectWitness(program,input,transform,{contract={},fuel=10000}={}) {
  const identity={source:digest(program),input:digest(input),contract:digest(contract)};
  if(!verify(program).ok)return {...identity,status:'NOT_INTERESTING',reason:'invalid source'};
  let target;
  try{target=transform(clone(program));}catch(error){return {...identity,status:'UNRESOLVED',reason:'transform failed',error:error.message};}
  if(target&&typeof target.then==='function')return {...identity,status:'UNRESOLVED',reason:'async transforms require a separate runner'};
  if(!verify(target).ok)return {...identity,status:'NOT_INTERESTING',reason:'invalid target'};
  const sourceResult=run(program,input,{contract,fuel}),targetResult=run(target,input,{contract,fuel});
  const result={...identity,target:digest(target),sourceResult,targetResult};
  if(sourceResult.kind==='unknown'||targetResult.kind==='unknown')return {...result,status:'UNRESOLVED',reason:'execution budget'};
  if(sourceResult.kind!=='return'||targetResult.kind!=='return')return {...result,status:'NOT_INTERESTING',reason:'normal returns required'};
  // The investigation target is a wrong result, not only a reordered event trace.
  const wrong=sourceResult.type!==targetResult.type||sourceResult.value!==targetResult.value||digest(sourceResult.heap)!==digest(targetResult.heap);
  return {...result,status:wrong?'INTERESTING':'NOT_INTERESTING',reason:wrong?'normal-return value or heap mismatch':equivalent(sourceResult,targetResult)?'same observation':'event-only difference outside this investigation target'};
}
export function assessNeighborhood(program,input,transform,candidates,{contract={},fuel=10000,maxCandidates=256}={}) {
  if(!Array.isArray(candidates)||!Number.isSafeInteger(maxCandidates)||maxCandidates<0||maxCandidates>4096)throw new Error('neighborhood.shape');
  const base=inspectWitness(program,input,transform,{contract,fuel}),baseMeasure=measure(program,input),seen=new Set(),results=[];
  for(const candidate of candidates.slice(0,maxCandidates)){
    if(!candidate?.program||!candidate.input)throw new Error('candidate.shape');
    const key=digest({program:candidate.program,input:candidate.input});if(seen.has(key))throw new Error('candidate.duplicate');seen.add(key);
    const signature=digest(candidate.program.params)===digest(program.params)&&candidate.program.returns===program.returns;
    const decreases=verify(candidate.program).ok&&signature&&smaller(measure(candidate.program,candidate.input),baseMeasure);
    const result=decreases?inspectWitness(candidate.program,candidate.input,transform,{contract,fuel}):{status:'NOT_INTERESTING',reason:'not a legal signature-preserving decrease'};
    results.push({candidate:key,measure:decreases?measure(candidate.program,candidate.input):null,...result});
  }
  const unstarted=candidates.length-results.length,unresolved=results.filter(x=>x.status==='UNRESOLVED').length,interesting=results.filter(x=>x.status==='INTERESTING').length;
  return {base,measure:baseMeasure,candidates:digest(candidates),planned:candidates.length,started:results.length,unstarted,unresolved,interesting,results,
    status:base.status!=='INTERESTING'?'BASE_NOT_ESTABLISHED':interesting?'SMALLER_WITNESS':unstarted||unresolved?'UNRESOLVED':'NO_SMALLER_IN_LIST',
    limitation:'The caller must establish that the supplied list covers the declared reduction family. No global-minimum claim.'};
}
