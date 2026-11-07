// Supplied runtime state machine. A selected encounter is data, not a live request.
import {copy,hash,canonical} from './shared.mjs';
import {legal,validate} from './game.mjs';
const same=(a,b)=>canonical(a)===canonical(b);
export function bindSelection(state,memory,decision,source,playMode){
 validate(state);
 if(state.terminal)throw Error('Cannot bind a selection to a terminal state');
 if(decision.memory!==undefined&&!same(decision.memory,memory))throw Error('Selection memory does not match checkpoint memory');
 const permitted=legal(state),proposed=decision.proposed??decision.action?.kind;
 const executed=permitted.includes(proposed)?proposed:'rest';
 if(decision.executed!==executed||!permitted.includes(executed))throw Error('Selection does not match authoritative action filtering');
 return {version:1,episodeId:state.episodeId,revision:state.revision,stateHash:hash(state),memoryHash:hash(memory),source,playMode,decisionHash:hash(decision),decision:copy(decision)};
}
export function snapshotRecovery(record,selection,source,playMode){
 if(record.state.terminal)return {version:1,phase:'terminal',selection:null};
 if(!selection)return {version:1,phase:'unselected',selection:null};
 const result=restoreSelection({...record,playMode,recovery:{version:1,phase:'selected',selection}},{source},playMode);
 if(!result.choice)throw Error('Selected checkpoint could not retain its encounter');
 return {version:1,phase:'selected',selection:copy(selection)};
}
export function restoreSelection(record,identities,playMode){
 const saved=record.recovery;
 if(record.state.terminal){if(saved&&saved.phase!=='terminal')throw Error('Checkpoint phase disagrees with terminal state');return {phase:'terminal',choice:null,selection:null};}
 if(!saved)return {phase:'legacy-unselected',choice:null,selection:null,notice:'Legacy checkpoint has no saved encounter. State and memory were restored without running the policy. Choose a new encounter explicitly to continue.'};
 if(saved.version!==1||!['selected','unselected','terminal'].includes(saved.phase))throw Error('Unknown checkpoint recovery state');
 if(saved.phase==='terminal')throw Error('Nonterminal checkpoint cannot have terminal phase');
 if(saved.phase!=='selected')return {phase:'unselected',choice:null,selection:null,notice:'State and memory restored. Choose an encounter to continue.'};
 const item=saved.selection;
 if(!item||item.version!==1||item.episodeId!==record.state.episodeId||item.revision!==record.state.revision||item.stateHash!==hash(record.state)||item.memoryHash!==hash(record.memory)||item.source!==identities.source)throw Error('Saved encounter binding does not match checkpoint state, memory or source');
 if(item.playMode!==playMode)return {phase:'unselected',choice:null,selection:null,notice:'Director mode changed explicitly. The old encounter was not rerun; choose a new encounter to continue.'};
 const checked=bindSelection(record.state,record.memory,item.decision,item.source,item.playMode);
 if(!same(checked,item))throw Error('Saved encounter is inconsistent');
 return {phase:'selected',choice:copy(item.decision),selection:copy(item)};
}
export function selectionScheduler(memory){
 const source=memory?.scheduler;
 if(source)return {...copy(source),pending:null,armed:false};
 return {used:0,maxRequests:2,serial:0,timeoutMs:25,pending:null,armed:false};
}
