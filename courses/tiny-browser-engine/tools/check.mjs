import {readFileSync} from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {compile} from '../public/supplier.mjs';
import {checkStage} from '../public/checks.mjs';
if(!isMainThread){
 try{const engine=compile(workerData.source);parentPort.postMessage(workerData.units.map(unit=>checkStage(engine,unit)));}catch(e){parentPort.postMessage({error:e.message});}
}
if(isMainThread){
 const path=process.argv[2],unit=process.argv[3]??'all';
 if(!path){console.error('Usage: node tools/check.mjs path/to/your.body.js [M1..M8|all]');process.exitCode=2;}
 if(path){
  const worker=new Worker(new URL(import.meta.url),{workerData:{source:readFileSync(path,'utf8'),units:unit==='all'?Array.from({length:8},(_,i)=>`M${i+1}`):[unit]}});
  const timer=setTimeout(()=>{console.error('Run exceeded 5 seconds; no pass recorded.');worker.terminate();process.exitCode=1;},5000);
  worker.once('message',results=>{clearTimeout(timer);console.log(JSON.stringify(results,null,2));if(!Array.isArray(results)||results.some(r=>!r.passed))process.exitCode=1;worker.terminate();});
  worker.once('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1;});
 }
}
