import {clone, exactKeys, hex64, fixture, sha256, verifyVote} from './support.mjs';

export const validVote = vote => exactKeys(vote, ['height','blockId']) &&
  Number.isSafeInteger(vote.height) && vote.height >= 0 && hex64(vote.blockId);
export const sameVote = (a,b) => a.height === b.height && a.blockId === b.blockId;

// The model owns persistence and transport; the learner owns the ordered plan.
// Each persist atomically becomes durable before the next effect. A crash cuts
// between effects, discarding the unexecuted suffix, never committed journal data.
export function executePlan(planVote, journal, request, {cut=Infinity,failPersist=false}={}) {
  const durable=clone(journal), sent=[], trace=[];
  const decision=planVote(clone(journal),clone(request));
  if (!decision || typeof decision.ok !== 'boolean') throw new Error('planVote must return an ok decision');
  if (!decision.ok) {
    if (!exactKeys(decision,['ok','code']) || !['JOURNAL','REQUEST','CONFLICT'].includes(decision.code)) throw new Error('Invalid rejection decision');
    return {durable,sent,trace:[{event:'reject',code:decision.code}],decision};
  }
  if (!exactKeys(decision,['ok','effects']) || !Array.isArray(decision.effects) || decision.effects.length > 2) throw new Error('A successful plan needs at most two effects');
  for (const [index,effect] of decision.effects.entries()) {
    if (index >= cut) { trace.push({event:'crash',beforeEffect:index}); break; }
    if (!exactKeys(effect,['type','vote']) || !['persist','send'].includes(effect.type) || !validVote(effect.vote) || !sameVote(effect.vote,request)) throw new Error('Effects must persist/send only the requested vote');
    if (effect.type === 'persist') {
      if (failPersist) { trace.push({event:'persist-failed',vote:clone(effect.vote)}); break; }
      durable.push(clone(effect.vote));
    }
    if (effect.type === 'send') sent.push(clone(effect.vote));
    trace.push({event:effect.type,vote:clone(effect.vote)});
  }
  return {durable,sent,trace,decision};
}

export function conflicts(votes) {
  return votes.some((a,i)=>votes.slice(i+1).some(b=>a.height===b.height && a.blockId!==b.blockId));
}

// This deliberately wrong ordering is a public counterexample, not a solution.
export function sendBeforePersist(journal,request) {
  const old=journal.find(v=>v.height===request.height);
  if(old && !sameVote(old,request)) return {ok:false,code:'CONFLICT'};
  return {ok:true,effects:[{type:'send',vote:clone(request)},...(old?[]:[{type:'persist',vote:clone(request)}])]};
}

// Finite, reproducible schedule of requests/cuts. Signatures vary per process,
// while the votes, journal decisions and certificate membership stay the same.
export function restartIncident(planVote,verifyCertificate,{rollback=false,transfer=false}={}) {
  const f=fixture();
  const height=transfer?19:7;
  const x={height,blockId:sha256(transfer?'transfer-left':'restart-left')};
  const y={height,blockId:sha256(transfer?'transfer-right':'restart-right')};
  const [byzantine,restarted,leftOnly,rightOnly]=transfer?['d','c','b','a']:['a','b','c','d'];
  const cuts=[0,1,2];
  const rows=cuts.map(cut=>{
    const first=executePlan(planVote,[],x,{cut});
    const recovered=rollback?[]:first.durable;
    const second=executePlan(planVote,recovered,y);
    const emitted=[...first.sent,...second.sent];
    const votesX=[f.vote(byzantine,height,x.blockId),f.vote(leftOnly,height,x.blockId)];
    const votesY=[f.vote(byzantine,height,y.blockId),f.vote(rightOnly,height,y.blockId)];
    for(const vote of emitted) {
      if(sameVote(vote,x)) votesX.push(f.vote(restarted,height,x.blockId));
      if(sameVote(vote,y)) votesY.push(f.vote(restarted,height,y.blockId));
    }
    const certificateX=verifyCertificate(votesX,height,x.blockId,f.ctx);
    const certificateY=verifyCertificate(votesY,height,y.blockId,f.ctx);
    if(typeof certificateX!=='boolean'||typeof certificateY!=='boolean') throw new Error('verifyCertificate must return boolean');
    return {cut,first:first.trace,recoveredJournal:clone(recovered),second:second.trace,
      votesX,votesY,allSignaturesAuthentic:[...votesX,...votesY].every(v=>verifyVote(v,f.ctx)),
      certificateX,certificateY,conflictingCertificates:certificateX&&certificateY,
      restartedValidatorEquivocated:conflicts(emitted)};
  });
  return {height,x,y,roles:{byzantine,restarted,leftOnly,rightOnly},rollback,
    publicKeys:Object.fromEntries([...f.ctx.publicKeys].map(([name,key])=>[name,key.export({format:'pem',type:'spki'})])),rows,
    scope:'Finite in-memory crash model; keys survive modeled crashes within one process. No actual fsync, process restart, network, block-validity, round-change or general-finality claim.'};
}
