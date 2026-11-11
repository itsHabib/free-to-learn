import { directory, establish, exchange, deliverForward, deliverBackward, sampleRequest, tamper, recover, views } from './network.mjs';
import { evaluate } from '../checks/cases.mjs';

export const transferCases = [
  {id:'A',entry:[0,4,13,18],tolerance:1,candidates:[
    {id:'A',times:[50,54,63,68]},{id:'B',times:[80,85,93,98]},{id:'C',times:[100,104,114,121]}]},
  {id:'B',entry:[0,1,2,3],tolerance:0,candidates:[
    {id:'P',times:[20,21,22,23]},{id:'Q',times:[60,61,62,63]},{id:'R',times:[90,91,92,93]}]},
];
function observe(action) {
  try { return {outcome:'returned',value:action()}; }
  catch(error) {return {outcome:'threw',code:error.code??error.name,detail:error.message};}
}
export async function capstoneReport(impl) {
  const checks=await evaluate(impl);
  if(checks.passed!==checks.total) return {mode:'learner-build',checks,scenarios:'NOT RUN: repair the failed requirements first.'};
  const c=establish(impl.selectPath(directory()));
  const reply=exchange(impl,c,{operation:'lookup',item:'tide'});
  const binding=establish(impl.selectPath(directory()));
  const reply7={record:'response to request 7'}, reply8={record:'response to request 8'};
  const packet7=deliverBackward(impl,binding,reply7,7), packet8=deliverBackward(impl,binding,reply8,8);
  const wrongRequest=observe(()=>impl.unwrapReply(binding.hops,packet7,8));
  const matching8=observe(()=>impl.unwrapReply(binding.hops,packet8,8));
  const matching7=observe(()=>impl.unwrapReply(binding.hops,packet7,7));
  const integrity=establish(impl.selectPath(directory()));
  const packet=impl.wrapRequest(integrity.hops,sampleRequest(),0),state=integrity.states[0];
  const changed=observe(()=>impl.peelForward(state,tamper(packet)));
  const seenAfterChanged=[...state.seenForward];
  const original=observe(()=>impl.peelForward(state,packet));
  const seenAfterOriginal=[...state.seenForward];
  const repeated=observe(()=>impl.peelForward(state,packet));
  // Do not report full ciphertext or key handles: only observations relevant to the argument.
  delete original.value;
  const broken=establish(impl.selectPath(directory()));
  const oldPacket=impl.wrapRequest(broken.hops,sampleRequest(),0);
  const failed=broken.path[1];
  const failure=observe(()=>deliverForward(impl,broken,oldPacket,{failAt:failed}));
  const replacement=recover(impl,broken,directory(),[failed]);
  const oldOnNew=observe(()=>impl.peelForward(replacement.circuit.states[0],oldPacket));
  const recoveredReply=exchange(impl,replacement.circuit);
  const lost=establish(impl.selectPath(directory()));
  const lostReply=observe(()=>exchange(impl,lost,sampleRequest(),{dropReply:true}));
  return {
    mode:'learner-build; offline simulation',checks,
    working:{path:c.path,reply,views:views(c)},
    replyBinding:{packetSequence:7,expectedSequence:8,wrongRequest,matching8,matching7,
      scope:'Matched requests may be unwrapped out of order. Replay acceptance is separate receiver state.'},
    integrity:{changed,seenAfterChanged,original,seenAfterOriginal,repeated},
    recovery:{failure,failedRelay:failed,oldCircuitId:broken.id,oldClosed:broken.closed,
      newCircuitId:replacement.circuit.id,newPath:replacement.circuit.path,oldOnNew,recoveredReply,
      noPath:impl.recoveryPlan(directory(),['cedar','birch','maple'],['cedar','birch','maple'])},
    lostReply:{client:lostReply,archiveEvents:views(lost).archive},
    transfer:transferCases.map(s=>({...s,retained:impl.correlate(s.entry,s.candidates,s.tolerance)})),
    reasoning:'UNASSESSED: complete REPORT-TEMPLATE.md and apply CAPSTONE.md rubric.',
  };
}
