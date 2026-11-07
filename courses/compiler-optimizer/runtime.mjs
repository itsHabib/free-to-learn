// Supplied Kernel IR v1 runtime. This is course infrastructure, not learner work.
import { createHash } from 'node:crypto';

export const VERSION = 'kernel-ir/1';
export const clone = value => structuredClone(value);
export const wordTypes = new Set(['i8', 'i32']);
export const pureOps = new Set(['const', 'add', 'sub', 'mul', 'and', 'or', 'xor', 'eq', 'ne', 'ult', 'ule', 'slt', 'sle', 'ptradd']);
const binary = new Set(['add', 'sub', 'mul', 'and', 'or', 'xor']);
const compareOps = new Set(['eq', 'ne', 'ult', 'ule', 'slt', 'sle']);
const types = new Set(['i8', 'i32', 'bool', 'ptr<i8>', 'ptr<i32>']);
const identifier = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const validIdentifier = value => typeof value === 'string' && identifier.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = /^(0|[1-9][0-9]*)$/;
const signedInteger = /^(0|-?[1-9][0-9]*)$/;
const width = type => type === 'i8' ? 8 : 32;
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function literal(type, value) {
  if (type === 'bool' && typeof value === 'boolean') return value;
  if (!wordTypes.has(type) || typeof value !== 'string' || value.length > 10 || !integer.test(value)) throw new Error('literal.canonical_type');
  const number = BigInt(value);
  if (number >= 1n << BigInt(width(type))) throw new Error('literal.range');
  return number;
}
export function valueJSON(value) { return typeof value === 'bigint' ? value.toString() : clone(value); }
export function evaluate(op, type, values, operandType = type) {
  const [a, b] = values;
  if (op === 'ptradd') return { object: a.object, offset: (BigInt(a.offset) + BigInt.asIntN(32, b)).toString() };
  if (op === 'eq') return a === b;
  if (op === 'ne') return a !== b;
  if (op === 'ult') return a < b;
  if (op === 'ule') return a <= b;
  if (op === 'slt') return BigInt.asIntN(width(operandType), a) < BigInt.asIntN(width(operandType), b);
  if (op === 'sle') return BigInt.asIntN(width(operandType), a) <= BigInt.asIntN(width(operandType), b);
  let answer;
  if (op === 'add') answer = a + b;
  if (op === 'sub') answer = a - b;
  if (op === 'mul') answer = a * b;
  if (op === 'and') answer = a & b;
  if (op === 'or') answer = a | b;
  if (op === 'xor') answer = a ^ b;
  if (answer === undefined) throw new Error(`opcode.unsupported:${op}`);
  return BigInt.asUintN(width(type), answer);
}
export function cfg(program) {
  const successors = Object.fromEntries(program.blocks.map(block => [block.id,
    block.term.op === 'br' ? [block.term.target] : block.term.op === 'cbr' ? [...new Set([block.term.yes, block.term.no])] : []]));
  const predecessors = Object.fromEntries(program.blocks.map(block => [block.id, []]));
  for (const [from, targets] of Object.entries(successors)) for (const target of targets) {
    if (!predecessors[target]) throw new Error(`cfg.missing_block:${target}`);
    predecessors[target].push(from);
  }
  return { successors, predecessors };
}
function reachable(graph, entry, excluded = null) {
  const seen = new Set(); const queue = [entry];
  while (queue.length) {
    const id = queue.pop();
    if (id === excluded || seen.has(id)) continue;
    seen.add(id); queue.push(...(graph.successors[id] ?? []));
  }
  return seen;
}
// Independent checker: dominance by graph reachability with a node removed.
// Learner analysis is assessed separately and is never trusted by this verifier.
export function dominates(program, a, b) {
  if (a === b) return true;
  return !reachable(cfg(program), program.entry, a).has(b);
}
export function definitions(program) {
  const map = new Map(program.params.map(p => [p.id, { ...p, block: null, index: -2 }]));
  for (const block of program.blocks) {
    for (const phi of block.phis) map.set(phi.id, { ...phi, op: 'phi', block: block.id, index: -1 });
    block.instructions.forEach((i, index) => { if (i.id) map.set(i.id, { ...i, block: block.id, index }); });
  }
  return map;
}
export function uses(program) {
  const result = [];
  for (const block of program.blocks) {
    for (const phi of block.phis) for (const [edge, id] of Object.entries(phi.incoming)) result.push({ id, block: edge, index: Infinity, phi: phi.id });
    block.instructions.forEach((instruction, index) => (instruction.args ?? []).forEach(id => result.push({ id, block: block.id, index })));
    if (block.term.cond) result.push({ id: block.term.cond, block: block.id, index: Infinity });
    if (block.term.value) result.push({ id: block.term.value, block: block.id, index: Infinity });
  }
  return result;
}
export function verify(program) {
  const errors = [];
  const fail = message => errors.push(message);
  try {
    const keys = (object, allowed) => { if (!object || Array.isArray(object) || Object.keys(object).some(k => !allowed.includes(k)) || allowed.some(k => !Object.hasOwn(object,k))) throw new Error('schema.fields'); };
    keys(program,['version','name','params','returns','entry','blocks']);
    if (program.version !== 1 || !validIdentifier(program.name) || !Array.isArray(program.params) || !Array.isArray(program.blocks)) throw new Error('program.shape');
    if (!['i8', 'i32', 'bool'].includes(program.returns)) fail('return.type');
    if (program.blocks.length < 1 || program.blocks.length > 64) throw new Error('program.block_limit');
    const blockIDs = program.blocks.map(b => b.id);
    if (new Set(blockIDs).size !== blockIDs.length || blockIDs.some(id => !validIdentifier(id))) throw new Error('block.duplicate_or_invalid');
    if (!blockIDs.includes(program.entry)) throw new Error('entry.missing');
    const names = new Set();
    const define = item => {
      if (!validIdentifier(item.id) || names.has(item.id) || !types.has(item.type)) throw new Error(`definition.invalid:${item.id}`);
      names.add(item.id);
    };
    program.params.forEach(p=>{keys(p,['id','type']);define(p);});
    for (const block of program.blocks) {
      keys(block,['id','phis','instructions','term']);
      if (!Array.isArray(block.phis) || !Array.isArray(block.instructions)) throw new Error('block.shape');
      block.phis.forEach(p=>{keys(p,['id','type','incoming']);define(p);});
      for (const i of block.instructions) {
        if (!pureOps.has(i.op) && !['load', 'store', 'emit'].includes(i.op)) throw new Error(`opcode.unsupported:${i.op}`);
        if (i.op === 'store' || i.op === 'emit') {
          keys(i,['op','args']);
          if (i.id !== undefined || i.type !== undefined) fail('effect.has_result');
          continue;
        }
        keys(i,i.op==='const'?['id','op','type','value']:['id','op','type','args']);
        define(i);
        if (i.op === 'const') literal(i.type, i.value);
      }
      const term = block.term;
      if (!term || !['br', 'cbr', 'ret', 'trap'].includes(term.op)) throw new Error('terminator.invalid');
      keys(term,term.op==='br'?['op','target']:term.op==='cbr'?['op','cond','yes','no']:term.op==='ret'?['op','value']:['op','code']);
      if (term.op === 'cbr' && term.yes === term.no) fail('cfg.duplicate_successor_normalize_first');
      if (term.op === 'trap' && (!validIdentifier(term.code) || term.code === 'bounds')) fail('trap.invalid_code');
    }
    if (names.size > 512) fail('program.definition_limit');
    const graph = cfg(program); const defs = definitions(program);
    if (graph.predecessors[program.entry].length || program.blocks.find(b => b.id === program.entry).phis.length) fail('entry.has_predecessor_or_phi');
    if (reachable(graph, program.entry).size !== program.blocks.length) fail('cfg.unreachable_block');
    const getType = id => { if (!defs.has(id)) throw new Error(`use.undefined:${id}`); return defs.get(id).type; };
    for (const block of program.blocks) {
      for (const phi of block.phis) {
        if (canonical(Object.keys(phi.incoming).sort()) !== canonical([...graph.predecessors[block.id]].sort())) fail(`phi.edges:${phi.id}`);
        for (const value of Object.values(phi.incoming)) if (getType(value) !== phi.type) fail(`phi.type:${phi.id}`);
      }
      for (const i of block.instructions) {
        const ts = (i.args ?? []).map(getType);
        if (i.op === 'const' && (i.args ?? []).length) fail('const.arity');
        if (binary.has(i.op) && (ts.length !== 2 || !wordTypes.has(i.type) || ts.some(t => t !== i.type))) fail(`binary.type:${i.id}`);
        if (compareOps.has(i.op) && (ts.length !== 2 || i.type !== 'bool' || ts[0] !== ts[1] || !wordTypes.has(ts[0]))) fail(`compare.type:${i.id}`);
        if (i.op === 'ptradd' && (ts.length !== 2 || ts[0] !== i.type || !i.type.startsWith('ptr<') || ts[1] !== 'i32')) fail(`ptradd.type:${i.id}`);
        if (i.op === 'load' && (ts.length !== 1 || ts[0] !== `ptr<${i.type}>` || !wordTypes.has(i.type))) fail(`load.type:${i.id}`);
        if (i.op === 'store' && (ts.length !== 2 || ts[0] !== `ptr<${ts[1]}>` || !wordTypes.has(ts[1]))) fail('store.type');
        if (i.op === 'emit' && (ts.length !== 1 || !['i8', 'i32', 'bool'].includes(ts[0]))) fail('emit.type');
      }
      if (block.term.op === 'cbr' && getType(block.term.cond) !== 'bool') fail('branch.requires_bool');
      if (block.term.op === 'ret' && getType(block.term.value) !== program.returns) fail('return.mismatch');
    }
    for (const use of uses(program)) {
      const def = defs.get(use.id);
      if (!def) { fail(`use.undefined:${use.id}`); continue; }
      if (def.block === null) continue;
      if (!dominates(program, def.block, use.block) || (def.block === use.block && def.index >= use.index)) fail(`ssa.non_dominating_use:${use.id}:${use.block}`);
    }
  } catch (error) { fail(error.message); }
  return { ok: errors.length === 0, errors };
}
export function validateContract(program,contract={}) {
  if(!record(contract)||Object.keys(contract).some(k=>!['offsets','minLengths','distinct'].includes(k)))throw new Error('contract.shape');
  for(const key of ['offsets','minLengths'])if(Object.hasOwn(contract,key)&&!record(contract[key]))throw new Error(`contract.${key}_shape`);
  const pointerIDs=new Set(program.params.filter(p=>p.type.startsWith('ptr<')).map(p=>p.id));
  for(const [id,value] of Object.entries(contract.offsets??{}))if(!pointerIDs.has(id)||typeof value!=='string'||value.length>1000||!signedInteger.test(value))throw new Error('contract.offset_shape');
  for(const [id,value] of Object.entries(contract.minLengths??{}))if(!pointerIDs.has(id)||!Number.isSafeInteger(value)||value<0||value>4096)throw new Error('contract.length_shape');
  if(contract.distinct!==undefined&&!Array.isArray(contract.distinct))throw new Error('contract.distinct_shape');
  for(const pair of contract.distinct??[])if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||pair.some(id=>!pointerIDs.has(id)))throw new Error('contract.distinct_shape');
  return true;
}
export function validateInput(program, input, contract = {}) {
  if (!record(input) || !record(input.args) || !record(input.heap)) throw new Error('input.shape');
  if(Object.keys(input).some(k=>!['args','heap'].includes(k)))throw new Error('input.fields');
  if (canonical(Object.keys(input.args).sort()) !== canonical(program.params.map(p => p.id).sort())) throw new Error('input.parameters');
  if (Object.keys(input.heap).length > 64) throw new Error('input.object_limit');
  let cells = 0;
  for (const [id, object] of Object.entries(input.heap)) {
    if(!record(object)||Object.keys(object).some(k=>!['type','cells'].includes(k)))throw new Error('heap.fields');
    if (!validIdentifier(id) || !wordTypes.has(object.type) || !Array.isArray(object.cells)) throw new Error('heap.shape');
    object.cells.forEach(value => literal(object.type, value)); cells += object.cells.length;
  }
  if (cells > 4096) throw new Error('heap.cell_limit');
  const values = new Map();
  for (const p of program.params) {
    const value = input.args[p.id];
    if (!p.type.startsWith('ptr<')) { values.set(p.id, literal(p.type, value)); continue; }
    if (!record(value) || Object.keys(value).some(k=>!['object','offset'].includes(k)) || !validIdentifier(value.object) || typeof value.offset !== 'string' || !signedInteger.test(value.offset) || value.offset.length > 1000) throw new Error('pointer.shape');
    if (!Object.hasOwn(input.heap, value.object) || p.type !== `ptr<${input.heap[value.object].type}>`) throw new Error('pointer.object_type');
    values.set(p.id, clone(value));
  }
  validateContract(program,contract);
  for (const [id, offset] of Object.entries(contract.offsets ?? {})) if (values.get(id)?.offset !== offset) throw new Error('contract.offset');
  for (const [id, count] of Object.entries(contract.minLengths ?? {})) if (!values.get(id)?.object || input.heap[values.get(id).object].cells.length < count) throw new Error('contract.length');
  for (const [a, b] of contract.distinct ?? []) if (!values.get(a)?.object || !values.get(b)?.object || values.get(a).object === values.get(b).object) throw new Error('contract.distinct');
  return values;
}
export function run(program, input, { fuel = 100000, contract = {} } = {}) {
  const validity = verify(program);
  if (!validity.ok) return { kind: 'invalid', errors: validity.errors };
  let env;
  try { env = validateInput(program, input, contract); } catch (e) { return { kind: 'invalid', errors: [e.message] }; }
  if (!Number.isSafeInteger(fuel) || fuel < 0 || fuel > 1000000) return { kind: 'invalid', errors: ['fuel.invalid'] };
  const heap = clone(input.heap), events = [], counts = {};
  const defs = definitions(program), blocks = new Map(program.blocks.map(b => [b.id, b]));
  let current = program.entry, previous = null, steps = 0;
  const tick = op => { if (steps >= fuel) return false; steps++; counts[op] = (counts[op] ?? 0) + 1; return true; };
  const finish = extra => ({ ...extra, heap, events, steps, counts });
  const access = pointer => {
    const object = heap[pointer.object]; const index = BigInt(pointer.offset);
    if (index < 0n || index >= BigInt(object.cells.length)) return null;
    return { object, index: Number(index) };
  };
  while (true) {
    const block = blocks.get(current);
    if (block.phis.length) {
      if (!tick('phi_group')) return finish({ kind: 'unknown', reason: 'fuel' });
      const incoming = block.phis.map(phi => [phi.id, env.get(phi.incoming[previous])]);
      for (const [id, value] of incoming) env.set(id, value);
      counts.phi_values = (counts.phi_values ?? 0) + incoming.length;
    }
    for (const i of block.instructions) {
      if (!tick(i.op)) return finish({ kind: 'unknown', reason: 'fuel' });
      const args = (i.args ?? []).map(id => env.get(id));
      if (i.op === 'const') { env.set(i.id, literal(i.type, i.value)); continue; }
      if (i.op === 'emit') {
        if (events.length >= 4096) return finish({ kind: 'unknown', reason: 'event_limit' });
        events.push({ type: defs.get(i.args[0]).type, value: valueJSON(args[0]) }); continue;
      }
      if (i.op === 'load' || i.op === 'store') {
        const location = access(args[0]);
        if (!location) return finish({ kind: 'trap', code: 'bounds' });
        if (i.op === 'load') env.set(i.id, literal(i.type, location.object.cells[location.index]));
        if (i.op === 'store') location.object.cells[location.index] = valueJSON(args[1]);
        continue;
      }
      env.set(i.id, evaluate(i.op, i.type, args, defs.get(i.args[0]).type));
    }
    const t = block.term;
    if (!tick(t.op)) return finish({ kind: 'unknown', reason: 'fuel' });
    if (t.op === 'ret') return finish({ kind: 'return', type: program.returns, value: valueJSON(env.get(t.value)) });
    if (t.op === 'trap') return finish({ kind: 'trap', code: t.code });
    previous = current; current = t.op === 'br' ? t.target : env.get(t.cond) ? t.yes : t.no;
  }
}
export function observation(result) {
  if (result.kind === 'return') return { kind: result.kind, type: result.type, value: result.value, heap: result.heap, events: result.events };
  if (result.kind === 'trap') return { kind: result.kind, code: result.code, heap: result.heap, events: result.events };
  return null;
}
export function equivalent(a, b) { const x = observation(a), y = observation(b); return x !== null && y !== null && canonical(x) === canonical(y); }
export function cost(result) { return Object.entries(result.counts ?? {}).reduce((sum, [op, n]) => sum + (op === 'phi_group' ? 0 : n), 0); }
