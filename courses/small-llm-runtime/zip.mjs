// Original dependency-free stored ZIP writer, used in Node and the browser.
const enc=new TextEncoder(),table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const bytes=x=>typeof x==='string'?enc.encode(x):new Uint8Array(x);
function header(size){const b=new Uint8Array(size);return {b,v:new DataView(b.buffer)};}
function concat(parts){const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
export function zipFiles(files){
 const local=[],central=[];let cursor=0;
 for(const [name,input] of files){
   if(!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(x=>x==='..'||!x))throw new Error(`invalid archive path ${name}`);
   const n=enc.encode(name),data=bytes(input),sum=crc(data),h=header(30),c=header(46);
   h.v.setUint32(0,0x04034b50,true);h.v.setUint16(4,20,true);h.v.setUint16(6,0x800,true);h.v.setUint16(12,33,true);h.v.setUint32(14,sum,true);h.v.setUint32(18,data.length,true);h.v.setUint32(22,data.length,true);h.v.setUint16(26,n.length,true);
   c.v.setUint32(0,0x02014b50,true);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x800,true);c.v.setUint16(14,33,true);c.v.setUint32(16,sum,true);c.v.setUint32(20,data.length,true);c.v.setUint32(24,data.length,true);c.v.setUint16(28,n.length,true);c.v.setUint32(42,cursor,true);
   local.push(h.b,n,data);central.push(c.b,n);cursor+=h.b.length+n.length+data.length;
 }
 const dir=concat(central),end=header(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,dir.length,true);end.v.setUint32(16,cursor,true);
 return concat([...local,dir,end.b]);
}
