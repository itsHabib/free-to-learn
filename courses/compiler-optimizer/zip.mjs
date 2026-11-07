// Small original ZIP-STORED writer for reproducible, dependency-free packages.
import { writeFile } from 'node:fs/promises';
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export async function writeZip(path,entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,data] of entries){
    if(name.startsWith('/')||name.split('/').some(x=>x==='..'||x==='')||name.includes('\\'))throw new Error('Invalid ZIP entry');
    const bytes=Buffer.isBuffer(data)?data:Buffer.from(data),filename=Buffer.from(name),crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
    locals.push(local,filename,bytes);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    centrals.push(central,filename);offset+=local.length+filename.length+bytes.length;
  }
  const centralSize=centrals.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  await writeFile(path,Buffer.concat([...locals,...centrals,end]),{flag:'wx'});
}
