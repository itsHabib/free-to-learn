import {readFileSync} from 'node:fs';
import {pages} from '../public/pages.mjs';
export function readPacket(name='board'){
 if(Object.hasOwn(pages,name))return structuredClone(pages[name]);
 const bytes=readFileSync(name);if(bytes.length>262144)throw Error('Packet file exceeds 256 KiB.');
 return JSON.parse(bytes.toString('utf8'));
}
