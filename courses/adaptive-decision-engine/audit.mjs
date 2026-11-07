import {CARDS,copy,canonical,targetAt} from './shared.mjs';
import {initial,hazard,violations} from './game.mjs';
const fail=message=>{throw Error('invalid episode: '+message);};
const equal=(a,b)=>canonical(a)===canonical(b);
// Audit physics can reconstruct a recorded authority violation. It never commits a game action.
export function replayRecordedStep(state,kind,move){
 const card=CARDS[kind];if(!card)fail('unknown executed action');
 if(state.terminal)fail('transition after termination');
 const s=copy(state),before={health:s.health,supplies:s.supplies,charge:s.charge,budget:s.budget};
 let damage=0,charge=0,h=null;
 if(kind==='rest'){if(move!=='rest')fail('rest move mismatch');s.health=Math.min(12,s.health+2);s.supplies=Math.min(4,s.supplies+1);}
 if(kind!=='rest'){
  if(!['press','brace','repair'].includes(move))fail('unknown player move');
  h=hazard(s.seed,s.round);damage=card.threat+h;charge=card.reward;
  if(move==='brace'){damage=Math.max(0,damage-2);charge=Math.max(0,charge-1);}
  if(move==='repair'){if(!s.supplies)fail('repair without supply');s.supplies--;s.health=Math.min(12,s.health+3);damage=Math.max(0,damage-1);charge=0;}
  s.health=Math.max(0,s.health-damage);s.charge+=charge;
 }
 s.budget-=card.cost;
 if(s.budget<0)fail('negative recorded budget');
 const pressure=.6*(12-s.health)/12+.4*Math.min(1,[...s.history.slice(-2).map(e=>e.damage),damage].reduce((a,b)=>a+b,0)/6);
 const event={round:s.round,revision:s.revision,kind,move,hazard:h,damage,charge,before,after:{health:s.health,supplies:s.supplies,charge:s.charge,budget:s.budget},pressure,target:targetAt(s.profile,s.round,s.targetSchedule)};
 s.round++;s.revision++;s.terminal=s.health===0||s.round===12;s.history.push(event);
 return {state:s,event};
}
export function auditEpisode(ep){
 if(!ep||typeof ep.id!=='string'||!ep.id||typeof ep.seed!=='string'||!Array.isArray(ep.events)||!Array.isArray(ep.decisions)||ep.events.length!==ep.decisions.length||!ep.events.length||ep.events.length>12)fail('identity or event/decision count');
 if(!['steady','pulse'].includes(ep.profile)||typeof ep.bot!=='string'||!ep.bot)fail('unknown episode environment');
 let state=initial(ep.seed,ep.profile,ep.id,{targetSchedule:ep.targetSchedule,requestLimit:ep.requestLimit});
 for(let i=0;i<ep.events.length;i++){
  const event=ep.events[i],d=ep.decisions[i];
  if(d.revision!==state.revision||d.executed!==event.kind)fail('decision/revision mismatch at '+i);
  if(!Number.isInteger(d.calls)||d.calls<0||!Number.isFinite(d.latencyMs)||d.latencyMs<0)fail('invalid request accounting at '+i);
  for(const key of ['duplicateEffects','staleEffects'])if(d[key]!==undefined&&(!Number.isInteger(d[key])||d[key]<0))fail('invalid effect counter');
  const proposed=violations(state,d.proposed),executed=violations(state,event.kind);
  if(!equal(d.proposalViolations,proposed)||!equal(d.executedViolations,executed))fail('inconsistent violation accounting at '+i);
  const next=replayRecordedStep(state,event.kind,event.move);
  if(!equal(event,next.event))fail('transition discontinuity or altered event at '+i);
  state=next.state;
 }
 if(!state.terminal)fail('nonterminal prefix is not a complete episode');
 const termination=state.health===0?'defeated':'completed';
 if(ep.termination!==termination)fail('terminal reason mismatch');
 if(!ep.final||!equal(ep.final,state))fail('final state/history mismatch');
 return true;
}
