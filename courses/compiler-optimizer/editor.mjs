// Supplied checked edit language. Learners choose analyses and transformations.
import { clone, digest, canonical, definitions, uses, cfg, dominates, pureOps, literal, evaluate, valueJSON, verify, validateContract } from './runtime.mjs';
const commutative = new Set(['add', 'mul', 'and', 'or', 'xor', 'eq', 'ne']);
function need(value, reason) { if (!value) throw new Error(reason); }
function locate(p, id) {
  for (const block of p.blocks) {
    const index = block.instructions.findIndex(i => i.id === id);
    if (index >= 0) return { block, instruction: block.instructions[index], index, phi: false };
    const phi = block.phis.find(i => i.id === id);
    if (phi) return { block, instruction: phi, index: -1, phi: true };
  }
  throw new Error(`edit.missing_definition:${id}`);
}
function drop(p, id) { for (const b of p.blocks) { b.instructions = b.instructions.filter(i => i.id !== id); b.phis = b.phis.filter(i => i.id !== id); } }
function redirect(p, from, to) {
  for (const b of p.blocks) {
    for (const phi of b.phis) for (const edge of Object.keys(phi.incoming)) if (phi.incoming[edge] === from) phi.incoming[edge] = to;
    for (const i of b.instructions) if (i.args) i.args = i.args.map(id => id === from ? to : id);
    if (b.term.value === from) b.term.value = to;
    if (b.term.cond === from) b.term.cond = to;
  }
}
function constantResult(p, i) {
  if (i.op === 'const') return i.value;
  const defs = definitions(p);
  if (i.incoming) {
    const values = Object.values(i.incoming).map(id => defs.get(id));
    need(values.length && values.every(v => v?.op === 'const' && v.type === i.type && canonical(v.value) === canonical(values[0].value)), 'fold.phi_not_constant');
    return values[0].value;
  }
  need(pureOps.has(i.op) && i.op !== 'ptradd', 'fold.not_scalar');
  const values = i.args.map(id => defs.get(id));
  need(values.every(v => v?.op === 'const'), 'fold.operands_not_constant');
  return valueJSON(evaluate(i.op, i.type, values.map(v => literal(v.type, v.value)), values[0].type));
}
function expressionKey(i) {
  let args = [...(i.args ?? [])];
  if (commutative.has(i.op)) args.sort();
  return canonical({ op: i.op, type: i.type, args, ...(i.op === 'const' ? { value: i.value } : {}) });
}
function address(p, id, seen = new Set()) {
  if (seen.has(id)) return null;
  seen.add(id); const d = definitions(p).get(id);
  if (d?.block === null && d.type.startsWith('ptr<')) return { root: id, offset: 0n };
  if (d?.op !== 'ptradd') return null;
  const delta = definitions(p).get(d.args[1]);
  if (delta?.op !== 'const') return null;
  const base = address(p, d.args[0], seen);
  return base && { root: base.root, offset: base.offset + BigInt.asIntN(32, BigInt(delta.value)) };
}
function alias(p, a, b, contract) {
  if (a === b) return 'must';
  const x = address(p, a), y = address(p, b);
  if (!x || !y) return 'may';
  if (x.root === y.root) return x.offset === y.offset ? 'must' : 'no';
  if ((contract.distinct ?? []).some(pair => pair.includes(x.root) && pair.includes(y.root))) return 'no';
  return 'may';
}
function loopShape(p, header) {
  const graph = cfg(p);
  const latches = graph.predecessors[header].filter(id => dominates(p, header, id));
  need(latches.length === 1, 'loop.requires_single_latch');
  const nodes = new Set([header]), queue = [...latches];
  while (queue.length) { const id = queue.pop(); if (nodes.has(id)) continue; nodes.add(id); queue.push(...graph.predecessors[id]); }
  const outside = graph.predecessors[header].filter(id => !nodes.has(id));
  need(outside.length === 1 && graph.successors[outside[0]].length === 1, 'loop.requires_preheader');
  for (const id of nodes) for (const next of graph.successors[id]) if (!nodes.has(next)) need(graph.predecessors[next].every(x => nodes.has(x)), 'loop.requires_dedicated_exits');
  return { nodes, preheader: outside[0] };
}
function cleanup(p) {
  const graph = cfg(p), seen = new Set(), queue = [p.entry];
  while (queue.length) { const id = queue.pop(); if (seen.has(id)) continue; seen.add(id); queue.push(...graph.successors[id]); }
  p.blocks = p.blocks.filter(b => seen.has(b.id));
  const after = cfg(p);
  for (const b of p.blocks) for (const phi of b.phis) for (const edge of Object.keys(phi.incoming)) if (!after.predecessors[b.id].includes(edge)) delete phi.incoming[edge];
}
function apply(p, edit, contract) {
  if (edit.kind === 'branch') {
    const b = p.blocks.find(b => b.id === edit.block), condition = definitions(p).get(b?.term.cond);
    need(b?.term.op === 'cbr' && condition?.op === 'const' && condition.type === 'bool', 'branch.condition_not_constant');
    b.term = { op: 'br', target: condition.value ? b.term.yes : b.term.no }; cleanup(p); return;
  }
  const at = locate(p, edit.id), i = at.instruction;
  if (edit.kind === 'fold') {
    const value = constantResult(p, i); need(canonical(edit.value) === canonical(value), 'fold.wrong_value');
    const replacement = { id: i.id, op: 'const', type: i.type, value };
    if (at.phi) { drop(p, i.id); at.block.instructions.unshift(replacement); return; }
    at.block.instructions[at.index] = replacement; return;
  }
  if (edit.kind === 'dead') { need(!uses(p).some(u => u.id === i.id) && pureOps.has(i.op), 'dead.used_or_effectful'); drop(p, i.id); return; }
  if (edit.kind === 'reuse') {
    const other = locate(p, edit.other);
    need(!at.phi && !other.phi && pureOps.has(i.op) && expressionKey(i) === expressionKey(other.instruction), 'reuse.not_same_total_expression');
    need(dominates(p, other.block.id, at.block.id) && (other.block.id !== at.block.id || other.index < at.index), 'reuse.not_available');
    redirect(p, i.id, other.instruction.id); drop(p, i.id); return;
  }
  if (edit.kind === 'memory') {
    need(i.op === 'load', 'memory.target_not_load');
    const prior = at.block.instructions[edit.priorIndex];
    need(edit.priorIndex >= 0 && edit.priorIndex < at.index && ['load', 'store'].includes(prior?.op), 'memory.prior_access');
    need(alias(p, prior.args[0], i.args[0], contract) === 'must', 'memory.address_not_same');
    for (const middle of at.block.instructions.slice(edit.priorIndex + 1, at.index)) if (middle.op === 'store') need(alias(p, middle.args[0], i.args[0], contract) === 'no', 'memory.intervening_alias_write');
    redirect(p, i.id, prior.op === 'load' ? prior.id : prior.args[1]); drop(p, i.id); return;
  }
  if (edit.kind === 'move') {
    need(!at.phi, 'move.phi'); const loop = loopShape(p, edit.header), defs = definitions(p);
    need(loop.nodes.has(at.block.id), 'move.not_in_loop');
    for (const arg of i.args ?? []) { const d = defs.get(arg); need(d.block === null || (!loop.nodes.has(d.block) && dominates(p, d.block, loop.preheader)), 'move.variant_operand'); }
    if (i.op === 'load') {
      const a = address(p, i.args[0]); need(a && Object.hasOwn(contract.offsets ?? {}, a.root), 'move.no_static_offset');
      const offset = BigInt(contract.offsets[a.root]) + a.offset;
      need(offset >= 0n && offset < BigInt(contract.minLengths?.[a.root] ?? 0), 'move.may_trap');
      for (const b of p.blocks.filter(b => loop.nodes.has(b.id))) for (const op of b.instructions) if (op.op === 'store') need(alias(p, i.args[0], op.args[0], contract) === 'no', 'move.alias_write');
    } else need(pureOps.has(i.op), 'move.effectful');
    drop(p, i.id); p.blocks.find(b => b.id === loop.preheader).instructions.push(i); return;
  }
  throw new Error(`edit.unsupported:${edit.kind}`);
}
export class Editor {
  constructor(program, contract = {}) { need(verify(program).ok,'editor.invalid_source');validateContract(program,contract);this.program = clone(program); this.contract = clone(contract); this.events = []; }
  edit(operation) {
    const before = digest(this.program), candidate = clone(this.program);
    apply(candidate, operation, this.contract);
    const validity = verify(candidate); need(validity.ok, `edit.invalid_output:${validity.errors.join(',')}`);
    this.events.push({ operation: clone(operation), before, after: digest(candidate) }); this.program = candidate; return this;
  }
  finish() { return { program: clone(this.program), events: clone(this.events) }; }
}
export function checkChain(original, artifact, contract = {}) {
  try {
    need(verify(original).ok,'chain.invalid_source');validateContract(original,contract);
    need(artifact && Array.isArray(artifact.events) && artifact.events.length <= 2048, 'chain.shape');
    let current = clone(original);
    for (const event of artifact.events) {
      need(digest(current) === event.before, 'chain.stale_before'); apply(current, event.operation, contract);
      need(digest(current) === event.after, 'chain.wrong_after'); need(verify(current).ok, 'chain.invalid_intermediate');
    }
    need(digest(current) === digest(artifact.program), 'chain.unreported_delta'); need(verify(current).ok, 'chain.invalid_output');
    return { ok: true, events: artifact.events.length };
  } catch (error) { return { ok: false, reason: error.message }; }
}
