import {zipFiles} from './zip.mjs';
import {canonical} from './shared.mjs';
export const WORK_FILES=['observe.mjs','constraints.mjs','rules.mjs','adapter.mjs','confidence.mjs','evaluate.mjs','schedule.mjs','director.mjs','project.mjs','scenarios.json','REPORT.md','evaluation-plan.json','results.json','checkpoint.json','project-plan.json'];
export async function sha256(text){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function identity(sources){return sha256(JSON.stringify(Object.entries(sources).sort(([a],[b])=>a.localeCompare(b))));}
// Storage format 2 interns exact source strings; the in-memory/learner schema stays 1.
// Limits are bytes of UTF-8 JSON, including escaping. No history is discarded.
export const SESSION_INPUT_LIMIT=40000000; // Legacy pretty-printed exports may exceed 20 MB on disk.
const STORED_LIMIT=20000000, EXPANDED_LIMIT=128000000, MAX_ATTEMPTS=1000;
const encoding='source-text-table/1', encoder=new TextEncoder();
const jsonBytes=value=>encoder.encode(JSON.stringify(value)).length;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function sourceEntries(sources){
 if(!record(sources))throw Error('Invalid source snapshot');
 const entries=Object.entries(sources);
 for(const [name,text] of entries){
  if(!WORK_FILES.includes(name)||typeof text!=='string'||text.length>(name==='results.json'?8000000:200000))throw Error('Unexpected or oversized work file');
 }
 return entries;
}
function packedSession(session){
 if(session?.schema!==1||!Array.isArray(session.attempts)||session.attempts.length>MAX_ATTEMPTS)throw Error('Invalid session schema');
 const texts=[],indices=new Map(),lengths=[];
 let expansion=0;
 const refs=sources=>Object.fromEntries(sourceEntries(sources).map(([name,text])=>{
  let index=indices.get(text);
  if(index===undefined){index=texts.length;indices.set(text,index);texts.push(text);lengths.push(jsonBytes(text));}
  expansion+=lengths[index]-String(index).length;
  if(expansion>EXPANDED_LIMIT)throw Error('Session exceeds 128 MB expanded evidence limit');
  return [name,index];
 }));
 const sources=refs(session.sources);
 const attempts=session.attempts.map(a=>{
  if(!record(a)||!a.id||!a.sourceHash||!a.question||!a.help)throw Error('Invalid attempt history');
  return {...a,sources:refs(a.sources)};
 });
 const saved={...session,sources,attempts};
 if(jsonBytes(saved)+expansion>EXPANDED_LIMIT)throw Error('Session exceeds 128 MB expanded evidence limit');
 const packed={schema:2,encoding,texts,session:saved};
 const text=JSON.stringify(packed);
 if(encoder.encode(text).length>STORED_LIMIT)throw Error('Session exceeds 20 MB stored evidence limit; export existing work before continuing');
 return text;
}
export function validateSession(session){packedSession(session);return session;}
export function serializeSession(session){return packedSession(session);}
export function parseSession(text){
 if(typeof text!=='string'||encoder.encode(text).length>SESSION_INPUT_LIMIT)throw Error('Session input exceeds 40 MB');
 const input=JSON.parse(text);
 if(input?.schema===1)return validateSession(input);
 if(input?.schema!==2||input.encoding!==encoding||!Array.isArray(input.texts)||!record(input.session)||input.session.schema!==1)throw Error('Invalid session storage format');
 if(encoder.encode(text).length>STORED_LIMIT)throw Error('Session exceeds 20 MB stored evidence limit');
 if(!Array.isArray(input.session.attempts)||input.session.attempts.length>MAX_ATTEMPTS||input.texts.length>(MAX_ATTEMPTS+1)*WORK_FILES.length)throw Error('Invalid session schema');
 const used=new Set(),unique=new Set(),lengths=[];
 for(const value of input.texts){
  if(typeof value!=='string'||value.length>8000000||unique.has(value))throw Error('Invalid source text table');
  unique.add(value);lengths.push(jsonBytes(value));
 }
 let expanded=jsonBytes(input.session);
 const restore=refs=>{
  if(!record(refs))throw Error('Invalid source references');
  return Object.fromEntries(Object.entries(refs).map(([name,index])=>{
   if(!WORK_FILES.includes(name)||!Number.isInteger(index)||index<0||index>=input.texts.length)throw Error('Invalid source reference');
   expanded+=lengths[index]-String(index).length;
   if(expanded>EXPANDED_LIMIT)throw Error('Session exceeds 128 MB expanded evidence limit');
   used.add(index);return [name,input.texts[index]];
  }));
 };
 const sources=restore(input.session.sources);
 const attempts=input.session.attempts.map(a=>{
  if(!record(a))throw Error('Invalid attempt history');
  return {...a,sources:restore(a.sources)};
 });
 if(used.size!==input.texts.length)throw Error('Unreferenced source text');
 return validateSession({...input.session,sources,attempts});
}

export async function exportZip(publicFiles,session){validateSession(session);const current=currentCheckpoint(session);if(current)session={...session,checkpoint:current,sources:{...session.sources,'checkpoint.json':JSON.stringify(current,null,2)}};const files=Object.entries(publicFiles);for(const [name,content]of Object.entries(session.sources)){const saved=session.lastEvaluation&&name==='results.json'?session.attempts.find(a=>a.id===session.lastEvaluation):null;files.push(['work/'+name,saved?JSON.stringify({plan:session.plan,result:saved.result},null,2):content]);}const saved=serializeSession(session);files.push(['session.json',saved],['work/.beacon/session.json',saved]);if(session.checkpoint&&!('checkpoint.json' in session.sources))files.push(['work/checkpoint.json',JSON.stringify(session.checkpoint,null,2)]);const inventory=await Promise.all(files.map(async([name,content])=>({name,sha256:await sha256(content),bytes:new TextEncoder().encode(content).length})));files.push(['export-manifest.json',JSON.stringify({schema:1,sourceHash:await identity(session.sources),files:inventory},null,2)]);return zipFiles(files);}

export function checkpointMode(record,{explicitMode,game}={}){
 const allowed=['demo','learner','project'];
 if(record.playMode!==undefined&&!allowed.includes(record.playMode))throw Error('Checkpoint has an invalid director mode');
 if(explicitMode!==undefined&&explicitMode!==null){if(!allowed.includes(explicitMode))throw Error('Invalid explicit director mode');return explicitMode;}
 if(record.playMode!==undefined)return record.playMode;
 const sameState=game?.state&&canonical(game.state)===canonical(record.state);
 const sameMemory=game&&canonical(game.memory)===canonical(record.memory);
 if(sameState&&sameMemory&&allowed.includes(game.mode))return game.mode;
 throw Error('Legacy checkpoint has no bound director mode. Choose My rules or My capstone, or use terminal --mode rules/project.');
}
export function currentCheckpoint(session){
 if(Object.hasOwn(session.sources||{},'checkpoint.json')){
  let record;try{record=JSON.parse(session.sources['checkpoint.json']);}catch{throw Error('Current checkpoint.json is invalid; the older session checkpoint was not substituted.');}
  if(!record||typeof record!=='object'||!record.state)throw Error('Current checkpoint.json has no state');
  return record;
 }
 return session.checkpoint??null;
}
