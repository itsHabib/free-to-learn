// Lessons 10 and 12: run backwards, then stacks and names. API.md, "debugger.mjs", is the contract.
import { Machine } from './machine.mjs';
import { replay } from './recorder.mjs';

const unfinished = (what, lesson = 10) => { throw Error(`${what}: not written yet (lesson ${lesson})`); };

export class Debugger {
  constructor(program, recording, options = {}) { unfinished('Debugger constructor'); }
  get tick() { return unfinished('Debugger.tick'); }
  get end() { return unfinished('Debugger.end'); }
  get snapshots() { return unfinished('Debugger.snapshots'); }
  seek(tick) { return unfinished('Debugger.seek'); }
  step(n = 1) { return unfinished('Debugger.step'); }
  stepBack(n = 1) { return unfinished('Debugger.stepBack'); }
  read(address, size) { return unfinished('Debugger.read'); }
  state() { return unfinished('Debugger.state'); }
  where() { return unfinished('Debugger.where'); }
  continue(stops = {}) { return unfinished('Debugger.continue'); }
  continueBack(stops = {}) { return unfinished('Debugger.continueBack'); }
  lastWrite(address) { return unfinished('Debugger.lastWrite'); }
  stack() { return unfinished('Debugger.stack', 12); }
  stepOut() { return unfinished('Debugger.stepOut', 12); }
}
