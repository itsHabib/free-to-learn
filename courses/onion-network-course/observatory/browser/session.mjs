// Testable controller used by the real UI. Storage/worker are injected; no DOM or sockets.
export async function digest(text) {
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const storagePrefix='circuit-observatory/code/v1/';
export function createProjectSession({storage,makeWorker,buildId,runtimeHash,requirements,
  workshopContract,onStatus=()=>{},onResult=()=>{},timeoutMs=10000}) {
  let active=null;
  const unsaved=[];
  function put(kind,id,value) {
    const key=storagePrefix+kind+'/'+id;
    if(storage.getItem(key)!==null)throw new Error('Refusing to overwrite an existing project record.');
    const serialized=JSON.stringify(value);storage.setItem(key,serialized);
    if(storage.getItem(key)!==serialized)throw new Error('Project storage did not retain the record.');
  }
  function history() {
    const out=[];
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);
      if(key?.startsWith(storagePrefix))out.push(JSON.parse(storage.getItem(key)));
    }
    return out.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }
  async function run({source,command,through=6,options={},assistance='none-declared',prediction=''}) {
    if(active)throw new Error('Stop or finish the current run before starting another.');
    if(typeof source!=='string'||source.length>100000||!source.trim())throw new Error('Use nonempty source under 100,000 characters.');
    // Snapshot before awaiting any hashing, so edits made while hashing belong to a later run.
    const snapshot={source,command,through,options:structuredClone(options),assistance,prediction};
    const token={id:globalThis.crypto.randomUUID(),cancelled:false};active=token;
    let record;
    try {
      if(command==='workshop'&&!workshopContract)throw new Error('The experiment contract is unavailable.');
      const question=command==='workshop'?{contract:workshopContract,scenario:snapshot.options.scenario}:command==='check'?requirements.filter(x=>x.module<=through):requirements;
      record={kind:'submission',id:token.id,createdAt:new Date().toISOString(),...snapshot,
        sourceHash:await digest(snapshot.source),question,questionHash:await digest(JSON.stringify(question)),buildId,runtimeHash,
        ...(command==='workshop'?{scenarioHash:await digest(JSON.stringify(snapshot.options.scenario))}: {})};
      if(token.cancelled)return;
      put('submission',record.id,record);
    } catch(error) {if(active===token)active=null;onStatus('Submission not saved; no code executed.');throw error;}
    if(token.cancelled)return;
    let worker,timer,finished=false;
    function finish(result) {
      if(finished)return;finished=true;clearTimeout(timer);worker?.terminate();active=null;
      const receipt={kind:'result',id:record.id,createdAt:new Date().toISOString(),sourceHash:record.sourceHash,
        questionHash:record.questionHash,buildId,runtimeHash,result,
        ...(record.scenarioHash?{scenarioHash:record.scenarioHash}:{})};
      let saved=true;
      try{put('result',record.id,receipt);}catch(error){saved=false;unsaved.push(receipt);onStatus(`Result is not saved: ${error.message}. Export it now; the submitted source is retained.`);}
      if(saved)onStatus('Run finished. Source and result saved as a new attempt.');
      onResult({submission:record,receipt,saved});
    }
    token.finish=finish;
    try {
      worker=makeWorker();
      worker.onmessage=event=>{if(event.data?.id===record.id&&event.data.type==='result')finish(event.data.result);};
      worker.onerror=event=>{event.preventDefault?.();finish({executionFailure:true,code:'WORKER_ERROR',detail:event.message??'Worker failed to start or execute.'});};
      timer=setTimeout(()=>finish({executionFailure:true,code:'TIMEOUT',detail:`Stopped after ${timeoutMs/1000} seconds; simplify the loop and retry.`}),timeoutMs);
      onStatus('Running your committed source in a disposable worker…');
      worker.postMessage({id:record.id,request:snapshot});
    }catch(error){finish({executionFailure:true,code:'WORKER_UNAVAILABLE',detail:error.message});}
    return record;
  }
  function cancel() {
    if(!active)return;
    active.cancelled=true;
    if(active.finish)active.finish({executionFailure:true,code:'CANCELLED',detail:'Stopped by the learner.'});
    else {active=null;onStatus('Cancelled before execution.');}
  }
  function exportRecords() {
    const records=[],invalidRecords=[];
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i);if(!key?.startsWith(storagePrefix))continue;
      const raw=storage.getItem(key);
      try{records.push(JSON.parse(raw));}catch(error){invalidRecords.push({key,raw,error:error.message});}
    }
    return {buildId,runtimeHash,records,invalidRecords,unsavedResults:[...unsaved]};
  }
  return {run,cancel,history,exportRecords,isRunning:()=>Boolean(active)};
}
