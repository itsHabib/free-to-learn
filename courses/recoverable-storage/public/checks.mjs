import { MemoryDisk, checksum } from './disk.mjs';
// Compare public JSON-shaped values. Object insertion order is not a contract;
// array positions, field presence and primitive values remain significant.
export function same(a,b) {
  if(a===b)return true;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)&&a.length!==b.length)return false;
  const left=Object.keys(a).sort(),right=Object.keys(b).sort();
  if(left.length!==right.length||left.some((key,n)=>key!==right[n]))return false;
  return left.every(key=>same(a[key],b[key]));
}
export const stages=['01','02','03','04','05','06','07'];
const p=(tx,key,value)=>({type:'put',tx,key,value});
const c=tx=>({type:'commit',tx,key:null,value:null});
const op=(key,value)=>({type:'put',key,value});
function caseFailure(counterexample){const error=Error('The first concrete boundary case differs.');error.counterexample=counterexample;throw error;}
function atBoundary(context,call){try{return call();}catch(error){caseFailure({...context,actual:{error:error?.message??String(error),thrown_type:typeof error}});}}
// Original independent framing fixture, not output from the learner's encoder.
function lengthPrefixes() {
 const body=Buffer.from('01000000020001000000036b616263','hex'),header=Buffer.alloc(12);
 header.write('IVY1');header.writeUInt32BE(body.length,4);header.writeUInt32BE(checksum(body),8);
 const whole=Buffer.concat([header,body]),torn=whole.subarray(0,25),short=whole.subarray(0,22),malformed=Buffer.from(torn);
 malformed.writeUInt32BE(271,4);return {whole,torn,short,malformed};
}
export function suite(api,stage) {
 const results=[];
 const fixtures={
  '01.roundtrip':{records:[p(7,'café','')]},'01.frame':{records:[p(7,'k','v')]},'01.offset':{records:[p(7,'k','v'),c(8)]},'01.partial':{records:[p(1,'k','abc')],cuts:'every incomplete prefix'},'01.checksum':{records:[p(1,'k','v')],mutation:'xor last byte with1'},'01.magic':{records:[p(1,'k','v')],mutation:'set high bit in bytes0–3'},'01.utf8':{records:[p(1,'k','v')],mutation:'byte23=255, recompute checksum'},'01.invalid':{records:[p(0,'','x')]},
  '02.short-write':{hex:Buffer.from('abcdefghij').toString('hex'),maxWrite:3},'02.exact':{hex:Buffer.from('abcdefghij').toString('hex'),maxWrite:3},'02.no-progress':{hex:'78',appendReturns:0},
  '03.latest':{records:[p(1,'b','x'),p(2,'a','1'),p(3,'a','2'),{type:'del',tx:4,key:'b',value:null}]},'03.special-key':{records:[p(1,'__proto__','yes')]},
  '04.commit':{tx:9,operations:[op('a','1'),{type:'del',key:'b'}]},'04.uncommitted':{records:[p(1,'a','1')]},'04.atomic':{baseline:[op('a','old')],next:[op('a','new'),op('b','2')],cut:'remove final commit byte'},'05.every-cut':{baseline:[op('a','old')],next:[op('a','new'),op('b','2')]},'05.fail-closed':{tx:1,operations:[op('a','1')],mutation:'xor byte23 with1'},'05.repair-append':{baseline:[op('a','old')],tornRecord:p(2,'b','invisible'),tornLength:15,next:[op('c','3')]},
  '06.usable':{operations:[op('a','1'),op('b','2'),op('c','3'),{type:'del',key:'a'}]},'06.compact':{key:'a',values:['0','1','2','3','4','5','6','7','8','9']},'06.empty-and-missing':{operations:[op('empty','')],queries:['empty','absent']},'06.closed':{actions:['open','close','get a']},'06.large-snapshot':{operations:'put key0=0 through key129=129, then compact/reopen'},'06.order':{operations:[op('a','1')],actions:['compact']},'07.compaction-cuts':{operations:[op('a','1'),op('a','2')],appendCut:5,failAt:'each observed primitive'},'07.failed-writer':{operations:[op('a','1'),op('b','2')],failAt:1,appendCut:5}};
 const test=(id,input,expected,run)=>{if(typeof input==='string')input={...fixtures[id],case:input};try{const actual=run();results.push({id,input,expected,actual,pass:same(actual,expected),lesson:`lessons/${id.slice(0,2)}.md`});}catch(e){results.push({id,input,expected,actual:{error:e?.message??String(e)},counterexample:e?.counterexample??null,pass:false,lesson:`lessons/${id.slice(0,2)}.md`});}};
 const rejects=fn=>{try{fn();return false;}catch{return true;}};
 if(Number(stage)>=1) {
  test('01.roundtrip','UTF-8 key and empty value',p(7,'café',''),()=>api.decodeRecord(api.encodeRecord(p(7,'café',''))).record);
  test('01.bom-key', {record:p(8,'\uFEFFkey','plain'),keyCodePoints:['feff','6b','65','79']},p(8,'\uFEFFkey','plain'),()=>api.decodeRecord(api.encodeRecord(p(8,'\uFEFFkey','plain'))).record);
  test('01.bom-value', {record:p(8,'key','\uFEFFhello'),valueCodePoints:['feff','68','65','6c','6c','6f']},p(8,'key','\uFEFFhello'),()=>api.decodeRecord(api.encodeRecord(p(8,'key','\uFEFFhello'))).record);
  test('01.bom-only-key', {record:p(8,'\uFEFF',''),keyCodePoints:['feff']},p(8,'\uFEFF',''),()=>api.decodeRecord(api.encodeRecord(p(8,'\uFEFF',''))).record);
  test('01.frame' ,'put k=v header and lengths',[true,'IVY1',13,1,7,1,1],()=>{const b=api.encodeRecord(p(7,'k','v'));return [Buffer.isBuffer(b),b.toString('ascii',0,4),b.readUInt32BE(4),b[12],b.readUInt32BE(13),b.readUInt16BE(17),b.readUInt32BE(19)];});
  test('01.offset','two adjacent frames',c(8),()=>{const first=api.encodeRecord(p(7,'k','v'));return api.decodeRecord(Buffer.concat([first,api.encodeRecord(c(8))]),first.length).record;});
  test('01.partial','every incomplete prefix of a frame',true,()=>{const b=api.encodeRecord(p(1,'k','abc'));for(let n=0;n<b.length;n++){const prefix=b.subarray(0,n),context={cut:n,prefix_hex:prefix.toString('hex'),expected:null};const actual=atBoundary(context,()=>api.decodeRecord(prefix));if(actual!==null)caseFailure({...context,actual});}return true;});
  test('01.length-prefix',{outerLength:271,impliedLength:15,prefixBytes:25,offsets:[0,27],shortPrefixBytes:22},[[null,null,true],[null,null,true]],()=>{const f=lengthPrefixes();return [0,f.whole.length].map(offset=>{const lead=offset?f.whole:Buffer.alloc(0),read=name=>{const bytes=Buffer.concat([lead,f[name]]);return atBoundary({offset,prefix_hex:bytes.toString('hex'),expected:null},()=>api.decodeRecord(bytes,offset));};const torn=read('torn'),short=read('short'),damaged=Buffer.concat([lead,f.malformed]);return [torn,short,rejects(()=>api.decodeRecord(damaged,offset))];});});
  test('01.checksum','one changed payload byte',true,()=>{const b=api.encodeRecord(p(1,'k','v'));b[b.length-1]^=1;return rejects(()=>api.decodeRecord(b));});
  test('01.magic','high-bit bytes are not ASCII magic',true,()=>{const b=api.encodeRecord(p(1,'k','v'));for(let n=0;n<4;n++)b[n]|=128;return rejects(()=>api.decodeRecord(b));});
  test('01.utf8','invalid UTF-8 with a recomputed checksum',true,()=>{const b=api.encodeRecord(p(1,'k','v'));b[23]=255;b.writeUInt32BE(checksum(b.subarray(12)),8);return rejects(()=>api.decodeRecord(b));});
  test('01.invalid','empty key and tx0',true,()=>rejects(()=>api.encodeRecord(p(0,'','x'))));
 }
 if(Number(stage)>=2) {
  test('02.short-write','disk accepts 3 bytes each call',[10,true],()=>{const d=new MemoryDisk({maxWrite:3}),b=Buffer.from('abcdefghij');api.appendLog(d,b);return [d.read('store.log').length,d.events.at(-1)==='sync:store.log'];});
  test('02.exact','short writes preserve all bytes','abcdefghij',()=>{const d=new MemoryDisk({maxWrite:3});api.appendLog(d,Buffer.from('abcdefghij'));return d.read('store.log').toString();});
  test('02.no-progress','disk returns 0',true,()=>rejects(()=>api.appendLog({append:()=>0,sync:()=>{}},Buffer.from('x'))));
 }
 if(Number(stage)>=3) {
  test('03.latest','put a twice, delete b',[['a','2']],()=>api.indexRecords([p(1,'b','x'),p(2,'a','1'),p(3,'a','2'),{type:'del',tx:4,key:'b',value:null}]));
  test('03.special-key','__proto__ is an ordinary key',[['__proto__','yes']],()=>api.indexRecords([p(1,'__proto__','yes')]));
 }
 if(Number(stage)>=4) {
  test('04.commit','batch has one tx and a final commit',[['put',9],['del',9],['commit',9]],()=>{const b=api.encodeBatch(9,[op('a','1'),{type:'del',key:'b'}]),out=[];for(let n=0;n<b.length;){const d=api.decodeRecord(b,n);out.push([d.record.type,d.record.tx]);n+=d.bytes;}return out;});
  test('04.uncommitted','complete put without commit is invisible',[],()=>api.recover(api.encodeRecord(p(1,'a','1'))).entries);
  test('04.atomic','partial final batch leaves prior committed values',[['a','old']],()=>{const first=api.encodeBatch(1,[op('a','old')]),last=api.encodeBatch(2,[op('a','new'),op('b','2')]);return api.recover(Buffer.concat([first,last.subarray(0,last.length-1)])).entries;});
 }
 if(Number(stage)>=5) {
  test('05.every-cut','every truncation position in second batch',true,()=>{const first=api.encodeBatch(1,[op('a','old')]),next=api.encodeBatch(2,[op('a','new'),op('b','2')]);for(let n=0;n<next.length;n++){const log=Buffer.concat([first,next.subarray(0,n)]),context={cut:n,baseline_hex:first.toString('hex'),next_prefix_hex:next.subarray(0,n).toString('hex'),log_hex:log.toString('hex'),expected:{entries:[['a','old']],validBytes:first.length}};const r=atBoundary(context,()=>api.recover(log));if(!same(r.entries,[['a','old']])||r.validBytes!==first.length)caseFailure({...context,actual:r});}return true;});
  test('05.fail-closed','corrupt complete record before a later commit',true,()=>{const b=api.encodeBatch(1,[op('a','1')]);b[23]^=1;return rejects(()=>api.recover(b));});
  test('05.preserve-malformed-prefix',{baseline:[op('stable','kept')],outerLength:271,impliedLength:15,prefixBytes:25,required:'consistent tail opens; contradiction throws without mutation'},['kept',true,true,true,[]],()=>{const f=lengthPrefixes(),first=api.encodeBatch(1,[op('stable','kept')]),good=new MemoryDisk();good.files.set('store.log',Buffer.concat([first,f.torn]));const store=api.openStore(good),value=store.get('stable');store.close();const bytes=Buffer.concat([first,f.malformed]),bad=new MemoryDisk();bad.files.set('store.log',Buffer.from(bytes));const recoveryRejected=rejects(()=>api.recover(bytes)),openRejected=rejects(()=>api.openStore(bad));return [value,recoveryRejected,openRejected,bad.read('store.log').equals(bytes),bad.events];});
  test('05.repair-append','reopen torn tail, then write another batch',[['a','old'],['c','3']],()=>{const d=new MemoryDisk();d.files.set('store.log',Buffer.concat([api.encodeBatch(1,[op('a','old')]),api.encodeRecord(p(2,'b','invisible')).subarray(0,15)]));const s=api.openStore(d);s.put('c','3');return api.openStore(d).entries();});
 }
 if(Number(stage)>=6) {
  test('06.bom-distinct-keys', {operations:[op('key','plain'),op('\uFEFFkey','marked')],then:'close, reopen and read both keys'},['plain','marked',2],()=>{const disk=new MemoryDisk();let store=api.openStore(disk);store.put('key','plain');store.put('\uFEFFkey','marked');store.close();store=api.openStore(disk);return [store.get('key'),store.get('\uFEFFkey'),store.entries().length];});
  test('06.bom-value-reopen', {operations:[op('key','\uFEFFhello')],then:'close and reopen'},'\uFEFFhello',()=>{const disk=new MemoryDisk();let store=api.openStore(disk);store.put('key','\uFEFFhello');store.close();return api.openStore(disk).get('key');});
  test('06.bom-compaction', {operations:[op('key','plain'),op('\uFEFFkey','\uFEFFmarked'),op('\uFEFF','')],then:'reopen, compact, reopen'},['plain','\uFEFFmarked','',3],()=>{const disk=new MemoryDisk();let store=api.openStore(disk);store.batch([op('key','plain'),op('\uFEFFkey','\uFEFFmarked'),op('\uFEFF','')]);store.close();store=api.openStore(disk);store.compact();store.close();store=api.openStore(disk);return [store.get('key'),store.get('\uFEFFkey'),store.get('\uFEFF'),store.entries().length];});
  test('06.usable' ,'put, batch, delete, reopen',[['b','2'],['c','3']],()=>{const d=new MemoryDisk(),s=api.openStore(d);s.put('a','1');s.batch([op('b','2'),op('c','3')]);s.delete('a');s.close();return api.openStore(d).entries();});
  test('06.compact','repeated updates reclaim bytes and reopen latest',[true,[['a','9']]],()=>{const d=new MemoryDisk(),s=api.openStore(d);for(let i=0;i<10;i++)s.put('a',String(i));const before=d.read('store.log').length;s.compact();return [d.read('store.log').length<before,api.openStore(d).entries()];});
  test('06.empty-and-missing','empty value remains distinct from missing',['',null],()=>{const s=api.openStore(new MemoryDisk());s.put('empty','');return [s.get('empty'),s.get('absent')];});
  test('06.closed','closed handles reject reads',true,()=>{const s=api.openStore(new MemoryDisk());s.close();return rejects(()=>s.get('a'));});
  test('06.large-snapshot','more than 128 distinct keys survive compaction',130,()=>{const d=new MemoryDisk(),s=api.openStore(d);for(let n=0;n<130;n++)s.put('key'+n,String(n));s.compact();return api.openStore(d).entries().length;});
  test('06.order','temp synchronized before rename and directory sync',true,()=>{const d=new MemoryDisk(),s=api.openStore(d);s.put('a','1');s.compact();const e=d.events;if(!(e.indexOf('sync:compact.tmp')<e.indexOf('rename')&&e.at(-1)==='syncDir'))caseFailure({events:e,expectedOrder:['sync:compact.tmp','rename','syncDir']});return true;});
 }
 if(Number(stage)>=7) {
  test('07.compaction-cuts','crash after each compaction primitive',true,()=>{const baseline=new MemoryDisk(),s=api.openStore(baseline);s.put('a','1');s.put('a','2');const old=baseline.read('store.log');const probe=new MemoryDisk();probe.files.set('store.log',old);const t=api.openStore(probe);t.compact();const count=probe.events.length;for(let k=1;k<=count;k++){const d=new MemoryDisk({failAt:k,cut:5});d.files.set('store.log',old);try{api.openStore(d).compact();}catch{}d.failAt=Infinity;let actual;try{actual=api.openStore(d).entries();}catch(error){caseFailure({failAt:k,appendCut:5,events:d.events,active_hex:d.read('store.log').toString('hex'),expected:[['a','2']],actual:{error:error.message}});}if(!same(actual,[['a','2']]))caseFailure({failAt:k,appendCut:5,events:d.events,active_hex:d.read('store.log').toString('hex'),expected:[['a','2']],actual});}return true;});
  test('07.failed-writer','after failed append, reject reuse until reopened',true,()=>{const d=new MemoryDisk({failAt:1,cut:5}),s=api.openStore(d);try{s.put('a','1');}catch{}d.failAt=Infinity;return rejects(()=>s.put('b','2'));});
 }
 return results;
}
