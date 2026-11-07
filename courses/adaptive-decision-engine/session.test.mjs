import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseSession,serializeSession,exportZip} from './bundle.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const attempt=(id,sources,result)=>({id:String(id),sourceHash:'retained-source-'+id,sources,question:'generated capacity case',questionSpec:'public generated fixture',help:id===0?'none':'generated assistance',prediction:'retained prediction '+id,status:id===0?'error':'complete',...(id===0?{error:'retained first failure'}:{}),...(result===undefined?{}:{result})});
function format2(session){
 const texts=[],indices=new Map();
 const refs=sources=>Object.fromEntries(Object.entries(sources).map(([name,text])=>{if(!indices.has(text)){indices.set(text,texts.length);texts.push(text);}return [name,indices.get(text)];}));
 const sources=refs(session.sources),attempts=session.attempts.map(a=>({...a,sources:refs(a.sources)}));
 return JSON.stringify({schema:2,encoding:'source-text-table/1',texts,session:{...session,sources,attempts}});
}
function generated(){
 // Six distinct evaluation objects also occur verbatim inside retained files.
 // Twenty-seven attempts include a first failure and preserve every metadata field.
 const results=Array.from({length:6},(_,i)=>({case:i,payload:String.fromCharCode(65+i).repeat(2000000)}));
 const texts=results.map(result=>JSON.stringify({plan:{label:'generated'},result},null,2));
 const attempts=Array.from({length:27},(_,i)=>attempt(i,{'observe.mjs':'// generated snapshot\n','results.json':texts[i%6]},i<6?results[i]:{passed:i!==0}));
 return {schema:1,sources:{'observe.mjs':'// generated snapshot\n','results.json':texts[5]},attempts,checkpoint:null};
}

test('generated capacity boundary preserves all evidence across export and continued saving',async()=>{
 const original=generated(),legacy=format2(original);
 assert.ok(Buffer.byteLength(legacy)>20000000);
 assert.throws(()=>parseSession(legacy),/20 MB stored evidence limit/);
 const saved=serializeSession(original),packed=JSON.parse(saved);
 assert.equal(packed.schema,3);assert.equal(packed.resultRefs.length,6);
 assert.ok(Buffer.byteLength(saved)<20000000);
 assert.deepEqual(parseSession(saved),original);
 const zip=await exportZip({'README.md':'generated fixture'},original);
 // The dependency-free exporter writes stored ZIP members; inspect local members.
 const members=new Map();let offset=0;const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
 while(view.getUint32(offset,true)===0x04034b50){const size=view.getUint32(offset+18,true),length=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+length+extra;members.set(Buffer.from(zip.subarray(offset+30,offset+30+length)).toString(),Buffer.from(zip.subarray(start,start+size)).toString());offset=start+size;}
 assert.equal(members.get('session.json'),members.get('work/.beacon/session.json'));
 assert.deepEqual(parseSession(members.get('session.json')),original);
 const dir=await mkdtemp(join(tmpdir(),'ade-session-boundary-')),input=join(dir,'session.json'),work=join(dir,'work');
 await writeFile(input,saved);
 const lab=join(dirname(fileURLToPath(import.meta.url)),'lab.mjs');
 let command=spawnSync(process.execPath,[lab,'import',input,work],{encoding:'utf8'});
 assert.equal(command.status,0,command.stderr);
 assert.deepEqual(parseSession(await readFile(join(work,'.beacon/session.json'),'utf8')),original);
 // Use the public untouched observer to produce a real failed, saved check after import.
 await writeFile(join(work,'observe.mjs'),await readFile(new URL('./starter/observe.mjs',import.meta.url),'utf8'));
 command=spawnSync(process.execPath,[lab,'check','01',work,'--help-used','generated public fixture','--prediction','The untouched observer reports its TODO'],{encoding:'utf8'});
 assert.equal(command.status,1,command.stderr);assert.match(command.stdout,/TODO: implement observe/);
 const continued=parseSession(await readFile(join(work,'.beacon/session.json'),'utf8'));
 assert.equal(continued.attempts.length,28);assert.deepEqual(continued.attempts.slice(0,27),original.attempts);
 assert.equal(continued.attempts[27].status,'complete');assert.equal(continued.attempts[27].result.passed,false);
});

test('formats 1 and 2 remain readable and unmatched results remain inline',()=>{
 const s={schema:1,sources:{'observe.mjs':'// unicode π\n'},attempts:[attempt(1,{'results.json':'opaque text'},{answer:42})]};
 assert.deepEqual(parseSession(JSON.stringify(s,null,2)),s);
 assert.deepEqual(parseSession(format2(s)),s);
 assert.deepEqual(parseSession(serializeSession(s)),s);
 assert.equal(JSON.parse(serializeSession(s)).schema,2);
 const matched={schema:1,sources:{'results.json':' { "result" : {"a":1,"b":2} }\n'},attempts:[attempt(1,{}, {a:1,b:2})]};
 assert.deepEqual(parseSession(serializeSession(matched)),matched);
 matched.attempts[0].result={a:1,b:3};
 assert.equal(JSON.parse(serializeSession(matched)).schema,2);
});

test('malformed tables and result references are rejected',()=>{
 const s={schema:1,sources:{'results.json':JSON.stringify({result:{answer:42}}),'REPORT.md':'plain'},attempts:[attempt(1,{}, {answer:42})]};
 const good=JSON.parse(serializeSession(s));assert.equal(good.schema,3);
 const reject=mutate=>{const value=structuredClone(good);mutate(value);assert.throws(()=>parseSession(JSON.stringify(value)));};
 reject(p=>p.resultRefs=[0,0]);reject(p=>p.resultRefs=[-1]);reject(p=>p.resultRefs=[1]);reject(p=>delete p.resultRefs);
 reject(p=>p.session.attempts[0].result=999);reject(p=>p.session.attempts[0].result='0');
 reject(p=>p.session.attempts[0].result=p.session.sources['REPORT.md']);
 reject(p=>p.texts[p.session.sources['results.json']]='{"different":42}');
 reject(p=>p.texts.push('unreferenced'));reject(p=>p.texts.push(p.texts[0]));
 reject(p=>p.session.sources['../escape']=0);reject(p=>p.session.sources['observe.mjs']=999);
 reject(p=>p.session.attempts[0].help='');reject(p=>p.session.attempts[0].sources=[]);
 reject(p=>{p.texts[p.session.sources['results.json']]=JSON.stringify({result:{payload:'x'.repeat(200001)}});p.session.sources['observe.mjs']=p.session.sources['results.json'];});
 reject(p=>p.schema=2);reject(p=>p.session.attempts[0].result={answer:42});
});

test('stored, expanded, file and attempt limits remain enforced',()=>{
 const oversized={schema:1,sources:{},attempts:Array.from({length:3},(_,i)=>attempt(i,{'results.json':JSON.stringify({result:{i,payload:String(i).repeat(7000000)}})},{}))};
 assert.throws(()=>serializeSession(oversized),/20 MB stored evidence limit/);
 const unicode={schema:1,sources:{'results.json':'雪'.repeat(7000000)},attempts:[]};
 assert.throws(()=>serializeSession(unicode),/20 MB stored evidence limit/);
 const many={schema:1,sources:{},attempts:Array.from({length:1001},(_,i)=>attempt(i,{},{}))};
 assert.throws(()=>serializeSession(many),/Invalid session schema/);
 assert.throws(()=>serializeSession({schema:1,sources:{'observe.mjs':'x'.repeat(200001)},attempts:[]}),/oversized work file/);
 const bomb={schema:1,sources:{},attempts:Array.from({length:1000},(_,i)=>attempt(i,{'REPORT.md':'x'.repeat(150000)},{}))};
 assert.throws(()=>serializeSession(bomb),/128 MB expanded evidence limit/);
 assert.throws(()=>parseSession(format2(bomb)),/128 MB expanded evidence limit/);
 // Malicious format-3 repeated result references count toward expanded evidence too.
 const one={schema:1,sources:{'results.json':JSON.stringify({result:{payload:'x'.repeat(200000)}})},attempts:[attempt(1,{}, {payload:'x'.repeat(200000)})]};
 const p=JSON.parse(serializeSession(one));p.session.attempts=Array.from({length:1000},(_,i)=>({...p.session.attempts[0],id:String(i)}));p.resultRefs=Array.from({length:1000},(_,i)=>i);
 assert.throws(()=>parseSession(JSON.stringify(p)),/128 MB expanded evidence limit/);
 assert.ok(bytes(one)<128000000);
 assert.throws(()=>parseSession(' '.repeat(40000001)),/40 MB/);
});
