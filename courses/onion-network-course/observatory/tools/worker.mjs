// Runs already-authorized local learner code. Timeout is a liveness guard, not a sandbox.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { evaluate } from '../checks/cases.mjs';
import { directory, establish, exchange, recover, sampleRequest, views } from '../runtime/network.mjs';
import { capstoneReport } from '../runtime/capstone.mjs';
const [sourcePath, expectedHash, command, through]=process.argv.slice(2);
console.log=(...args)=>console.error(...args);
let result;
try {
  const source=await readFile(sourcePath,'utf8');
  if(createHash('sha256').update(source).digest('hex')!==expectedHash) throw new Error('Source changed after submission. Run again to record the new version.');
  const impl=await import(pathToFileURL(sourcePath).href);
  if(command==='check') result=await evaluate(impl,Number(through));
  else if(command==='capstone') result=await capstoneReport(impl);
  else {
    const c=establish(impl.selectPath(directory()));
    if(command==='demo') result={mode:'offline simulation',reply:exchange(impl,c),views:views(c)};
    else {
      const failed=c.path[1]; let failure;
      try {exchange(impl,c,sampleRequest(),{failAt:failed});} catch(error){failure={code:error.code,message:error.message};}
      const next=recover(impl,c,directory(),[failed]);
      result={failure,oldClosed:c.closed,newPath:next.plan.path,reply:next.circuit?exchange(impl,next.circuit):null,
        retryLimit:'Read-only lookup. This does not implement exactly-once delivery.'};
    }
  }
} catch(error) {result={executionFailure:true,code:error.code??error.name,detail:error.message};}
process.stdout.write(JSON.stringify(result));
