import { digest, run, equivalent, observation, cost, verify } from './runtime.mjs';
import { checkChain } from './editor.mjs';
export function validate(before, after, inputs, options = {}) {
  const { contract = {}, fuel = 10000, mode = 'exhaustive', maxCases = 4096, totalFuel = 2000000 } = options;
  if(!Array.isArray(inputs)||!Number.isSafeInteger(maxCases)||maxCases<1||maxCases>65536||!Number.isSafeInteger(totalFuel)||totalFuel<0||totalFuel>2000000)throw new Error('validation.invalid_domain_or_budget');
  const base = { semantics: 'kernel-ir/1', before: digest(before), after: digest(after), contract: digest(contract), domain: digest(inputs), mode, fuel,
    counts: { planned: inputs.length, started: 0, equal: 0, different: 0, unknown: 0, invalid: 0, unstarted: inputs.length }, cases: [] };
  const invalid = reason => ({ ...base, status: 'INVALID', reason, complete: false });
  if (!verify(before).ok || !verify(after).ok) return invalid('Invalid program');
  if (!inputs.length || new Set(inputs.map(digest)).size !== inputs.length || !['exhaustive','sample'].includes(mode)) return invalid('Empty, duplicate, or malformed domain');
  let remaining=totalFuel;
  for (const input of inputs.slice(0, maxCases)) {
    if(remaining<=0)break;
    const source = run(before,input,{fuel:Math.min(fuel,remaining),contract});remaining-=source.steps??0;
    const target = run(after,input,{fuel:Math.min(fuel,remaining),contract});remaining-=target.steps??0;
    base.counts.started++; base.counts.unstarted--;
    const entry = { input, source, target };
    if (source.kind === 'invalid' || target.kind === 'invalid') { base.counts.invalid++; entry.status='invalid'; }
    else if (!observation(source) || !observation(target)) { base.counts.unknown++; entry.status='unknown'; }
    else if (equivalent(source,target)) { base.counts.equal++; entry.status='equal'; }
    else { base.counts.different++; entry.status='different'; }
    base.cases.push(entry);
  }
  if (base.counts.invalid) return {...base,status:'INVALID',reason:'Invalid invocation',complete:false};
  const complete = !base.counts.unknown && !base.counts.unstarted;
  const status = base.counts.different ? 'COUNTEREXAMPLE' : !complete ? 'UNKNOWN' : mode === 'sample' ? 'SAMPLED_NO_DIFFERENCE' : 'EXHAUSTIVE_WITHIN_DOMAIN';
  return {...base,status,complete};
}
export function reportFor(before, artifact, inputs, options = {}) {
  const validation = validate(before,artifact.program,inputs,options);
  const proof = checkChain(before,artifact,options.contract ?? {});
  const beforeCost = validation.cases.reduce((s,c)=>s+cost(c.source),0), afterCost=validation.cases.reduce((s,c)=>s+cost(c.target),0);
  return { validation, proof, identitiesCurrent:true, cost:{complete:validation.complete,before:beforeCost,after:afterCost,model:'unit IR operations',sameWorkload:true}, artifact };
}
export function wrongResult(program,input,transform) {
  try {
    const target=transform(program); if(!verify(program).ok || !verify(target).ok) return false;
    const a=run(program,input,{fuel:10000}),b=run(target,input,{fuel:10000});
    return a.kind==='return' && b.kind==='return' && (a.type!==b.type || a.value!==b.value || digest(a.heap)!==digest(b.heap));
  } catch { return false; }
}
// Legacy helper name uses the same semantic vector; compare with smaller().
export { measure as size } from './investigation.mjs';
