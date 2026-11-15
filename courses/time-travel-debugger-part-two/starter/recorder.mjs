// Lesson 09: record a run and replay it exactly. API.md, "recorder.mjs", is the contract.
import { createHash } from 'node:crypto';
import { Machine } from './machine.mjs';

// Given: the course's memory hash, the same one public/hash.mjs and the checks use.
export const hashMemory = (memory) => createHash('sha256').update(memory).digest('hex');

const unfinished = (what) => { throw Error(`${what}: not written yet (lesson 09)`); };

export function record(program, imports, calls) { return unfinished('record'); }
export function replay(program, recording, { check = true } = {}) { return unfinished('replay'); }
export function firstDivergence(program, original, tampered) { return unfinished('firstDivergence'); }
