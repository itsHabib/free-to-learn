// Unit 5: a small shader language, its assembler and one lane.
// A lane has 16 float32 registers; every result is rounded to
// float32, as a GPU's shader core would store it.

// The attributes the pipeline interpolates, in order. A program's
// .in line picks from these names.
export const ATTRS = ['r', 'g', 'b', 'u', 'v', 'nx', 'ny', 'nz'];

// region: OPS
// Operand kinds per op. 'dst' is a register written, 'src' a value
// read (register, constant or number), 'dst4' a register that
// starts four (tex writes RGBA), 'tex' a texture name.
export const OPS = {
  mov: ['dst', 'src'],
  add: ['dst', 'src', 'src'],
  sub: ['dst', 'src', 'src'],
  mul: ['dst', 'src', 'src'],
  mad: ['dst', 'src', 'src', 'src'],
  min: ['dst', 'src', 'src'],
  max: ['dst', 'src', 'src'],
  rcp: ['dst', 'src'],
  rsq: ['dst', 'src'],
  floor: ['dst', 'src'],
  frac: ['dst', 'src'],
  slt: ['dst', 'src', 'src'],
  sge: ['dst', 'src', 'src'],
  tex: ['dst4', 'src', 'src', 'tex'],
  out: ['src', 'src', 'src'],
  if: ['src'],
  else: [],
  endif: [],
  loop: [],
  break: ['src'],
  endloop: [],
};
// endregion: OPS

// Ops that move the program counter instead of computing.
export const CONTROL = ['if', 'else', 'endif', 'loop', 'break',
  'endloop'];

export function lineError(line, why) {
  return new Error(`line ${line}: ${why}`);
}

// region: parseOperand
// One operand token to { r: n }, { k: value } or { tex: NAME }.
export function parseOperand(tok, kind, consts, line) {
  if (kind === 'tex') return { tex: tok };
  const reg = /^r(\d+)$/.exec(tok);
  if (reg) {
    const n = Number(reg[1]);
    if (n > 15) {
      throw lineError(line, `${tok} is out of range: r0 to r15`);
    }
    if (kind === 'dst4' && n > 12) {
      throw lineError(line, `tex writes 4 registers from ${tok}: ` +
        'use r12 or lower');
    }
    return { r: n };
  }
  if (kind !== 'src') {
    throw lineError(line, `'${tok}' cannot be written: use a register`);
  }
  if (/^[-+.\d]/.test(tok) && Number.isFinite(Number(tok))) {
    return { k: Math.fround(Number(tok)) };
  }
  const [name, part = 'x', extra] = tok.split('.');
  if (!Object.hasOwn(consts, name)) {
    throw lineError(line, `unknown constant '${name}'`);
  }
  const i = Math.max('xyzw'.indexOf(part), 'rgba'.indexOf(part));
  if (extra !== undefined || i < 0 || i >= consts[name].length) {
    throw lineError(line, `${name} has no component '${part}'`);
  }
  return { k: consts[name][i] };
}
// endregion: parseOperand

// region: directive
// .in names (loaded into r0, r1, ... in order) and .const NAME v...
export function directive(op, words, prog, line) {
  if (op === '.in') {
    for (const name of words) {
      if (!ATTRS.includes(name)) {
        throw lineError(line, `unknown input '${name}': inputs are ` +
          ATTRS.join(' '));
      }
      prog.inputs.push(name);
    }
    return;
  }
  if (op !== '.const') throw lineError(line, `unknown directive ${op}`);
  const [name, ...vals] = words;
  const nums = vals.map(Number);
  const ok = /^[a-z_]\w*$/i.test(name ?? '') && !/^r\d+$/.test(name);
  if (!ok || nums.length < 1 || nums.length > 4 ||
      !nums.every(Number.isFinite)) {
    throw lineError(line, '.const takes a name and 1 to 4 numbers');
  }
  prog.consts[name] = nums.map(Math.fround);
}
// endregion: directive

// region: parseLine
// One line of text to an instruction { op, args, line }, or null for
// a blank line, a comment or a directive (which fills prog).
export function parseLine(raw, prog, line) {
  const words = raw.split(';')[0].split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return null;
  const [op, ...rest] = words;
  if (op.startsWith('.')) {
    directive(op, rest, prog, line);
    return null;
  }
  const kinds = OPS[op];
  if (!kinds) throw lineError(line, `unknown op '${op}'`);
  if (rest.length !== kinds.length) {
    throw lineError(line, `${op} takes ${kinds.length} operands, ` +
      `not ${rest.length}`);
  }
  const args = rest.map((t, j) =>
    parseOperand(t, kinds[j], prog.consts, line));
  const ins = { op, args, line };
  if (CONTROL.includes(op)) ins.match = {}; // filled in by assemble
  return ins;
}
// endregion: parseLine

// region: assemble
export function assemble(text) {
  throw new Error('assemble: not written yet');
}
// endregion: assemble

// The value of an operand on one lane.
export function read(lane, o) {
  return o.r === undefined ? o.k : lane.r[o.r];
}

// region: step
export function step(lane, ins, env) {
  throw new Error('step: not written yet');
}
// endregion: step

// region: loadLane
// A fresh lane with the program's .in attributes in r0, r1, ...
// attrs holds the interpolated attributes in ATTRS order.
export function loadLane(program, attrs) {
  const lane = { r: new Float32Array(16), out: null };
  program.inputs.forEach((name, i) => {
    lane.r[i] = attrs[ATTRS.indexOf(name)];
  });
  return lane;
}
// endregion: loadLane

// A program that runs this long has a loop that never breaks.
export const MAX_ISSUES = 1_000_000;

// region: runLane
// One fragment, one instruction at a time. One issue per instruction
// executed. A false if jumps past its else (or to its endif); an else
// reached by running the if side jumps to its endif; a taken break
// jumps past its endloop; endloop jumps back to just after its loop.
export function runLane(program, attrs, env) {
  const lane = loadLane(program, attrs);
  const code = program.code;
  let pc = 0;
  let issues = 0;
  while (pc < code.length) {
    const ins = code[pc];
    const m = ins.match;
    const yes = () => read(lane, ins.args[0]) !== 0;
    issues += 1;
    if (issues > MAX_ISSUES) {
      throw new Error(`runLane: over ${MAX_ISSUES} issues: a loop ` +
        'never breaks');
    }
    if (ins.op === 'if') {
      pc = yes() ? pc + 1 : m.else === undefined ? m.end : m.else + 1;
    } else if (ins.op === 'else') pc = m.end;
    else if (ins.op === 'break') pc = yes() ? m.end + 1 : pc + 1;
    else if (ins.op === 'endloop') pc = m.start + 1;
    else if (ins.op === 'endif' || ins.op === 'loop') pc += 1;
    else {
      step(lane, ins, env);
      pc += 1;
    }
  }
  return { out: lane.out, issues };
}
// endregion: runLane
