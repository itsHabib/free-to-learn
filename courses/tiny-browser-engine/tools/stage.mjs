import {readFileSync,writeFileSync} from 'node:fs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {compile} from '../public/supplier.mjs';
import {inspectStage,blockPacket} from '../public/progression.mjs';
import {readPacket} from './packet.mjs';
if(!isMainThread){try{parentPort.postMessage({ok:true,result:inspectStage(compile(workerData.source),workerData.unit,workerData.packet)});}catch(error){parentPort.postMessage({ok:false,error:error.message,code:error.code??'engine_error'});}}
else{
 const [path,unit='M1',output='stage.json',page]=process.argv.slice(2);if(!path)throw Error('Usage: node tools/stage.mjs your.body.js M1..M8 output.json [board|field|packet.json]');
 const worker=new Worker(new URL(import.meta.url),{workerData:{source:readFileSync(path,'utf8'),unit,packet:page===undefined&&unit==='M3'?blockPacket:readPacket(page??'board')}});
 const timer=setTimeout(()=>{worker.terminate();console.error('Stage exceeded 5 seconds.');process.exitCode=1},5000);
 worker.once('message',result=>{clearTimeout(timer);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,ok:result.ok,stage:result.result?.stage,error:result.error}));if(!result.ok)process.exitCode=1;worker.terminate();});worker.once('error',error=>{clearTimeout(timer);console.error(error.message);process.exitCode=1});
}
