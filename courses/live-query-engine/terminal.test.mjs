import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createStore} from './lib/store.mjs';
import {sync} from './lib/journal.mjs';
const cli=fileURLToPath(new URL('./lab.mjs',import.meta.url));
const exec=promisify(execFile);
const invoke=(...args)=>exec(process.execPath,[cli,...args],{timeout:10000});

test('two terminal writes update a listening subscriber exactly once',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ivy-query-'));
  const watch=spawn(process.execPath,[cli,'watch','--all','--worked','--dir',dir],{stdio:['ignore','pipe','pipe']});
  const closed=once(watch,'close');
  t.after(async()=>{watch.kill();await closed;rmSync(dir,{recursive:true,force:true});});
  let output='';
  watch.stdout.setEncoding('utf8');
  watch.stdout.on('data',chunk=>{output+=chunk;});
  async function waitFor(fragment) {
    const deadline=Date.now()+5000;
    while (!output.includes(fragment)) {
      if (Date.now()>deadline || watch.exitCode!==null) throw Error('Expected '+fragment+' in '+output);
      await new Promise(done=>setTimeout(done,20));
    }
  }
  await waitFor('Watching ');
  await invoke('put','rush','45','--dir',dir);
  await invoke('ship','rush','--dir',dir);
  await waitFor('Revision 2 ');
  const events=output.split('\n').filter(x=>x.startsWith('Revision ')).flatMap(x=>JSON.parse(x.slice(x.indexOf('['))));
  assert.deepEqual(events.map(e=>[e.type,e.id]),[['enter','rush'],['leave','rush']]);
});

test('concurrent writers publish full unique commits, invalid writes never publish',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ivy-writers-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const ids=['a','b','c','d','e','f'];
  await Promise.all(ids.map(id=>invoke('put',id,'50','--dir',dir)));
  await assert.rejects(invoke('put','bad','99999999999','--dir',dir));
  const store=createStore();
  sync(dir,store);
  assert.equal(store.revision,ids.length);
  assert.deepEqual(store.snapshot().rows.map(row=>row.id).sort(),ids);
});

test('put accepts a signed quantity in the documented command form',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ivy-signed-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  await invoke('put','adjustment','-12','--dir',dir);
  const store=createStore(); sync(dir,store);
  assert.deepEqual(store.snapshot().rows,[{id:'adjustment',quantity:-12}]);
});
