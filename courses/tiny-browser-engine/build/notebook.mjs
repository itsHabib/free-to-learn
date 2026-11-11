export const NOTEBOOK_VERSION=1;
export const fresh=()=>({version:NOTEBOOK_VERSION,revision:0,draft:'',events:[],notes:''});
export function validate(value){
 if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.events)||typeof value.draft!=='string'||typeof value.notes!=='string')throw Error('Unrecognized notebook format.');
 if(value.draft.length>131072||value.notes.length>12000||value.events.length>160||JSON.stringify(value).length>4000000)throw Error('Notebook exceeds the local evidence limit. Export the existing notebook before starting another.');
 const ids=new Map();
 for(const e of value.events){
  if(!e||typeof e.id!=='string'||ids.has(e.id)||!['submit','result','quiz','prediction','note','interaction','interaction-result'].includes(e.kind))throw Error('Invalid or duplicate notebook event.');
  if(e.kind==='submit'&&(typeof e.source!=='string'||e.source.length>131072||!(/^[a-f0-9]{64}$/).test(e.sourceHash)||!(/^[a-f0-9]{64}$/).test(e.packetHash)||!e.packet||JSON.stringify(e.packet).length>262144))throw Error('Submission source, packet or hashes are missing.');
  if(e.kind==='result'&&(ids.get(e.forSubmit)!=='submit'||!e.output||JSON.stringify(e.output).length>262144))throw Error('Result is missing its earlier submission or is too large.');
  if(e.kind==='interaction'&&(ids.get(e.forSubmit)!=='submit'||!e.input||JSON.stringify(e.input).length>262144))throw Error('Interaction is missing its source submission or bounded input.');
  if(e.kind==='interaction-result'&&(ids.get(e.forInteraction)!=='interaction'||!e.output||JSON.stringify(e.output).length>262144))throw Error('Interaction result is missing its input or bounded output.');
  ids.set(e.id,e.kind);
 }
 return structuredClone(value);
}
export function append(book,event){
 const next=structuredClone(book);next.revision++;next.events.push({...structuredClone(event),id:`event-${next.revision}-${next.events.length+1}`});return validate(next);
}
export function updateDraft(book,draft,notes=book.notes){const next=structuredClone(book);next.revision++;next.draft=draft;next.notes=notes;return validate(next);}
export function merge(book,incoming){
 incoming=validate(incoming);let merged=append(book,{kind:'note',text:'Draft preserved before notebook import.',draftBackup:book.draft});const mapping=new Map();
 for(const event of incoming.events){const value={...event,imported:true};delete value.id;if(value.forSubmit)value.forSubmit=mapping.get(value.forSubmit);if(value.forInteraction)value.forInteraction=mapping.get(value.forInteraction);merged=append(merged,value);mapping.set(event.id,merged.events.at(-1).id);}
 return updateDraft(merged,incoming.draft,incoming.notes);
}
