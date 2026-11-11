// Supplied terminal I/O and recovery. Engine decisions remain learner methods.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {compile,load,flush,click,applyOperation,validateViewport} from '../public/supplier.mjs';
import {fresh,append,updateDraft,validate} from '../public/notebook.mjs';
import {raster} from '../public/raster.mjs';
import {readPacket} from './packet.mjs';
import {png} from './render.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex');
const json=(path,limit=8000000)=>{const bytes=readFileSync(path);if(bytes.length>limit)throw Error('Input file exceeds the size limit.');return JSON.parse(bytes.toString('utf8'));};
const write=(path,data)=>writeFileSync(path,data,{flag:'wx'});
export function verifyBook(value){
 const book=validate(value);
 for(const event of book.events.filter(e=>e.kind==='submit')){
  if(hash(event.source)!==event.sourceHash||hash(JSON.stringify(event.packet))!==event.packetHash)throw Error('Source or packet hash mismatch; notebook was not restored.');
 }
 return book;
}
function latest(directory){
 const versions=readdirSync(directory).map(name=>({name,match:/^book-(\d+)\.json$/.exec(name)})).filter(x=>x.match).sort((a,b)=>Number(a.match[1])-Number(b.match[1]));
 if(!versions.length)throw Error('No versioned notebook found in this workspace.');return verifyBook(json(join(directory,versions.at(-1).name)));
}
export function applyInput(engine,session,input){
 if(input.kind==='click')return click(engine,session,input.point);
 if(input.kind==='mutate')return applyOperation(engine,session,input.operation);
 if(input.kind==='hit'){
  if(session.stale)throw Error('Cannot probe a stale frame.');
  const point={x:input.point.x,y:input.point.y+session.viewport.scrollY};
  return {target:engine.target(session.frame.display,point,session.viewport),point};
 }
 if(input.kind==='scroll'){session.viewport=validateViewport({...session.viewport,scrollY:input.scrollY});flush(engine,session,{type:'scroll'});return {scrolled:true};}
 if(input.kind==='resize'){session.viewport=validateViewport({...session.viewport,width:input.width,height:input.height});flush(engine,session,{type:'resize'});return {resized:true};}
 throw Error('Unknown terminal session input.');
}
export function restoreState(book){
 const submission=book.events.filter(e=>e.kind==='submit'&&e.mode==='render').at(-1);
 if(!submission)throw Error('No render submission to resume.');
 const engine=compile(submission.source),session=load(engine,submission.packet);flush(engine,session);
 const replay=[];
 for(const event of book.events.filter(e=>e.kind==='interaction'&&e.forSubmit===submission.id)){
  try{replay.push({id:event.id,result:applyInput(engine,session,event.input)});}catch(error){replay.push({id:event.id,error:error.message});}
 }
 return {submission,engine,session,replay};
}
export function receipt(session){
 if(!session?.frame)return {status:'no-frame'};
 const frame=session.frame;
 return {status:session.stale?'stale':'rendered',frame:frame.id,documentRevision:session.doc.revision,frameDocumentRevision:frame.documentRevision,counters:{...session.counters},viewport:frame.viewport,rgbaSha256:hash(raster(frame.display,frame.viewport))};
}
function snapshot(directory,book,session){
 const stem=`book-${String(book.revision).padStart(6,'0')}`;
 write(join(directory,`${stem}.json`),JSON.stringify(verifyBook(book),null,2)+'\n');
 if(session?.frame){
  const state={doc:session.doc,frame:session.frame,events:session.events,counters:session.counters,stale:session.stale,lastFlush:session.lastFlush};
  write(join(directory,`${stem}.frame.json`),JSON.stringify(state,null,2)+'\n');
  const v=session.frame.viewport;write(join(directory,`${stem}.png`),png(raster(session.frame.display,v),v.width,v.height));
 }
 return {workspace:resolve(directory),notebook:join(resolve(directory),`${stem}.json`),revision:book.revision,receipt:receipt(session)};
}
function newDirectory(path){if(existsSync(path))throw Error('Use a new workspace directory; existing evidence is never replaced.');mkdirSync(path,{recursive:true});}
export function run(argv){
 const [command,a,b,c]=argv;
 if(command==='start'){
  if(!a||!b||!c)throw Error('Usage: session.mjs start engine.body.js board|field|packet.json NEW_WORKSPACE');
  const source=readFileSync(a,'utf8');if(source.length>131072)throw Error('Engine source exceeds 128 KiB.');
  const packet=readPacket(b);let book=updateDraft(fresh(),source);
  book=append(book,{kind:'submit',mode:'render',module:'M8',source,sourceHash:hash(source),packet,packetHash:hash(JSON.stringify(packet)),assistance:'terminal-self-reported-unlabeled'});
  const id=book.events.at(-1).id;newDirectory(c);let session,error;
  try{const e=compile(source);session=load(e,packet);flush(e,session);}catch(e){error=e.message;}
  book=append(book,{kind:'result',forSubmit:id,output:error?{status:'error',message:error}:receipt(session)});
  return {ok:!error,error,...snapshot(c,book,session)};
 }
 if(command==='restore'){
  if(!a||!b)throw Error('Usage: session.mjs restore EXPORTED_NOTEBOOK.json NEW_WORKSPACE');
  const book=verifyBook(json(a)),state=restoreState(book);newDirectory(b);return {ok:true,restored:true,...snapshot(b,book,state.session)};
 }
 if(command==='export'){
  if(!a||!b)throw Error('Usage: session.mjs export WORKSPACE NEW_EXPORT.json');const book=latest(a);write(b,JSON.stringify(book,null,2)+'\n');return {ok:true,export:resolve(b),sha256:hash(readFileSync(b)),revision:book.revision};
 }
 if(command==='inspect'){
  if(!a)throw Error('Usage: session.mjs inspect WORKSPACE');const book=latest(a),state=restoreState(book);return {ok:true,revision:book.revision,sourceHash:state.submission.sourceHash,receipt:receipt(state.session),state:{doc:state.session.doc,frame:state.session.frame,events:state.session.events},replay:state.replay};
 }
 if(command==='note'){
  if(!a||!b)throw Error('Usage: session.mjs note WORKSPACE TEXT');let book=latest(a);const state=restoreState(book);book=append(book,{kind:'note',text:b});return {ok:true,...snapshot(a,book,state.session)};
 }
 if(command==='apply'){
  if(!a||!b)throw Error('Usage: session.mjs apply WORKSPACE INPUT.json|INLINE_JSON');
  const input=b.trim().startsWith('{')?JSON.parse(b):json(b,262144);let book=latest(a);const state=restoreState(book);
  book=append(book,{kind:'interaction',forSubmit:state.submission.id,input});const id=book.events.at(-1).id;let result,error;
  try{result=applyInput(state.engine,state.session,input);}catch(e){error=e.message;}
  const output=error?{status:'error',message:error}:{...receipt(state.session),result};
  book=append(book,{kind:'interaction-result',forInteraction:id,output});
  return {ok:!error&&result?.status!=='rejected',error,result,...snapshot(a,book,state.session)};
 }
 throw Error('Usage: node tools/session.mjs start|apply|inspect|note|export|restore ...');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=run(process.argv.slice(2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
