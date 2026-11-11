import { checksum, validateRecord, MAX_BODY } from './disk.mjs';
const codes={put:1,del:2,commit:3};
const names={1:'put',2:'del',3:'commit'};
export function encodeRecord(r) {
  validateRecord(r);
  const key=Buffer.from(r.key??''),value=Buffer.from(r.value??'');
  const body=Buffer.alloc(11+key.length+value.length);
  body[0]=codes[r.type];body.writeUInt32BE(r.tx,1);body.writeUInt16BE(key.length,5);body.writeUInt32BE(value.length,7);
  key.copy(body,11);value.copy(body,11+key.length);
  const header=Buffer.alloc(12);header.write('IVY1');header.writeUInt32BE(body.length,4);header.writeUInt32BE(checksum(body),8);
  return Buffer.concat([header,body]);
}
export function decodeRecord(bytes,offset=0) {
  if(!Buffer.isBuffer(bytes)||!Number.isInteger(offset)||offset<0||offset>bytes.length)throw Error('Decode: Buffer and in-range offset required.');
  if(bytes.length-offset<12)return null;
  if(!bytes.subarray(offset,offset+4).equals(Buffer.from('IVY1')))throw Error('Corruption: wrong magic at '+offset);
  const size=bytes.readUInt32BE(offset+4);
  if(size<11||size>MAX_BODY)throw Error('Corruption: invalid body length at '+offset);
  // Present fixed fields can disprove a claimed outer length before its end arrives.
  if(bytes.length-offset>=23) {
    const implied=11+bytes.readUInt16BE(offset+17)+bytes.readUInt32BE(offset+19);
    if(implied!==size)throw Error('Corruption: inner lengths at '+offset);
  }
  if(bytes.length-offset<12+size)return null;
  const body=bytes.subarray(offset+12,offset+12+size);
  if(checksum(body)!==bytes.readUInt32BE(offset+8))throw Error('Corruption: checksum at '+offset);
  const keySize=body.readUInt16BE(5),valueSize=body.readUInt32BE(7),type=names[body[0]];
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  const r={type,tx:body.readUInt32BE(1),key:type==='commit'?null:text.decode(body.subarray(11,11+keySize)),value:type==='put'?text.decode(body.subarray(11+keySize)):null};
  if(type==='commit'&&(keySize||valueSize)||type==='del'&&valueSize)throw Error('Corruption: unused field at '+offset);
  validateRecord(r);return {record:r,bytes:12+size};
}
export function appendLog(disk,bytes,name='store.log') {
  if(!Buffer.isBuffer(bytes))throw Error('Append: bytes must be Buffer.');
  let offset=0;
  while(offset<bytes.length) {
    const n=disk.append(name,bytes.subarray(offset));
    if(!Number.isInteger(n)||n<1||n>bytes.length-offset)throw Error('Append: disk made no valid progress.');
    offset+=n;
  }
  disk.sync(name);return offset;
}
function apply(map,r) {if(r.type==='put')map.set(r.key,r.value);if(r.type==='del')map.delete(r.key);}
const sorted=map=>[...map].sort(([a],[b])=>a<b?-1:a>b?1:0);
export function indexRecords(records) {const map=new Map();for(const r of records){validateRecord(r);apply(map,r);}return sorted(map);}
export function encodeBatch(tx,operations) {
  if(!Array.isArray(operations))throw Error('Batch: use an array of operations.');
  const records=operations.map(op=>{if(!['put','del'].includes(op.type))throw Error('Batch: only put and del operations.');return encodeRecord({type:op.type,tx,key:op.key,value:op.type==='put'?op.value:null});});
  records.push(encodeRecord({type:'commit',tx,key:null,value:null}));return Buffer.concat(records);
}
export function recover(bytes) {
  const map=new Map();let cursor=0,validBytes=0,maxTx=0,pending=[],active=null;
  while(cursor<bytes.length) {
    const item=decodeRecord(bytes,cursor);if(item===null)break;
    cursor+=item.bytes;const r=item.record;
    if(r.tx<=maxTx||active!==null&&active!==r.tx)throw Error('Corruption: interleaved or repeated transaction.');
    active=r.tx;
    if(r.type!=='commit'){pending.push(r);continue;}
    for(const op of pending)apply(map,op);
    pending=[];active=null;maxTx=r.tx;validBytes=cursor;
  }
  return {entries:sorted(map),validBytes,discardedBytes:bytes.length-validBytes,maxTx};
}
export function openStore(disk) {return new Store(disk);}
export class Store {
  constructor(disk) {
    this.disk=disk;this.closed=false;this.poisoned=false;
    const bytes=disk.read('store.log'),r=recover(bytes);
    this.map=new Map(r.entries);this.tx=r.maxTx+1;
    if(bytes.length!==r.validBytes){disk.truncate('store.log',r.validBytes);disk.sync('store.log');}
  }
  ensure() {if(this.closed||this.poisoned)throw Error('Store closed or failed: reopen before use.');}
  get(key) {this.ensure();return this.map.get(key)??null;}
  entries() {this.ensure();return sorted(this.map);}
  put(key,value) {return this.batch([{type:'put',key,value}]);}
  delete(key) {return this.batch([{type:'del',key}]);}
  batch(operations) {
    this.ensure();const bytes=encodeBatch(this.tx,operations);
    try {appendLog(this.disk,bytes);for(const r of operations)apply(this.map,r);this.tx++;}
    catch(e){this.poisoned=true;throw e;}
  }
  compact() {
    this.ensure();const bytes=encodeBatch(this.tx,this.entries().map(([key,value])=>({type:'put',key,value})));
    try {
      this.disk.truncate('compact.tmp',0);appendLog(this.disk,bytes,'compact.tmp');
      this.disk.rename('compact.tmp','store.log');this.disk.syncDir();this.tx++;
    }catch(e){this.poisoned=true;throw e;}
  }
  close() {this.closed=true;}
}
