// Executes the exact browser worker bundle using installed Node worker_threads.
// This checks the adapter offline; it does NOT establish browser/CSP compatibility.
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
export function makeOfflineWorker(sourceText) {
  const bundleExpression=sourceText===undefined
    ? `readFileSync(${JSON.stringify(fileURLToPath(new URL('../workbench/learner-worker.js',import.meta.url)))},'utf8')`
    : JSON.stringify(sourceText);
  const source=`const {parentPort}=require('node:worker_threads');
    const {readFileSync}=require('node:fs');const vm=require('node:vm');
    globalThis.self=globalThis;
    globalThis.postMessage=data=>parentPort.postMessage(data);
    globalThis.addEventListener=(type,listener)=>{if(type==='message')parentPort.on('message',data=>listener({data}));};
    vm.runInThisContext(${bundleExpression});`;
  const thread=new Worker(source,{eval:true});
  const worker={onmessage:null,onerror:null,postMessage:data=>thread.postMessage(data),terminate:()=>thread.terminate()};
  thread.on('message',data=>worker.onmessage?.({data}));
  thread.on('error',error=>worker.onerror?.({message:error.message,preventDefault(){}}));
  return worker;
}
export function executeOffline(request,timeoutMs=10000) {
  return new Promise((resolve,reject)=>{
    const worker=makeOfflineWorker(),id=globalThis.crypto.randomUUID();
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('Offline worker timeout'));},timeoutMs);
    worker.onmessage=event=>{if(event.data.id!==id)return;clearTimeout(timer);worker.terminate();resolve(event.data.result);};
    worker.onerror=event=>{clearTimeout(timer);worker.terminate();reject(new Error(event.message));};
    worker.postMessage({id,request});
  });
}
