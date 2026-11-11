// Bundled with original supplied modules by tools/build.mjs. No author code.
let activeEngine=null,activeSession=null;
self.onmessage=({data})=>{
 const send=(value,transfer=[])=>self.postMessage({requestId:data.requestId,...value},transfer);
 try{
  if(data.kind==='check'){const e=compile(data.source);const result=checkStage(e,data.unit);send({kind:'checks',result});return;}
  if(data.kind==='inspect'){const result=inspectStage(compile(data.source),data.unit,data.packet);const pixels=result.display?raster(result.display,result.viewport):null;if(JSON.stringify(result).length>16777216)throw Error('Stage output exceeds 16 MiB.');send({kind:'stage',result,pixels:pixels?.buffer},pixels?[pixels.buffer]:[]);return;}
  if(data.kind==='hit'){
   if(!activeSession?.frame||activeSession.stale)throw Error('Render a current frame before probing input.');
   const point={x:data.point.x,y:data.point.y+activeSession.viewport.scrollY};const target=activeEngine.target(activeSession.frame.display,point,activeSession.viewport);send({kind:'hit',target,point,frame:activeSession.frame.id});return;
  }
  if(data.kind==='start'){activeEngine=compile(data.source);activeSession=load(activeEngine,data.packet);flush(activeEngine,activeSession);}
  if(data.kind==='click'){
   if(!activeSession)throw Error('Render your engine first.');click(activeEngine,activeSession,data.point);
  }
  if(data.kind==='scroll'){
   if(!activeSession)throw Error('Render your engine first.');activeSession.viewport=validateViewport({...activeSession.viewport,scrollY:data.scrollY});flush(activeEngine,activeSession,{type:'scroll'});
  }
  if(data.kind==='resize'){
   if(!activeSession)throw Error('Render your engine first.');activeSession.viewport=validateViewport({...activeSession.viewport,width:data.width,height:data.height});flush(activeEngine,activeSession,{type:'resize'});
  }
  if(data.kind==='mutate'){
   if(!activeSession)throw Error('Render your engine first.');applyOperation(activeEngine,activeSession,data.operation);
  }
  if(!['start','click','scroll','resize','mutate'].includes(data.kind))throw Error('Unknown worker operation.');
  const pixels=raster(activeSession.frame.display,activeSession.viewport);
  const state={doc:activeSession.doc,frame:activeSession.frame,counters:activeSession.counters,events:activeSession.events,lastFlush:activeSession.lastFlush,stale:activeSession.stale};
  if(JSON.stringify(state).length>16777216)throw Error('Trace exceeds 16 MiB; reduce this packet.');
  send({kind:'frame',state,pixels:pixels.buffer},[pixels.buffer]);
 }catch(error){const recoverable=!!activeEngine&&!!activeSession?.frame;send({kind:'error',recoverable,state:recoverable?{doc:activeSession.doc,frame:activeSession.frame,counters:activeSession.counters,events:activeSession.events,lastFlush:activeSession.lastFlush,stale:activeSession.stale}:null,code:error.code??'engine_error',message:String(error.message??error).slice(0,2000)});}
};
