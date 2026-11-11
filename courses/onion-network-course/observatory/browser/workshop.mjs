// Ordered, entirely in-process experiments. This schedules the existing learner protocol.
import {requireThat,LabError} from './crypto.mjs';
import {directory,establish,closeCircuit,deliverForward,deliverBackward,archive,recover} from './network.mjs';

const relayIds=directory().map(r=>r.id);
const fields={open:['circuit','length','avoid'],send:['circuit','packet','item','fault'],
  replay:['circuit','packet'],offline:['relays'],online:['relays'],recover:['circuit','replacement','failed'],close:['circuit']};
const fail=message=>{throw new LabError('BAD_SCENARIO',message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function only(value,keys,label) {
  if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(`${label}: use only ${keys.join(', ')}.`);
}
function alias(value,label) {if(typeof value!=='string'||!(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/).test(value))fail(`${label}: use a short letter-led name.`);}
function relays(value,label) {if(!Array.isArray(value)||value.some(x=>!relayIds.includes(x))||new Set(value).size!==value.length)fail(`${label}: use distinct supplied relay names.`);}
export function validateWorkshop(input) {
  only(input,['version','title','predictions','steps'],'Scenario');
  if(input.version!==1||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)fail('Use version 1 and a title of 1–160 characters.');
  if(!Array.isArray(input.predictions)||input.predictions.length>12)fail('Use a predictions array (up to 12 claims).');
  for(const p of input.predictions) {
    only(p,['observer','claim'],'Prediction');
    if(!['client','archive','operator',...relayIds].includes(p.observer)||typeof p.claim!=='string'||!p.claim.trim()||p.claim.length>2000)fail('Each prediction needs a supplied observer and a claim of 1–2000 characters.');
  }
  if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>32)fail('Use 1–32 ordered steps.');
  for(const [i,s] of input.steps.entries()) {
    const label=`Step ${i+1}`;
    if(!object(s)||!Object.hasOwn(fields,s.action))fail(`${label}: unknown action.`);
    only(s,['action',...fields[s.action]],label);
    for(const key of ['circuit','packet','replacement'])if(fields[s.action].includes(key))alias(s[key],`${label} ${key}`);
    if(s.action==='open') {if(![2,3,4].includes(s.length))fail(`${label}: length must be 2, 3 or 4.`);relays(s.avoid,`${label} avoid`);}
    if(['online','offline'].includes(s.action))relays(s.relays,`${label} relays`);
    if(s.action==='recover')relays(s.failed,`${label} failed`);
    if(s.action==='send') {
      if(!['luna','tide'].includes(s.item))fail(`${label}: choose luna or tide.`);
      if(s.fault!==undefined) {
        only(s.fault,['kind','hop'],`${label} fault`);
        if(!['drop-forward','corrupt-forward','drop-reply'].includes(s.fault.kind))fail(`${label}: unknown fault.`);
        if(s.fault.kind==='drop-reply') {if(s.fault.hop!==undefined)fail(`${label}: drop-reply has no hop.`);}
        else if(!Number.isInteger(s.fault.hop)||s.fault.hop<0||s.fault.hop>3)fail(`${label}: hop is a zero-based index from 0 to 3.`);
      }
    }
  }
  const created=input.steps.filter(s=>['open','recover'].includes(s.action));
  const names=created.map(s=>s.action==='open'?s.circuit:s.replacement);
  if(names.length>8||new Set(names).size!==names.length)fail('Use at most 8 distinct circuit names; never replace an earlier name.');
  const packets=input.steps.filter(s=>s.action==='send').map(s=>s.packet);
  if(new Set(packets).size!==packets.length)fail('Every send needs a new packet name. Use replay to repeat captured bytes.');
  return structuredClone(input);
}

export const workshopContract={id:'multi-circuit-workshop-v1',version:1,
  requirement:'Run learner-authored ordered steps with the submitted protocol; keep failed steps and observer-scoped evidence. Written claims are unassessed.',
  semantics:'Sequential logical steps, not time or concurrent network simulation. Explicit recovery only; no automatic retry. Relay downtime is known to the experiment operator. Client sees no reply without the hidden fault cause. Packet replay sends captured forward bytes; new sends allocate a fresh sequence. Existing module contracts still apply.',
  limits:{steps:32,circuits:8,predictions:12},actions:fields};

export async function runWorkshop(impl,input) {
  const scenario=validateWorkshop(input),network=directory(),circuits=new Map(),captures=new Map();
  const observations=Object.fromEntries(['client',...relayIds,'archive'].map(id=>[id,[]]));
  const steps=[];
  let index=0;
  const record=(observer,event)=>observations[observer]?.push({step:index+1,...event});
  const snapshot=c=>({id:c.id,path:[...c.path],closed:c.closed,nextSeq:c.nextSeq,received:[...c.received],
    relayState:c.states.map(s=>({relay:s.relayId,seen:[...s.seenForward]}))});
  function circuit(name) {requireThat(circuits.has(name),'UNKNOWN_CIRCUIT',name);return circuits.get(name);}
  async function forward(c,name,packet,expectedSeq,fault={},clientWaiting=true) {
    const start=c.trace.length;
    let reachedClient=false;
    try {
      const destination=fault.hop===undefined?null:c.path[fault.hop];
      requireThat(fault.hop===undefined||destination,'BAD_HOP','The selected hop is outside this actual path.');
      const failed=c.path.find(id=>!network.find(r=>r.id===id).online);
      const request=await deliverForward(impl,c,packet,{failAt:failed,
        dropAt:fault.kind==='drop-forward'?destination:null,modifyAt:fault.kind==='corrupt-forward'?destination:null,
        onReceive:event=>record(event.observer,{...event,circuit:name,direction:'forward'})});
      let reply;
      try {reply=archive(request);}
      catch(error) {record('archive',{circuit:name,phase:'rejected',payload:request,code:error.code??error.name});throw error;}
      c.trace.push({direction:'endpoint',observer:'archive',previous:c.path.at(-1),payload:request});
      if(fault.kind==='drop-reply')throw new LabError('REPLY_LOST','Archive received the read-only lookup.');
      const response=await deliverBackward(impl,c,reply,expectedSeq);
      reachedClient=true;
      // Preserve accepted request binding at every return layer, including replay experiments.
      const unwrapped=await impl.unwrapReply(c.hops,response,expectedSeq);
      requireThat(!c.received.has(expectedSeq),'REPLAY');c.received.add(expectedSeq);
      record('client',{circuit:name,phase:'reply',seq:expectedSeq,payload:unwrapped});
      return unwrapped;
    } catch(error) {
      if(clientWaiting)record('client',{circuit:name,phase:'no-reply',detail:'No usable reply observed. The hidden fault cause and endpoint receipt are not established by this observation.'});
      if(!clientWaiting&&reachedClient)record('client',{circuit:name,phase:'rejected-reply',code:error.code??error.name});
      throw error;
    } finally {
      for(const event of c.trace.slice(start))record(event.observer,{...event,circuit:name,phase:'accepted'});
    }
  }
  try {
    for(index=0;index<scenario.steps.length;index++) {
      const action=scenario.steps[index],entry={step:index+1,input:action};
      try {
        if(action.action==='open') {
          const path=await impl.selectPath(network,action.avoid,action.length),c=establish(path,network);
          circuits.set(action.circuit,c);entry.value={path};record('client',{phase:'opened',circuit:action.circuit,path});
        }
        if(['offline','online'].includes(action.action)) {
          for(const id of action.relays)network.find(r=>r.id===id).online=action.action==='online';
          entry.value={relays:action.relays,online:action.action==='online'};
          // This is operator fault injection, not an oracle supplied to every observer.
        }
        if(action.action==='send') {
          const c=circuit(action.circuit);requireThat(!c.closed,'CIRCUIT_CLOSED');
          requireThat(action.fault?.hop===undefined||action.fault.hop<c.path.length,'BAD_HOP');
          const seq=c.nextSeq++;requireThat(seq<1024,'REBUILD_REQUIRED');
          const packet=await impl.wrapRequest(c.hops,{operation:'lookup',item:action.item},seq);
          captures.set(action.packet,{packet:structuredClone(packet),origin:action.circuit,seq});
          record('client',{phase:'sent',circuit:action.circuit,seq,item:action.item});
          entry.value=await forward(c,action.circuit,packet,seq,action.fault);
        }
        if(action.action==='replay') {
          requireThat(captures.has(action.packet),'UNKNOWN_PACKET',action.packet);
          const c=circuit(action.circuit);requireThat(!c.closed,'CIRCUIT_CLOSED');
          // Replay is experiment-operator injection; it is not a new client send or new encryption.
          const captured=captures.get(action.packet);
          entry.value=await forward(c,action.circuit,structuredClone(captured.packet),captured.seq,{},false);
        }
        if(action.action==='recover') {
          const old=circuit(action.circuit);requireThat(!old.closed,'CIRCUIT_CLOSED');
          record('client',{phase:'recovery-requested',circuit:action.circuit,failed:action.failed});
          const next=await recover(impl,old,network,action.failed);
          if(next.circuit)circuits.set(action.replacement,next.circuit);
          entry.value={plan:next.plan,oldClosed:old.closed,replacement:next.circuit?action.replacement:null};
          record('client',{phase:'recovered',circuit:action.circuit,...entry.value});
        }
        if(action.action==='close') {
          closeCircuit(circuit(action.circuit));entry.value={closed:true};record('client',{phase:'closed',circuit:action.circuit});
        }
        entry.outcome='returned';
      } catch(error) {entry.outcome='threw';entry.code=error.code??error.name;entry.detail=error.message;}
      entry.state=Object.fromEntries([...circuits].map(([name,c])=>[name,snapshot(c)]));
      steps.push(entry);
    }
    return {kind:'workshop',title:scenario.title,contract:workshopContract.id,predictions:scenario.predictions,
      reasoning:'UNASSESSED: compare your claims with observer evidence; step errors are experimental outcomes, not a course score.',
      steps,observations,circuits:Object.fromEntries([...circuits].map(([name,c])=>[name,snapshot(c)])),
      captures:[...captures].map(([name,c])=>({name,origin:c.origin,seq:c.seq})),
      visibility:'Operator-only steps and state contain the fault script and all circuits. Observer projections contain their local evidence. Shared step numbers and circuit names are teaching labels, not wire identifiers or timing measurements. Single-process simulation; no anonymity guarantee.',
      cleanup:'All remaining circuit key handles are discarded after this snapshot; closed fields describe the end of the authored steps.'};
  } finally {for(const c of circuits.values())closeCircuit(c);}
}
