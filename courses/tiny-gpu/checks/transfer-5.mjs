// Lesson 5's new application: a toon shader in the course's shader
// language, project/transfer/toon.asm, and its GLSL twin,
// project/transfer/toon.glsl. Run with:
//   node checks/run.mjs project transfer-5
// Section: a heading in lessons/05.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const title = 'A toon shader';
const SECTION = 'A toon shader';

const level = (c) => Math.round(Math.min(1, Math.max(0, c)) * 255);
const js = (x) => JSON.stringify(x);
const r3 = (x) => +Number(x).toFixed(3);

// The GLSL is read, not run: these tests catch a twin that never compares d with the band
// edges or returns a colour that takes nothing from the levels. Only the comparison page
// runs it on a GPU.
const COMPARE = 'node lab.mjs compare 5 project --shader project/transfer/toon.asm';
const TEXT_ONLY = `This check reads the GLSL's text; it does not run it, so it cannot test the bands. Run ${COMPARE} and read its verdict.`;
const NUM = (n) => `(?<![\\d.])${n.replace('.', '\\.')}0*(?![\\d])`;
const num = (n) => new RegExp(NUM(n));
// d >= 0.3, 0.3 <= d, d < 0.3, step(0.3, d)
const compared = (n) => new RegExp(`[<>]=?\\s*${NUM(n)}|${NUM(n)}\\s*[<>]|step\\s*\\(\\s*${NUM(n)}\\s*,`);
// The names whose value comes from a band level, directly or through another such name.
function bandNames(text) {
  const sets = [...text.matchAll(/\b([A-Za-z_]\w*)\s*[-+*/]?=(?!=)([^;]*);/g)].map((m) => [m[1], m[2]]);
  const names = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, rhs] of sets) {
      if (names.has(name)) continue;
      if (num('0.35').test(rhs) || num('0.7').test(rhs) || [...names].some((v) => new RegExp(`\\b${v}\\b`).test(rhs))) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
}

// const float LOW = 0.3; or #define LOW 0.3: the name stands for its
// number in the tests below, so a twin may name its edges and levels.
function resolveConstants(body) {
  const value = new Map();
  const NUMBER = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';
  let out = body.replace(new RegExp(`\\bconst\\s+float\\s+([A-Za-z_]\\w*)\\s*=\\s*${NUMBER}\\s*;`, 'g'), (m, name, v) => {
    value.set(name, String(Number(v)));
    return '';
  });
  out = out.replace(new RegExp(`^[ \\t]*#define\\s+([A-Za-z_]\\w*)[ \\t]+${NUMBER}[ \\t]*$`, 'gm'), (m, name, v) => {
    value.set(name, String(Number(v)));
    return '';
  });
  for (const [name, v] of value) out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), v);
  return out;
}

function file(ctx, name) {
  const p = join(ctx.project, 'transfer', name);
  if (!existsSync(p)) {
    throw Error(`toon shader: not written yet (make transfer/${name} in your project folder, as lesson 5 asks)`);
  }
  return readFileSync(p, 'utf8');
}

export const cases = [
  {
    id: 't5.toon-asm',
    section: SECTION,
    run: async (gpu, ctx) => {
      const text = file(ctx, 'toon.asm');
      const program = gpu.shader.assemble(text);
      for (const c of ctx.fixture('transfer').t5) {
        const out = gpu.shader.runLane(program, c.attrs, {}).out;
        const got = out ? out.map(level) : null;
        const ok = got && got.length === 3
          && got.every((v, i) => Math.abs(v - c.want[i]) <= 1);
        if (!ok) {
          return { message: `toon.asm must give the colour times 0.35 where d = n . light is below 0.3, times 0.7 from 0.3 up to 0.75, and the colour itself from 0.75 up (the lambert light). For colour ${js(c.attrs.slice(0, 3))} and normal ${js(c.attrs.slice(5).map(r3))} (d = ${c.d}) it gave levels ${js(got)}, expected ${js(c.want)}, within 1.` };
        }
      }
      return null;
    },
  },
  {
    id: 't5.toon-glsl',
    section: SECTION,
    run: async (gpu, ctx) => {
      const text = file(ctx, 'toon.glsl');
      const body = resolveConstants(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''));
      const sig = /vec3\s+shade\s*\(\s*vec3\s+color\s*,\s*vec2\s+uv\s*,\s*vec3\s+n\s*\)/.exec(body);
      if (!sig) {
        return { message: 'toon.glsl must define vec3 shade(vec3 color, vec2 uv, vec3 n), the function the comparison page calls, as scenes/shaders/lambert.glsl does.' };
      }
      const missing = ['0.3', '0.75', '0.35', '0.7'].filter((n) => !num(n).test(body));
      if (missing.length) {
        return { message: `toon.glsl must use the same band edges and levels as toon.asm (0.3, 0.75, 0.35, 0.7, then 1). It has no ${missing.join(', ')}. ${TEXT_ONLY}` };
      }
      const shade = body.slice(sig.index);
      const uncompared = ['0.3', '0.75'].filter((n) => !compared(n).test(shade));
      if (uncompared.length) {
        return { message: `toon.glsl must compare d with each band edge, as in if (d >= 0.3) or step(0.3, d). It never compares with ${uncompared.join(' or ')}. ${TEXT_ONLY}` };
      }
      const returns = [...shade.matchAll(/\breturn\b([^;]*);/g)].map((m) => m[1].trim());
      const banded = bandNames(shade);
      const usesLevel = (e) => num('0.35').test(e) || num('0.7').test(e) || [...banded].some((v) => new RegExp(`\\b${v}\\b`).test(e));
      // One return may give the top band's colour as it is; at least one must use a level.
      if (!returns.some(usesLevel)) {
        return { message: `toon.glsl's shade must return the colour times its band's level (0.35, 0.7 or 1). ${returns.length ? `It returns ${returns.join(' or ')}, which takes no value from the levels` : 'It has no return'}. ${TEXT_ONLY}` };
      }
      return { pass: true, note: TEXT_ONLY };
    },
  },
];
