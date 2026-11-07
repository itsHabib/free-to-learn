// Original, public kernel cases. Expected results are shown by checks after commit.
const c = (id, type, value) => ({ id, op: 'const', type, value });
const op = (id, opcode, type, ...args) => ({ id, op: opcode, type, args });
const block = (id, instructions, term, phis = []) => ({ id, phis, instructions, term });
const p = (name, params, returns, blocks) => ({ version: 1, name, params, returns, entry: blocks[0].id, blocks });
const param = (id, type) => ({ id, type });
export const emptyInput = args => ({ args, heap: {} });
export function scalarKernel() {
  return p('calibrate', [param('x', 'i8')], 'i8', [block('entry', [
    c('gain', 'i8', '3'), c('biasA', 'i8', '4'), c('biasB', 'i8', '5'),
    op('bias', 'add', 'i8', 'biasA', 'biasB'), op('scaled', 'mul', 'i8', 'x', 'gain'),
    op('duplicate', 'mul', 'i8', 'x', 'gain'), op('answer', 'add', 'i8', 'duplicate', 'bias'),
    c('unused', 'i8', '255')
  ], { op: 'ret', value: 'answer' })]);
}
export function wordKernel(type = 'i32', opcode = 'mul') {
  return p('word', [param('a', type), param('b', type)], ['eq','ne','ult','ule','slt','sle'].includes(opcode) ? 'bool' : type,
    [block('entry', [op('answer', opcode, ['eq','ne','ult','ule','slt','sle'].includes(opcode) ? 'bool' : type, 'a', 'b')], { op: 'ret', value: 'answer' })]);
}
export function reuseKernel(opcode='add') {
  return p('reuse_live_values',[param('x','i8'),param('y','i8')],'i8',[block('entry',[
    op('first',opcode,'i8','x','y'),op('second',opcode,'i8','y','x'),op('answer','sub','i8','first','second')
  ],{op:'ret',value:'answer'})]);
}
export function deadKernel() {
  return p('dead_chain',[param('x','i8')],'i8',[block('entry',[c('unused','i8','13'),op('unused_sum','add','i8','x','unused')],{op:'ret',value:'x'})]);
}
export function equalPhiKernel() {
  const program=diamond(false);program.name='equal_phi';
  program.blocks[1].instructions[0].value='7';program.blocks[2].instructions[0].value='7';
  program.blocks[3].instructions=[c('one','i8','1'),op('answer','add','i8','value','one')];program.blocks[3].term.value='answer';return program;
}
export function forwardingKernel() {
  return p('forward_store',[param('p','ptr<i8>'),param('v','i8')],'i8',[block('entry',[
    {op:'store',args:['p','v']},{op:'emit',args:['v']},op('answer','load','i8','p')
  ],{op:'ret',value:'answer'})]);
}
export function pointerAliasKernel() {
  return p('pointer_aliases',[param('p','ptr<i8>'),param('index','i32')],'i8',[block('entry',[
    c('zero','i32','0'),c('one','i32','1'),c('minusOne','i32','4294967295'),
    op('same','ptradd','ptr<i8>','p','zero'),op('next','ptradd','ptr<i8>','p','one'),op('back','ptradd','ptr<i8>','next','minusOne'),op('unknown','ptradd','ptr<i8>','p','index'),op('answer','load','i8','p')
  ],{op:'ret',value:'answer'})]);
}
export function diamond(constant = false) {
  return p('choose', constant ? [] : [param('gate', 'bool')], 'i8', [
    block('entry', constant ? [c('gate', 'bool', false)] : [], { op: 'cbr', cond: 'gate', yes: 'left', no: 'right' }),
    block('left', [c('a', 'i8', '10')], { op: 'br', target: 'join' }),
    block('right', [c('b', 'i8', '20')], { op: 'br', target: 'join' }),
    block('join', [], { op: 'ret', value: 'value' }, [{ id: 'value', type: 'i8', incoming: { left: 'a', right: 'b' } }])
  ]);
}
export function swapLoop() {
  return p('swap', [param('n', 'i32')], 'i32', [
    block('entry', [c('a0','i32','3'),c('b0','i32','9'),c('zero','i32','0'),c('one','i32','1'),c('ten','i32','10')], {op:'br',target:'head'}),
    block('head', [op('continue','ult','bool','iter','n')], {op:'cbr',cond:'continue',yes:'body',no:'exit'}, [
      {id:'a',type:'i32',incoming:{entry:'a0',body:'b'}},{id:'b',type:'i32',incoming:{entry:'b0',body:'a'}},{id:'iter',type:'i32',incoming:{entry:'zero',body:'next'}}]),
    block('body',[op('next','add','i32','iter','one')],{op:'br',target:'head'}),
    block('exit',[op('tens','mul','i32','a','ten'),op('answer','add','i32','tens','b')],{op:'ret',value:'answer'})
  ]);
}
export function memoryKernel() {
  return p('memory', [param('p','ptr<i8>'),param('q','ptr<i8>'),param('v','i8')], 'i8', [block('entry', [
    op('saved','load','i8','p'),{op:'store',args:['q','v']},op('answer','load','i8','p')
  ],{op:'ret',value:'answer'})]);
}
export function memoryInput(aliased = true) {
  return {args:{p:{object:'A',offset:'0'},q:{object:aliased?'A':'B',offset:'0'},v:'7'},heap:{A:{type:'i8',cells:['4']},...(aliased?{}:{B:{type:'i8',cells:['5']}})}};
}
export function trapKernel() {
  return p('trap_case',[param('p','ptr<i8>')],'i8',[block('entry',[
    c('nine','i8','9'),c('event','i8','42'),c('one','i32','1'),{op:'store',args:['p','nine']},{op:'emit',args:['event']},
    op('outside','ptradd','ptr<i8>','p','one'),op('answer','load','i8','outside')
  ],{op:'ret',value:'answer'})]);
}
export function loopKernel({write = false, scalar = false} = {}) {
  const params = [param('n','i32'),param('p','ptr<i8>')];
  if(write) params.push(param('q','ptr<i8>'));
  const body = scalar ? [op('read','add','i8','a','b')] : [op('read','load','i8','p')];
  body.push(op('sumNext','add','i8','sum','read'));
  if(write) body.push(op('updated','add','i8','read','one8'),{op:'store',args:['q','updated']});
  body.push(op('next','add','i32','iter','one'));
  return p('accumulate',params,'i8',[
    block('entry',[c('zero','i32','0'),c('one','i32','1'),c('zero8','i8','0'),...(write?[c('one8','i8','1')]:[]),...(scalar?[c('a','i8','2'),c('b','i8','3')]:[])],{op:'br',target:'head'}),
    block('head',[op('more','ult','bool','iter','n')],{op:'cbr',cond:'more',yes:'body',no:'exit'},[
      {id:'iter',type:'i32',incoming:{entry:'zero',body:'next'}},{id:'sum',type:'i8',incoming:{entry:'zero8',body:'sumNext'}}]),
    block('body',body,{op:'br',target:'head'}),block('exit',[],{op:'ret',value:'sum'})]);
}
export function loopInput(n = '2', cells = ['1'], write = false) {
  return {args:{n,p:{object:'A',offset:'0'},...(write?{q:{object:'A',offset:'0'}}:{})},heap:{A:{type:'i8',cells}}};
}
export function transferKernel() {
  return p('packet_window', [param('sample','i8'),param('bias','i8')], 'i8', [
    block('entry',[c('zero','i8','0'),c('yesValue','i8','1'),c('noValue','i8','2'),c('k1','i8','3'),c('k2','i8','4'),
      op('irrelevant','mul','i8','k1','k2'),op('shifted','add','i8','sample','bias'),op('flag','slt','bool','shifted','bias')],
      {op:'cbr',cond:'flag',yes:'flagged',no:'clear'}),
    block('flagged',[],{op:'ret',value:'yesValue'}),block('clear',[],{op:'ret',value:'noValue'})]);
}
// A supplied foreign pass for the final investigation. Its correctness is unknown
// to the learner; its implementation is intentionally inspectable.
export function foreignPass(program) {
  const candidate = structuredClone(program);
  const defs = new Map(candidate.blocks.flatMap(b => b.instructions.filter(i=>i.id).map(i=>[i.id,i])));
  for (const b of candidate.blocks) for (const i of b.instructions) {
    if(i.op !== 'slt') continue;
    const sum = defs.get(i.args[0]);
    if(sum?.op !== 'add' || sum.args[1] !== i.args[1]) continue;
    const zero = [...defs.values()].find(d=>d.op==='const'&&d.type===sum.type&&d.value==='0');
    if(zero) i.args = [sum.args[0],zero.id];
  }
  return candidate;
}
