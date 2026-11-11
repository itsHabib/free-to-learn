import {readFileSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {compile,load,flush,click} from '../public/supplier.mjs';
import {raster} from '../public/raster.mjs';
import {readPacket} from './packet.mjs';
export function png(rgba,width,height){
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=bytes=>{let c=0xffffffff;for(const x of bytes)c=table[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const label=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([label,data])));return Buffer.concat([size,label,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
if(process.argv[1]?.endsWith('/render.mjs')||process.argv[1]==='tools/render.mjs'){
 const path=process.argv[2],page=process.argv[3]??'board',output=process.argv[4]??'render.png';
 if(!path)throw Error('Usage: node tools/render.mjs your.body.js [board|field|packet.json] output.png [click]');
 const e=compile(readFileSync(path,'utf8')),s=load(e,readPacket(page));flush(e,s);if(process.argv[5]==='click')click(e,s,{targetId:s.doc.nodes.find(n=>n.tag==='button').id});
 writeFileSync(output,png(raster(s.frame.display,s.viewport),s.viewport.width,s.viewport.height));
 console.log(JSON.stringify({output,page,frame:s.frameId,stageCalls:s.counters,nodes:s.doc.nodes.length,commands:s.frame.display.commands.length}));
}
