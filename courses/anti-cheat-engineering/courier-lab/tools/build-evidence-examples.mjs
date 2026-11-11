import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrityCases } from '../integrity/fixtures.mjs';
import { checkPackage } from '../integrity/policy.mjs';
import { replayWindow } from '../telemetry/policy.mjs';
import { createReplayEngine } from '../telemetry/runtime.mjs';
import { withServer } from '../tests/harness.mjs';
import { join, input } from '../clients/http-client.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cases=await integrityCases();
const names={approved:'approved runtime bytes',changed:'actual runtime byte change',claim:'actual runtime byte change',self:'approved runtime bytes',missing:'missing runtime file',new:'approved compatible update',both:'actual runtime byte change'};
const packages={};
for(const [key,name] of Object.entries(names)){
  const data=structuredClone(cases.find(item=>item.name===name).input);
  if(key==='both')data.manifest.files=structuredClone(data.observed);
  packages[key]={...data,result:checkPackage(data)};
  if(key==='claim')packages[key].clientClaim='approved (a claim, not an observation)';
  if(key==='self')packages[key].clientClaim='hashes copied from the reference by an untrusted client; actual files are unknown';
}
const traces={};
const engine=createReplayEngine();
function saved(record){
  const result=replayWindow(record,engine);
  const frames=[];
  if(result.ok){
    const world=engine.restore(record.checkpoint);
    frames.push(engine.canonical(world));
    for(const {event} of record.events){engine.apply(world,event);frames.push(engine.canonical(world));}
  }
  return {record,result,frames};
}
await withServer(async(server)=>{
  const actor=await join(server.base);
  for(const [seq,move,interact,ticks] of [[1,'E',false,4],[2,'E',false,2],[3,'idle',true,1],[4,'W',false,4],[5,'W',false,2],[6,'idle',true,1]]){
    await input(server.base,actor.token,seq,move,interact);await server.advance(ticks);
  }
  const complete=(await server.control('window')).window;
  traces.complete=saved(complete);assert.equal(traces.complete.result.ok,true);
  assert.equal(traces.complete.result.state.actors[0].actor.score,1);
  await server.advance(100);await server.advance(100);
  const rolled=(await server.control('window')).window;
  assert.ok(rolled.startIndex>0);traces.rolled=saved(rolled);assert.equal(traces.rolled.result.ok,true);
  const missing=structuredClone(complete);missing.events.splice(1,1);traces.missing=saved(missing);
  const duplicate=structuredClone(complete);duplicate.events[1].index=duplicate.events[0].index;traces.duplicate=saved(duplicate);
  const version=structuredClone(complete);version.runtimeRelease='unknown-release';traces.version=saved(version);
  const changed=structuredClone(complete);changed.final.actors[0].actor.score+=1;traces.final=saved(changed);
  for(const key of ['missing','duplicate','version','final'])assert.equal(traces[key].result.ok,false);
  assert.equal(JSON.stringify(traces).includes(actor.token),false);
});
const hashes={};
for(const name of ['engine.mjs','server.mjs','telemetry/runtime.mjs','telemetry/policy.mjs','integrity/policy.mjs'])hashes[name]=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
await mkdir(resolve(root,'public/samples'),{recursive:true});
await writeFile(resolve(root,'public/samples/evidence-cases.json'),JSON.stringify({kind:'recorded worked examples, not learner submissions',hashes,packages,traces},null,2)+'\n');
console.log('Saved 7 package comparisons and 6 replay cases from actual owned bytes and HTTP gameplay.');
