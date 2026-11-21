// Unit 09 recorder: record a run, replay it exactly from the recording, and
// find the first tick where a tampered replay's memory parts from the original.
// API.md, "recorder.mjs", is the contract. This file uses the Machine in the
// same project folder, so every instruction it runs goes through your step().
//
// The lab and the checks pass a program already loaded by readProgram. A raw
// listing works too, because the Machine loads whatever it is given.
import { createHash } from 'node:crypto';
import { Machine } from './machine.mjs';

// The course's memory hash, the same one public/hash.mjs and the checks use.
export const hashMemory = (memory) =>
  createHash('sha256').update(memory).digest('hex');

// The error replay throws when the run leaves its recording.
export class ReplayDivergence extends Error {
  constructor(divergence) {
    super(
      `replay diverged at tick ${divergence.tick} (call ${divergence.call}): ${divergence.reason}`,
    );
    this.divergence = divergence;
  }
}

// region: record
export function record() {
  throw Error('record: not written yet (lesson 09)');
}
// endregion: record

// region: recorded-imports
export function recordedImports() {
  throw Error('recorded-imports: not written yet (lesson 09)');
}
// endregion: recorded-imports

// region: replay
export function replay() {
  throw Error('replay: not written yet (lesson 09)');
}
// endregion: replay

// region: find-call
export function firstDivergence() {
  throw Error('find-call: not written yet (lesson 09)');
}
// endregion: find-call

// region: run-from
function runFrom() {
  throw Error('run-from: not written yet (lesson 09)');
}
// endregion: run-from

// region: bisect
function bisectCall() {
  throw Error('bisect: not written yet (lesson 09)');
}
// endregion: bisect
