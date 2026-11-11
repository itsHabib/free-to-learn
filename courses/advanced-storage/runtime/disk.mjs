// Supplied I/O adapters. Learners own format, append ordering, recovery and compaction.
import { mkdirSync, existsSync, readFileSync, openSync, closeSync, writeSync, fsyncSync, ftruncateSync, renameSync } from 'node:fs';
import { join } from 'node:path';
const allowed = name => { if(!['store.log','compact.tmp'].includes(name))throw Error('Disk: unknown file name.'); return name; };
export class FileDisk {
  constructor(directory) { this.directory=directory;mkdirSync(directory,{recursive:true}); }
  read(name) {const p=join(this.directory,allowed(name));return existsSync(p)?readFileSync(p):Buffer.alloc(0);}
  append(name,bytes) {const fd=openSync(join(this.directory,allowed(name)),'a');try{return writeSync(fd,bytes);}finally{closeSync(fd);}}
  sync(name) {const fd=openSync(join(this.directory,allowed(name)),'a');try{fsyncSync(fd);}finally{closeSync(fd);}}
  truncate(name,size) {const p=join(this.directory,allowed(name));const fd=openSync(p,existsSync(p)?'r+':'w+');try{ftruncateSync(fd,size);}finally{closeSync(fd);}}
  rename(from,to) {renameSync(join(this.directory,allowed(from)),join(this.directory,allowed(to)));}
  syncDir() {const fd=openSync(this.directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
}
export class MemoryDisk {
  constructor({maxWrite=Infinity,failAt=Infinity,cut=Infinity}={}) {this.files=new Map();this.maxWrite=maxWrite;this.failAt=failAt;this.cut=cut;this.events=[];}
  read(name) {return Buffer.from(this.files.get(allowed(name))??Buffer.alloc(0));}
  event(kind) {this.events.push(kind);if(this.events.length===this.failAt)throw Error('SIMULATED_CRASH after '+kind);}
  append(name,bytes) {const n=Math.min(bytes.length,this.maxWrite,this.events.length+1===this.failAt?this.cut:Infinity);this.files.set(allowed(name),Buffer.concat([this.read(name),bytes.subarray(0,n)]));this.event('append:'+name);return n;}
  sync(name) {allowed(name);this.event('sync:'+name);}
  truncate(name,size) {this.files.set(allowed(name),this.read(name).subarray(0,size));this.event('truncate:'+name);}
  rename(from,to) {this.files.set(allowed(to),this.read(from));this.files.delete(allowed(from));this.event('rename');}
  syncDir() {this.event('syncDir');}
}
export const MAX_BODY=70000;
export function validateRecord(r) {
  if(!r||!['put','del','commit'].includes(r.type)||!Number.isInteger(r.tx)||r.tx<1||r.tx>4294967295)throw Error('Record: type and uint32 transaction id required.');
  if(r.type==='commit') {if(r.key!==null||r.value!==null)throw Error('Commit: key and value must be null.');return;}
  if(typeof r.key!=='string'||!r.key||Buffer.byteLength(r.key)>1024)throw Error('Record: key must be 1–1024 UTF-8 bytes.');
  if(r.type==='put'&&(typeof r.value!=='string'||Buffer.byteLength(r.value)>65536))throw Error('Put: value must be a string of at most 65536 UTF-8 bytes.');
  if(r.type==='del'&&r.value!==null)throw Error('Delete: value must be null.');
}
// FNV-1a is an accidental-corruption check, not an authenticity mechanism.
export function checksum(bytes) {let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h;}
