// Supplied finite-domain enumeration; no solver or random sampling is hidden here.
import {clone,digest,literal,validateInput,verify} from './runtime.mjs';
const shape=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
export function expandDomain(program,manifest,contract={}) {
  if(!verify(program).ok)throw new Error('domain.invalid_program');
  if(!shape(manifest,['version','axes','heaps'])||manifest.version!==1||!Array.isArray(manifest.axes)||!Array.isArray(manifest.heaps)||manifest.heaps.length===0)throw new Error('domain.shape');
  if(manifest.axes.length!==program.params.length||new Set(manifest.axes.map(a=>a.parameter)).size!==manifest.axes.length)throw new Error('domain.parameters');
  const axes=manifest.axes.map(axis=>{
    const parameter=program.params.find(p=>p.id===axis.parameter);if(!parameter)throw new Error('domain.unknown_parameter');
    let values;
    if(shape(axis,['parameter','values'])){if(!Array.isArray(axis.values))throw new Error('domain.values');values=clone(axis.values);}
    else if(shape(axis,['parameter','range'])&&shape(axis.range,['from','to','step'])&&['i8','i32'].includes(parameter.type)){
      const from=literal(parameter.type,axis.range.from),to=literal(parameter.type,axis.range.to),step=literal(parameter.type,axis.range.step);
      if(step===0n||to<from||(to-from)/step+1n>65536n)throw new Error('domain.range_limit');
      values=[];for(let value=from;value<=to;value+=step)values.push(value.toString());
    }else throw new Error('domain.axis_shape');
    if(!values.length||new Set(values.map(digest)).size!==values.length)throw new Error('domain.empty_or_duplicate_axis');
    return {parameter:parameter.id,values};
  });
  if(new Set(manifest.heaps.map(digest)).size!==manifest.heaps.length)throw new Error('domain.duplicate_heap');
  const count=axes.reduce((n,a)=>n*BigInt(a.values.length),BigInt(manifest.heaps.length));if(count>65536n)throw new Error('domain.case_limit');
  let argumentsList=[{}];for(const axis of axes)argumentsList=argumentsList.flatMap(args=>axis.values.map(value=>({...args,[axis.parameter]:value})));
  const inputs=argumentsList.flatMap(args=>manifest.heaps.map(heap=>({args:clone(args),heap:clone(heap)})));
  for(const input of inputs)validateInput(program,input,contract);
  return {inputs,evidence:{kind:'finite-cartesian',manifest:clone(manifest),manifestIdentity:digest(manifest),inputIdentity:digest(inputs),planned:Number(count),distinct:inputs.length,order:'axis order, each listed value in order, then heap order'}};
}
export function normalizeJob(job) {
  if(!job||typeof job!=='object'||Object.keys(job).some(k=>!['program','inputs','domain','contract'].includes(k))||!job.program||Object.hasOwn(job,'inputs')===Object.hasOwn(job,'domain'))throw new Error('job: provide exactly one of inputs or domain');
  const contract=job.contract??{};
  if(Object.hasOwn(job,'domain')){const expanded=expandDomain(job.program,job.domain,contract);return {program:job.program,contract,...expanded};}
  if(!Array.isArray(job.inputs))throw new Error('job.inputs');
  return {program:job.program,contract,inputs:job.inputs,evidence:{kind:'explicit-list',inputIdentity:digest(job.inputs),planned:job.inputs.length,distinct:new Set(job.inputs.map(digest)).size}};
}
