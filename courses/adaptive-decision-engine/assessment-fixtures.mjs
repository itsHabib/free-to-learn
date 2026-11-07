import {episode,initial,violations} from './game.mjs';
import {replayRecordedStep} from './audit.mjs';
export function makeDefeatFixture(seed='audit-defeat'){
 let state=initial(seed,'steady',seed);const decisions=[];
 while(!state.terminal){
  const why=violations(state,'brute');const next=replayRecordedStep(state,'brute','press');
  decisions.push({proposed:'brute',executed:'brute',proposalViolations:why,executedViolations:why,reason:'supported',calls:1,latencyMs:2,origin:'constructed-authority-fault',revision:state.revision});state=next.state;
 }
 return {id:seed,seed,profile:'steady',bot:'constructed-fault',termination:'defeated',events:state.history,decisions,final:state};
}
export function makeCountFixture(seed='audit-counts'){
 return episode(state=>({action:{kind:'brute'},memory:{},reason:state.round%2?'timeout':'unavailable',calls:state.round%3,latencyMs:state.round+.25,origin:'synthetic-fixture'}),{seed});
}
