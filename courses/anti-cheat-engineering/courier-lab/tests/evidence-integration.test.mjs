import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withServer, startServer } from './harness.mjs';
import { join as joinActor, input, request, state } from '../clients/http-client.mjs';
import { replayWindow } from '../telemetry/policy.mjs';
import { createReplayEngine } from '../telemetry/runtime.mjs';
import { RUNTIME_FILES, checkLaunch } from '../verified-server.mjs';
import { observePackage } from '../integrity/package.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute=promisify(execFile);

const project=fileURLToPath(new URL('../',import.meta.url));
test('real HTTP operations produce complete replayable windows before and after rollover',async()=>{
  await withServer(async(server)=>{
    const actor=await joinActor(server.base);
    await input(server.base,actor.token,1,'E',true);
    await server.advance(3);
    const before=(await server.control('window')).window;
    const result=replayWindow(before,createReplayEngine());
    assert.equal(result.ok,true);
    assert.deepEqual(result.state.actors[0],await state(server.base,actor.token));
    await server.advance(100);await server.advance(100);
    const rolled=(await server.control('window')).window;
    assert.ok(rolled.startIndex>0);
    assert.ok(rolled.events.length<=128);
    assert.equal(replayWindow(rolled,createReplayEngine()).ok,true);
    assert.equal(JSON.stringify(rolled).includes(actor.token),false);
    const tick=rolled.final.tick;
    for(const route of ['/window','/trace','/record']) assert.equal((await request(server.base,route)).status,404);
    assert.equal((await state(server.base,actor.token)).tick,tick);
  });
});

test('verified launcher starts approved actual files and refuses a changed engine before HTTP',async(t)=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'courier-owned-package-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const file of RUNTIME_FILES){await mkdir(dirname(join(root,file)),{recursive:true});await copyFile(join(project,file),join(root,file));}
  const manifestPath=join(root,'approved.json');
  const manifest={schema:1,packageId:'courier-runtime',release:'courier-runtime-1',files:await observePackage(root,{paths:RUNTIME_FILES})};
  await writeFile(manifestPath,JSON.stringify(manifest));
  assert.equal((await checkLaunch({root,manifestPath})).result.ok,true);
  // A successful observation is not an atomic promise about a later import.
  const measured=await checkLaunch({root,manifestPath});
  const originalEngine=await readFile(join(root,'engine.mjs'),'utf8');
  await writeFile(join(root,'engine.mjs'),originalEngine+'\n// update after observation\n');
  assert.equal(measured.result.ok,true);
  assert.deepEqual((await checkLaunch({root,manifestPath})).result,{ok:false,reason:'digest'});
  await writeFile(join(root,'engine.mjs'),originalEngine);
  const options={entry:join(project,'verified-server.mjs'),extraArgs:['--package-root',root,'--manifest',manifestPath]};
  const server=await startServer(options);
  assert.equal((await server.stop()).code,0);
  await writeFile(join(root,'engine.mjs'),(await readFile(join(root,'engine.mjs'),'utf8'))+'\n// changed owned bytes\n');
  assert.deepEqual((await checkLaunch({root,manifestPath})).result,{ok:false,reason:'digest'});
  await assert.rejects(startServer(options),/Runtime refused: digest/);
  manifest.release='courier-runtime-2';manifest.files=await observePackage(root,{paths:RUNTIME_FILES});
  await writeFile(manifestPath,JSON.stringify(manifest));
  const updated=await startServer(options);
  assert.equal((await updated.stop()).code,0);
});

test('verified package observation refuses missing files',async(t)=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'courier-missing-package-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await assert.rejects(checkLaunch({root,manifestPath:join(project,'trusted/runtime-manifest.json')}),/ENOENT/);
});

test('the independent runtime inventory covers the server import graph',async()=>{
  const pending=['server.mjs'];
  const seen=new Set();
  while(pending.length){
    const name=pending.pop();
    if(seen.has(name))continue;
    seen.add(name);
    assert.ok(RUNTIME_FILES.includes(name),`Unmeasured server dependency: ${name}`);
    const source=await readFile(join(project,name),'utf8');
    for(const match of source.matchAll(/(?:import[\s\S]*?from\s*|import\s*)['"]([^'"]+)['"]/g)){
      const dependency=match[1];
      if(dependency.startsWith('node:'))continue;
      assert.ok(dependency.startsWith('.'),`Declare external runtime dependency: ${dependency}`);
      const absolute=fileURLToPath(new URL(dependency,new URL(name,new URL('../',import.meta.url))));
      pending.push(absolute.slice(project.length));
    }
  }
});

test('replay CLI refuses oversized files and pipes before reading',async(t)=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'courier-window-input-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const oversized=join(root,'oversized.json');
  await writeFile(oversized,Buffer.alloc(1024*1024+1,32));
  const invoke=(path)=>execute(process.execPath,[join(project,'tools/replay-window.mjs'),path],{timeout:1500});
  await assert.rejects(invoke(oversized),(error)=>error.code===2&&/exceeds/.test(error.stderr));
  if(process.platform==='win32') return;
  const fifo=join(root,'input.pipe');
  await execute('mkfifo',[fifo]);
  await assert.rejects(invoke(fifo),(error)=>error.code===2&&/regular file/.test(error.stderr));
});
