// Original deterministic teaching VM. No native process access or external inputs.
export const clone = value => structuredClone(value);
const registers = ['a', 'b', 'c', 'd'];
export function initial() {
  return { pc: 0, tick: 0, regs: { a: 0, b: 0, c: 0, d: 0 }, mem: Array(8).fill(0), output: [], halted: false };
}
export function validateProgram(program) {
  if (!Array.isArray(program) || !program.length || program.length > 256) throw Error('VM: program needs 1–256 instructions.');
  for (const [pc, i] of program.entries()) {
    if (!i || !['set', 'add', 'load', 'store', 'jnz', 'emit', 'halt'].includes(i.op)) throw Error(`VM: invalid instruction at pc ${pc}.`);
    if (['set', 'add', 'load'].includes(i.op) && !registers.includes(i.reg)) throw Error(`VM: invalid destination at pc ${pc}.`);
    if (['set', 'add', 'store', 'jnz', 'emit'].includes(i.op) && !(Number.isSafeInteger(i.value) || registers.includes(i.value))) throw Error(`VM: invalid operand at pc ${pc}.`);
    if (['load', 'store'].includes(i.op) && (!Number.isInteger(i.address) || i.address < 0 || i.address > 7)) throw Error(`VM: invalid address at pc ${pc}.`);
    if (i.op === 'jnz' && (!Number.isInteger(i.target) || i.target < 0 || i.target >= program.length)) throw Error(`VM: invalid jump at pc ${pc}.`);
  }
  return clone(program);
}
export function execute(program, state) {
  if (state.halted) throw Error('VM: halted; no instruction executed.');
  const i = program[state.pc];
  if (!i) throw Error(`VM: pc ${state.pc} is outside the program; use halt.`);
  const next = clone(state);
  const value = typeof i.value === 'string' ? state.regs[i.value] : i.value;
  const event = { tick: state.tick + 1, pc: state.pc, op: i.op, writes: [], emitted: [] };
  next.pc++;
  next.tick++;
  if (i.op === 'set') next.regs[i.reg] = value;
  if (i.op === 'add') next.regs[i.reg] += value;
  if (i.op === 'load') next.regs[i.reg] = state.mem[i.address];
  if (i.op === 'store') {
    event.writes.push({ address: i.address, before: state.mem[i.address], after: value });
    next.mem[i.address] = value;
  }
  if (i.op === 'jnz' && value !== 0) next.pc = i.target;
  if (i.op === 'emit') { next.output.push(value); event.emitted.push(value); }
  if (i.op === 'halt') next.halted = true;
  if (Object.values(next.regs).some(n => !Number.isSafeInteger(n))) throw Error('VM: register exceeds safe integer range.');
  return { state: next, event };
}
export function matches(state, condition) {
  if (!condition || !['reg', 'mem'].includes(condition.kind) || !Number.isSafeInteger(condition.equals)) throw Error('Condition: use {kind:"reg",name:"a",equals:2} or {kind:"mem",address:0,equals:2}.');
  if (condition.kind === 'reg' && !registers.includes(condition.name)) throw Error('Condition: unknown register.');
  if (condition.kind === 'mem' && (!Number.isInteger(condition.address) || condition.address < 0 || condition.address > 7)) throw Error('Condition: address must be 0–7.');
  return condition.kind === 'reg' ? state.regs[condition.name] === condition.equals : state.mem[condition.address] === condition.equals;
}
