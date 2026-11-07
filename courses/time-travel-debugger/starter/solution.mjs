import { initial, execute, validateProgram, clone, matches } from './vm.mjs';
const unfinished = name => { throw Error(`Unfinished: implement ${name}; read the matching lesson and rerun the check.`); };
export class Debugger {
  constructor(program) { this.program = validateProgram(program); this.state = initial(); }
  inspect() { return unfinished('inspect() in lesson 01'); }
  step() { return unfinished('step() in lesson 01'); }
  addBreakpoint(spec) { return unfinished('addBreakpoint(spec) in lesson 02'); }
  watch(address) { return unfinished('watch(address) in lesson 03'); }
  run(limit = 1000) { return unfinished('run(limit) in lessons 02–03'); }
  trace() { return unfinished('trace() in lesson 04'); }
  checkpoint(label) { return unfinished('checkpoint(label) in lesson 05'); }
  seek(tick) { return unfinished('seek(tick) in lesson 05'); }
  reverseFind(condition, beforeTick = this.state.tick) { return unfinished('reverseFind(condition, beforeTick) in lesson 06'); }
}
