// Part one's worked debugger (courses/time-travel-debugger), supplied so part two
// can be done without part one. It is the answer to part one: reading it spoils
// that course. `node lab.mjs wall` uses it when you do not name your own.
import { initial, execute, validateProgram, clone, matches } from './vm.mjs';
export class Debugger {
  constructor(program) {
    this.program = validateProgram(program); this.state = initial(); this.events = [];
    this.breakpoints = []; this.watches = new Set(); this.points = [{ label: 'initial', tick: 0, state: initial() }];
  }
  inspect() { return clone(this.state); }
  step() {
    if (this.state.halted) return null;
    const { state, event } = execute(this.program, this.state);
    this.state = state;
    if (this.events.length < state.tick) this.events.push(clone(event));
    return clone(event);
  }
  addBreakpoint(spec) {
    if (!spec || !Number.isInteger(spec.pc) || spec.pc < 0 || spec.pc >= this.program.length) throw Error('Breakpoint: pc is outside program.');
    if (spec.condition) matches(this.state, spec.condition);
    this.breakpoints.push(clone(spec));
  }
  watch(address) {
    if (!Number.isInteger(address) || address < 0 || address > 7) throw Error('Watchpoint: address must be 0–7.');
    this.watches.add(address);
  }
  run(limit = 1000) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw Error('Run: limit must be an integer from 1–10000.');
    for (let n = 0; n < limit; n++) {
      if (this.state.halted) return this.stop('halt');
      if (this.breakpoints.some(b => b.pc === this.state.pc && (!b.condition || matches(this.state, b.condition)))) return this.stop('breakpoint');
      const event = this.step();
      const changed = event.writes.find(w => this.watches.has(w.address) && w.before !== w.after);
      if (changed) return { ...this.stop('watchpoint'), write: clone(changed) };
      if (this.state.halted) return this.stop('halt');
    }
    return this.stop('limit');
  }
  stop(reason) { return { reason, tick: this.state.tick, pc: this.state.pc }; }
  trace() { return clone(this.events); }
  checkpoint(label) {
    if (typeof label !== 'string' || !label.trim()) throw Error('Checkpoint: provide a label.');
    const point = { label, tick: this.state.tick, state: this.inspect() };
    this.points.push(clone(point)); return clone(point);
  }
  seek(tick) {
    if (!Number.isInteger(tick) || tick < 0 || tick > this.events.length) throw Error('Seek: tick must be within the recorded history.');
    const point = this.points.filter(p => p.tick <= tick).sort((a,b) => b.tick-a.tick)[0];
    let state = clone(point.state);
    while (state.tick < tick) state = execute(this.program, state).state;
    this.state = state; return this.inspect();
  }
  reverseFind(condition, beforeTick = this.state.tick) {
    matches(this.state, condition);
    if (!Number.isInteger(beforeTick) || beforeTick < 0 || beforeTick > this.events.length + 1) throw Error('Reverse search: invalid exclusive bound.');
    const original = this.inspect();
    for (let tick = beforeTick - 1; tick >= 0; tick--) {
      this.seek(tick);
      if (matches(this.state, condition)) return tick;
    }
    this.state = original; return null;
  }
}
