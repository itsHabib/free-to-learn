import {parentPort,workerData} from 'node:worker_threads';
import {execute} from './worker.mjs';
try{parentPort.postMessage({ok:true,value:await execute(workerData)});}catch(e){parentPort.postMessage({ok:false,error:e.message});}
