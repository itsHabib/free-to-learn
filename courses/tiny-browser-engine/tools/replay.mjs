import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {compile,load,flush,click,applyOperation,validateViewport} from '../public/supplier.mjs';
import {raster} from '../public/raster.mjs';
import {checkStage} from '../public/checks.mjs';
import {inspectStage} from '../public/progression.mjs';
import {validate} from '../public/notebook.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function summary(s){return {frame:s.frame.id,revision:s.doc.revision,counters:{...s.counters},rgbaSha256:hash(raster(s.frame.display,s.viewport))};}
export function replay(book){
 const outcomes=[];
 for(const event of book.events.filter(e=>e.kind==='submit')){
  const row={forSubmit:event.id,sourceHash:event.sourceHash,mode:event.mode,interactions:[]};outcomes.push(row);
  if(hash(event.source)!==event.sourceHash||hash(JSON.stringify(event.packet))!==event.packetHash){row.status='hash-mismatch';continue;}
  try{
   const engine=compile(event.source);
   if(event.mode==='check'){row.result=checkStage(engine,event.module);row.status='replayed';continue;}
   if(event.mode==='inspect'){const result=inspectStage(engine,event.module,event.packet);row.result={stage:result.stage};row.status='replayed';continue;}
   if(event.mode!=='render')throw Error('Unknown submission mode.');
   const session=load(engine,event.packet);flush(engine,session);row.initial=summary(session);
   for(const action of book.events.filter(e=>e.kind==='interaction'&&e.forSubmit===event.id)){
    const item={forInteraction:action.id,input:action.input};row.interactions.push(item);
    try{const m=action.input;
     if(m.kind==='click')item.result=click(engine,session,m.point);
     else if(m.kind==='hit'){if(session.stale)throw Error('Cannot probe a stale frame.');const point={x:m.point.x,y:m.point.y+session.viewport.scrollY};item.result={target:engine.target(session.frame.display,point,session.viewport),point};}
     else if(m.kind==='mutate')item.result=applyOperation(engine,session,m.operation);
     else if(m.kind==='scroll'){session.viewport=validateViewport({...session.viewport,scrollY:m.scrollY});flush(engine,session,{type:'scroll'});}
     else if(m.kind==='resize'){session.viewport=validateViewport({...session.viewport,width:m.width,height:m.height});flush(engine,session,{type:'resize'});}
     else throw Error('Unknown interaction.');
     item.status='replayed';item.frame=summary(session);
    }catch(error){item.status='error';item.error=error.message;}
   }
   row.status='replayed';
  }catch(error){row.status='error';row.error=error.message;}
 }
 return {version:1,scope:'Deterministic local replay of retained trusted source; not authenticated grading.',outcomes};
}
if(!isMainThread){try{parentPort.postMessage({ok:true,report:replay(workerData.book)});}catch(error){parentPort.postMessage({ok:false,error:error.message});}}
else if(process.argv[1]?.endsWith('/replay.mjs')||process.argv[1]==='tools/replay.mjs'){
 const [path,output='replay-report.json']=process.argv.slice(2);if(!path)throw Error('Usage: node tools/replay.mjs notebook.json replay-report.json');
 const bytes=readFileSync(path);if(bytes.length>8000000)throw Error('Notebook file exceeds import limit.');const book=validate(JSON.parse(bytes));
 const worker=new Worker(new URL(import.meta.url),{workerData:{book}}),timer=setTimeout(()=>{worker.terminate();console.error('Replay exceeded 5 seconds; no successful report recorded.');process.exitCode=1},5000);
 worker.once('message',result=>{clearTimeout(timer);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,ok:result.ok,attempts:result.report?.outcomes.length}));if(!result.ok)process.exitCode=1;worker.terminate();});worker.once('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1});
}
