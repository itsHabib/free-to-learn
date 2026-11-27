// Checks for unit 5: a shader core. Fixtures from tools/fixtures/u5.mjs.
// Sections (headings in lessons/05.md):
//   Assembling a program        5.assemble-operands
//   Jumping ahead               5.assemble-control
//   Errors that name the line   5.assemble-errors
//   One lane's arithmetic       5.step-arith
//   Negative and zero inputs    5.step-edges
//   Float32 arithmetic          5.step-float32
//   Sixteen registers           5.step-registers
//   Textures and the colour     5.step-tex-out
//   Running a shader            5.run-shaders
//   The lit courtyard           5.courtyard-lambert
import { compareOwners, compareRgb } from './1.mjs';

export const title = 'A shader core';

// Fixtures carry Infinity, NaN and -0 as strings.
const dec = (x) => (typeof x === 'string' ? Number(x) : x);
const same = (a, b) => Object.is(a, b);
const show = (x) => (Object.is(x, -0) ? '-0' : String(x));
const env = { tex: (name, u, v) => [u, v, name === 'floor' ? 0.5 : 0, 1] };

function rethrowNotWritten(e) {
  if (/not written yet/.test(String(e?.message ?? e))) throw e;
}

function argText(a) {
  if (a.r !== undefined) return `r${a.r}`;
  if (a.k !== undefined) return show(a.k);
  return a.tex;
}
const insText = (i) => `${i.op} ${i.args.map(argText).join(', ')}`.trim();

// The parts of an assembled program the contract fixes.
function canonIns(i) {
  const o = {
    op: i.op, line: i.line,
    args: (i.args ?? []).map((a) => (a.r !== undefined ? { r: a.r }
      : a.k !== undefined ? { k: a.k } : { tex: a.tex })),
  };
  const m = Object.entries(i.match ?? {})
    .filter(([, v]) => v !== undefined && v !== null);
  if (m.length) o.match = Object.fromEntries(m);
  return o;
}
const js = (x) => JSON.stringify(x);

function compareStraight(name, text, mine, want) {
  const src = text.split('\n');
  if (js(mine.inputs) !== js(want.inputs)) {
    return `${name}: inputs ${js(mine.inputs)}, expected ` +
      `${js(want.inputs)} (the .in names, in order)`;
  }
  const consts = (c) => js(Object.entries(c ?? {})
    .map(([k, v]) => [k, [...v]]));
  if (consts(mine.consts) !== consts(want.consts)) {
    return `${name}: consts ${consts(mine.consts)}, expected ` +
      `${consts(want.consts)} (each value rounded to float32)`;
  }
  if (mine.code.length !== want.code.length) {
    return `${name}: ${mine.code.length} instructions, expected ` +
      `${want.code.length} (directives, comments and blank lines ` +
      'make none)';
  }
  for (let i = 0; i < want.code.length; i++) {
    const a = canonIns(mine.code[i]);
    const b = canonIns(want.code[i]);
    delete a.match;
    delete b.match;
    if (js(a) !== js(b)) {
      return `${name}, instruction ${i} ("${src[b.line - 1]?.trim()}"):` +
        ` got ${js(a)}, expected ${js(b)}`;
    }
  }
  return null;
}

function compareControl(name, text, mine, want) {
  const src = text.split('\n');
  if (mine.code.length !== want.code.length) {
    return `${name}: ${mine.code.length} instructions, expected ` +
      `${want.code.length}`;
  }
  for (let i = 0; i < want.code.length; i++) {
    const a = js(canonIns(mine.code[i]).match ?? {});
    const b = js(canonIns(want.code[i]).match ?? {});
    if (a !== b) {
      const w = want.code[i];
      return `${name}, instruction ${i} ("${src[w.line - 1].trim()}", ` +
        `line ${w.line}): match ${a}, expected ${b}. Every if, else, ` +
        'loop and break needs the index of the instruction that closes ' +
        'it, which comes later in the text';
    }
  }
  return null;
}

function stepCases(group) {
  return async (gpu, ctx) => {
    for (const c of ctx.fixture('5-step').cases) {
      if (c.group !== group) continue;
      const lane = { r: new Float32Array(c.before.map(dec)), out: null };
      gpu.shader.step(lane, structuredClone(c.ins), env);
      const want = c.after.map(dec);
      const reads = c.ins.op === 'out' ? c.ins.args : c.ins.args.slice(1);
      const used = [...new Set(reads.filter((a) => a.r !== undefined)
        .map((a) => a.r))];
      const given = used.map((n) => `r${n} = ${show(dec(c.before[n]))}`)
        .join(', ');
      for (let n = 0; n < 16; n++) {
        if (same(lane.r[n], want[n])) continue;
        return { message: `${c.name}: "${insText(c.ins)}" with ` +
          `${given || 'no registers read'} left r${n} = ` +
          `${show(lane.r[n])} (it was ${show(dec(c.before[n]))}); ` +
          `expected ${show(want[n])}` };
      }
      const wantOut = c.out && c.out.map(dec);
      const gotOut = lane.out && [...lane.out];
      const outOk = wantOut === null ? gotOut === null
        : gotOut?.length === 3 && wantOut.every((v, i) => same(v, gotOut[i]));
      if (!outOk) {
        return { message: `${c.name}: "${insText(c.ins)}" set lane.out ` +
          `to ${js(gotOut)}; expected ${js(wantOut)}` };
      }
    }
    return null;
  };
}

export const cases = [
  {
    id: '5.assemble-operands',
    section: 'Assembling a program',
    uses: [['shader.mjs', 'assemble']],
    run: async (gpu, ctx) => {
      for (const p of ctx.fixture('5-assemble').programs) {
        if (!['operands', 'lambert', 'textured'].includes(p.name)) continue;
        const bad = compareStraight(p.name, p.text,
          gpu.shader.assemble(p.text), p.expect);
        if (bad) return { message: bad };
      }
      return null;
    },
  },
  {
    id: '5.assemble-control',
    section: 'Jumping ahead',
    uses: [['shader.mjs', 'assemble']],
    run: async (gpu, ctx) => {
      for (const p of ctx.fixture('5-assemble').programs) {
        if (['operands', 'lambert', 'textured'].includes(p.name)) continue;
        const bad = compareControl(p.name, p.text,
          gpu.shader.assemble(p.text), p.expect);
        if (bad) return { message: bad };
      }
      return null;
    },
  },
  {
    id: '5.assemble-errors',
    section: 'Errors that name the line',
    uses: [['shader.mjs', 'assemble']],
    run: async (gpu, ctx) => {
      for (const e of ctx.fixture('5-assemble').errors) {
        let msg = null;
        try {
          gpu.shader.assemble(e.text);
        } catch (err) {
          rethrowNotWritten(err);
          msg = String(err?.message ?? err);
        }
        const text = js(e.text);
        if (msg === null) {
          return { message: `${e.name}: assemble(${text}) returned a ` +
            `program; it should stop with "line ${e.line}: ..." ` +
            `(for example "${e.message}")` };
        }
        if (!msg.includes(`line ${e.line}:`)) {
          return { message: `${e.name}: assemble(${text}) said ` +
            `"${msg}"; the message must name line ${e.line}, counting ` +
            `from 1 (for example "${e.message}")` };
        }
      }
      return null;
    },
  },
  {
    id: '5.step-arith',
    section: "One lane's arithmetic",
    uses: [['shader.mjs', 'step']],
    run: stepCases('arith'),
  },
  {
    id: '5.step-edges',
    section: 'Negative and zero inputs',
    uses: [['shader.mjs', 'step']],
    run: stepCases('edges'),
  },
  {
    id: '5.step-float32',
    section: 'Float32 arithmetic',
    uses: [['shader.mjs', 'step']],
    run: stepCases('float32'),
  },
  {
    id: '5.step-registers',
    section: 'Sixteen registers',
    uses: [['shader.mjs', 'step']],
    run: stepCases('registers'),
  },
  {
    id: '5.step-tex-out',
    section: 'Textures and the colour',
    uses: [['shader.mjs', 'step']],
    run: stepCases('tex-out'),
  },
  {
    id: '5.run-shaders',
    section: 'Running a shader',
    uses: [['shader.mjs', 'assemble'], ['shader.mjs', 'step']],
    run: async (gpu, ctx) => {
      for (const s of ctx.fixture('5-run').shaders) {
        const program = gpu.shader.assemble(s.text);
        for (const c of s.cases) {
          const got = gpu.shader.runLane(program, c.attrs, env);
          const want = c.out.map(dec);
          const ok = got.out?.length === 3 &&
            want.every((v, i) => same(v, got.out[i]));
          if (!ok || got.issues !== c.issues) {
            return { message: `${s.name}.asm on attributes ` +
              `${js(c.attrs)} (r g b u v nx ny nz): colour ` +
              `${js(got.out)} in ${got.issues} issues; expected ` +
              `${js(want)} in ${c.issues}` };
          }
        }
      }
      return null;
    },
  },
  {
    id: '5.courtyard-lambert',
    section: 'The lit courtyard',
    uses: [['shader.mjs', 'assemble'], ['shader.mjs', 'step']],
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('5-courtyard');
      const scene = ctx.scenes.courtyard({ width: fx.size,
        height: fx.size, shader: fx.shader });
      const { image, counts } = gpu.pipeline.render(scene, { stage: 5 });
      const where = `The courtyard lit by ${fx.shader}.asm (${fx.size} ` +
        `x ${fx.size}, stage 5)`;
      const ids = compareOwners(`${where} must keep unit 4's coverage`,
        image.ids, fx, fx.size);
      if (ids) return { message: ids };
      const rgb = compareRgb(`${where}: each pixel's colour is the ` +
        "shader's out", image, fx.rgb, 1);
      if (rgb) return { message: rgb };
      const want = fx.instructions * fx.shaded;
      if (counts.shaded !== fx.shaded || counts.issues !== want) {
        return { message: `${where}: one lane at a time, every ` +
          'fragment that passed the depth test runs every instruction ' +
          `once: ${fx.shaded} fragments x ${fx.instructions} = ${want} ` +
          `issues. Yours: ${counts.shaded} shaded, ${counts.issues} ` +
          'issues.' };
      }
      return null;
    },
  },
];
