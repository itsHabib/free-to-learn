import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

/** Local lesson inputs must be stable, regular and bounded before parsing. */
export async function readJsonFile(path,{maxBytes=1024*1024}={}){
  const original=await lstat(path,{bigint:true});
  if(!original.isFile()||original.isSymbolicLink()) throw new Error('Input must be a regular file, not a link or pipe.');
  if(original.size>BigInt(maxBytes)) throw new Error(`Input exceeds ${maxBytes} bytes.`);
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await file.stat({bigint:true});
    if(!before.isFile()||before.dev!==original.dev||before.ino!==original.ino) throw new Error('Input changed before reading.');
    const chunks=[];
    let size=0;
    for(;;){
      const buffer=Buffer.alloc(Math.min(65536,maxBytes-size+1));
      const {bytesRead}=await file.read(buffer,0,buffer.length,size);
      if(bytesRead===0) break;
      size+=bytesRead;
      if(size>maxBytes) throw new Error(`Input exceeds ${maxBytes} bytes.`);
      chunks.push(buffer.subarray(0,bytesRead));
    }
    const after=await file.stat({bigint:true});
    const current=await lstat(path,{bigint:true});
    if(['dev','ino','size','mtimeNs','ctimeNs'].some(key=>before[key]!==after[key]||before[key]!==current[key])) throw new Error('Input changed while reading.');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{await file.close();}
}
