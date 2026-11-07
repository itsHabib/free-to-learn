import { checksum, validateRecord, MAX_BODY } from './disk.mjs';
const todo=name=>{throw Error(`Unfinished: implement ${name}; read the matching lesson, then rerun the check.`);};
export function encodeRecord(record) {return todo('encodeRecord, lesson 01');}
export function decodeRecord(bytes,offset=0) {return todo('decodeRecord, lesson 01');}
export function appendLog(disk,bytes,name='store.log') {return todo('appendLog, lesson 02');}
export function indexRecords(records) {return todo('indexRecords, lesson 03');}
export function encodeBatch(tx,operations) {return todo('encodeBatch, lesson 04');}
export function recover(bytes) {return todo('recover, lessons 04–05');}
export function openStore(disk) {return todo('openStore, lessons 05–06');}
