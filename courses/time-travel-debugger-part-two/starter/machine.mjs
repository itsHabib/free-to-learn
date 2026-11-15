// Lesson 08: a machine worth debugging. API.md, "machine.mjs", is the contract.
// Keep everything the machine knows in this.state, one plain object.
const unfinished = (what) => { throw Error(`${what}: not written yet (lesson 08)`); };

export class Machine {
  constructor(program, imports) { unfinished('Machine constructor'); }
  get running() { return unfinished('Machine running'); }
  begin(name, args = []) { unfinished('Machine.begin'); }
  step() { return unfinished('Machine.step'); }
  invoke(name, args = []) { return unfinished('Machine.invoke'); }
}
