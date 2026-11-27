// Checks for unit 6: warps, masks and divergence. Fixtures from
// tools/fixtures/u6.mjs; programs arrive already assembled, so a slip
// in unit 5's assembler does not show up here.
// Sections (headings in lessons/06.md):
//   If, else and endif          6.if-handlers
//   The active mask             6.active-mask
//   Divergence                  6.branch-lanes
//   The mask stack              6.nested
//   Loops and break             6.loop-break
//   Counting issues             6.issue-counts
//   Skipping an empty side      6.skip-ratio
//   The courtyard by warps      6.courtyard-warps
//   Eight lanes, one issue      6.courtyard-ratio


import { needsSupplied } from './supplied.mjs';

export const title = 'Warps, masks and divergence';

const dec = (x) => (typeof x === 'string' ? Number(x) : x);
const js = (x) => JSON.stringify(x);
const env = { tex: (name, u, v) => [u, v, name === 'floor' ? 0.5 : 0, 1] };
const bits = (m) => (m >>> 0).toString(2).padStart(8, '0');
const sameOut = (a, b) => (a === null || b === null ? a === b
  : a.length === b.length && a.every((v, i) => Object.is(v, b[i])));

function rethrowNotWritten(e) {
  if (/not written yet/.test(String(e?.message ?? e))) throw e;
}

// The same surface tools/fixtures/u6.mjs used for its grids.
function gridAttrs(x, y, du, dv) {
  const u = (x + 0.5) / du;
  const v = (y + 0.5) / dv;
  return [0.8, 0.6 + 0.2 * v, 0.4 + 0.2 * u, u, v, 0, 1, 0];
}

const program = (ctx, name) =>
  structuredClone(ctx.fixture('6-warps').programs[name].assembled);

// Runs one warp with the learner's runWarp. Returns { issues, lanes }
// or { error } with a message for a throw that is not "not written".
function run(gpu, prog, attrs, mask, skip) {
  const lanes = attrs.map((a) => gpu.shader.loadLane(prog, a));
  try {
    const r = gpu.warp.runWarp(prog, lanes, mask, env, { skip });
    return { issues: r?.issues, lanes };
  } catch (e) {
    rethrowNotWritten(e);
    return { error: String(e?.message ?? e).split('\n')[0] };
  }
}

const label = (w) => `"${w.name}" (${w.program}, mask ${bits(w.mask)}, ` +
  `skip ${w.skip ? 'on' : 'off'})`;

// Every active lane's colour must be the one-lane colour of unit 5;
// every inactive lane must keep its registers and have no colour.
function lanesAgree(gpu, ctx, w) {
  const prog = program(ctx, w.program);
  const res = run(gpu, prog, w.attrs, w.mask, w.skip);
  if (res.error) return `${label(w)}: runWarp threw "${res.error}"`;
  for (let k = 0; k < 8; k++) {
    const got = res.lanes[k].out && [...res.lanes[k].out];
    if (!(w.mask & (1 << k))) {
      const fresh = gpu.shader.loadLane(prog, w.attrs[k]).r;
      const touched = res.lanes[k].r.some((v, i) => !Object.is(v, fresh[i]));
      if (got !== null || touched) {
        return `${label(w)}: lane ${k} is not in the mask, but it ` +
          `${got !== null ? `wrote colour ${js(got)}` : 'changed its ' +
          'registers'}. Inactive lanes must not run`;
      }
      continue;
    }
    const want = gpu.shader.runLane(prog, w.attrs[k], env).out;
    if (!sameOut(got, want)) {
      return `${label(w)}: lane ${k} finished with colour ${js(got)}; ` +
        `running it alone gives ${js(want)}`;
    }
  }
  return null;
}

function groupAgrees(group) {
  return async (gpu, ctx) => {
    for (const w of ctx.fixture('6-warps').warps) {
      if (w.group !== group) continue;
      const bad = lanesAgree(gpu, ctx, w);
      if (bad) return { message: bad };
    }
    return null;
  };
}

function gridRun(gpu, prog, g, skip, each) {
  let issues = 0;
  for (let y0 = 0; y0 < g.h; y0 += 2) {
    for (let x0 = 0; x0 < g.w; x0 += 4) {
      const attrs = Array.from({ length: 8 }, (_, k) =>
        gridAttrs(x0 + (k & 3), y0 + (k >> 2), g.du, g.dv));
      const res = run(gpu, prog, attrs, 0xff, skip);
      if (res.error) {
        return { error: `${g.name}, warp at (${x0}, ${y0}): runWarp ` +
          `threw "${res.error}"` };
      }
      issues += res.issues;
      const bad = each?.(res, attrs, x0, y0);
      if (bad) return { error: bad };
    }
  }
  return { issues };
}

const HANDLER_SECTION = {
  onIf: 'push the mask, narrow it to the active lanes where the ' +
    'operand is not 0, and jump to the else or endif only when none is',
  onElse: 'the mask becomes saved & ~taken, the parent\'s other ' +
    'lanes, and when that is empty (with skipping on) the warp jumps ' +
    'to the endif',
  onEndif: 'pop one entry and bring back its saved mask',
};

export const cases = [
  {
    id: '6.if-handlers',
    section: 'If, else and endif',
    uses: [['warp.mjs', 'onIf'], ['warp.mjs', 'onElse'],
      ['warp.mjs', 'onEndif']],
    run: async (gpu, ctx) => {
      for (const c of ctx.fixture('6-handlers').cases) {
        const lanes = Array.from({ length: 8 }, (_, k) => {
          const r = new Float32Array(16);
          r[0] = c.r0[k] ?? 0;
          return { r, out: null };
        });
        const st = structuredClone(c.st);
        const got = gpu.warp[c.fn](st, structuredClone(c.ins), lanes,
          { ...c.opts });
        const stack = (got?.stack ?? []).map((f) =>
          ({ kind: f.kind, saved: f.saved, taken: f.taken }));
        const mine = { pc: got?.pc, mask: got?.mask, stack };
        if (js(mine) === js(c.expect)) continue;
        const r0 = c.r0.length ? `, r0 per lane ${js(c.r0)}` : '';
        return { message: `${c.fn}, ${c.name}: from ${js(c.st)}${r0}` +
          `${c.opts.skip === false ? ', skip off' : ''} it returned ` +
          `${js(mine)}; expected ${js(c.expect)} (${HANDLER_SECTION[c.fn]})` };
      }
      return null;
    },
  },
  {
    id: '6.active-mask',
    section: 'The active mask',
    uses: [['warp.mjs', 'runWarp'], ['warp.mjs', 'onIf']],
    run: groupAgrees('mask'),
  },
  {
    id: '6.branch-lanes',
    section: 'Divergence',
    uses: [['warp.mjs', 'runWarp'], ['warp.mjs', 'onIf'],
      ['warp.mjs', 'onElse'], ['warp.mjs', 'onEndif']],
    run: async (gpu, ctx) => {
      const bad = await groupAgrees('branch')(gpu, ctx);
      if (bad) return bad;
      // every lane of every warp of the checker surface, both ways
      const g = ctx.fixture('6-warps').grids[0];
      const prog = program(ctx, g.program);
      for (const skip of [true, false]) {
        const res = gridRun(gpu, prog, g, skip, (r, attrs, x0, y0) => {
          for (let k = 0; k < 8; k++) {
            const want = gpu.shader.runLane(prog, attrs[k], env).out;
            const got = r.lanes[k].out && [...r.lanes[k].out];
            if (sameOut(got, want)) continue;
            return `${g.name}, skip ${skip ? 'on' : 'off'}: pixel ` +
              `(${x0 + (k & 3)}, ${y0 + (k >> 2)}), lane ${k}, got ` +
              `${js(got)}; running it alone gives ${js(want)}`;
          }
          return null;
        });
        if (res.error) return { message: res.error };
      }
      return null;
    },
  },
  {
    id: '6.nested',
    section: 'The mask stack',
    uses: [['warp.mjs', 'onIf'], ['warp.mjs', 'onElse'],
      ['warp.mjs', 'onEndif']],
    run: groupAgrees('nested'),
  },
  {
    id: '6.loop-break',
    section: 'Loops and break',
    uses: [['warp.mjs', 'runWarp']],
    run: groupAgrees('loop'),
  },
  {
    id: '6.issue-counts',
    section: 'Counting issues',
    uses: [['warp.mjs', 'runWarp'], ['warp.mjs', 'onIf'],
      ['warp.mjs', 'onElse'], ['warp.mjs', 'onEndif']],
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('6-warps');
      for (const w of fx.warps) {
        const res = run(gpu, program(ctx, w.program), w.attrs, w.mask,
          w.skip);
        if (res.error) return { message: `${label(w)}: runWarp threw ` +
          `"${res.error}"` };
        if (res.issues !== w.issues) {
          return { message: `${label(w)}: ${res.issues} issues; ` +
            `expected ${w.issues}. One issue per instruction the ` +
            'program counter visits, however many lanes are active' };
        }
      }
      for (const g of fx.grids) {
        const prog = program(ctx, g.program);
        for (const skip of [true, false]) {
          const res = gridRun(gpu, prog, g, skip);
          if (res.error) return { message: res.error };
          const want = skip ? g.issues.skip : g.issues.noskip;
          if (res.issues !== want) {
            return { message: `${g.name} (${g.w} x ${g.h} pixels, ` +
              `skip ${skip ? 'on' : 'off'}): ${res.issues} issues in ` +
              `all; expected ${want}` };
          }
        }
      }
      return null;
    },
  },
  {
    id: '6.skip-ratio',
    section: 'Skipping an empty side',
    uses: [['warp.mjs', 'onIf'], ['warp.mjs', 'onElse']],
    run: async (gpu, ctx) => {
      const fx = ctx.fixture('6-warps');
      const g = fx.grids.find((x) => x.program === 'coherent-branch');
      const prog = program(ctx, g.program);
      const colours = [];
      const on = gridRun(gpu, prog, g, true, (r) => {
        colours.push(...r.lanes.map((l) => l.out && [...l.out]));
      });
      if (on.error) return { message: on.error };
      let i = 0;
      const off = gridRun(gpu, prog, g, false, (r, attrs, x0, y0) => {
        for (let k = 0; k < 8; k++, i++) {
          const got = r.lanes[k].out && [...r.lanes[k].out];
          if (sameOut(got, colours[i])) continue;
          return `${g.name}: pixel (${x0 + (k & 3)}, ${y0 + (k >> 2)}) ` +
            `is ${js(colours[i])} with skipping and ${js(got)} without; ` +
            'skipping an empty side must not change any colour';
        }
        return null;
      });
      if (off.error) return { message: off.error };
      const ratio = off.issues / on.issues;
      if (!(ratio >= fx.skipGate)) {
        return { message: `${g.name}: ${on.issues} issues with skipping, ` +
          `${off.issues} running both sides, ratio ${ratio.toFixed(2)}; ` +
          `skipping must save at least ${fx.skipGate}x on this ` +
          `branch most warps agree on (the reference measures ${g.ratio})` };
      }
      return null;
    },
  },
  {
    id: '6.courtyard-warps',
    section: 'The courtyard by warps',
    uses: [['warp.mjs', 'runWarp']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('6-courtyard');
      const scene = ctx.scenes.courtyard({ shader: fx.shader });
      const one = gpu.pipeline.render(scene, { stage: 5 });
      const warp = gpu.pipeline.render(scene, { stage: 6 });
      const a = one.image;
      const b = warp.image;
      for (let i = 0; i < a.ids.length; i++) {
        const same = a.ids[i] === b.ids[i] && [0, 1, 2, 3].every((k) =>
          a.rgba[i * 4 + k] === b.rgba[i * 4 + k]);
        if (same) continue;
        const show = (im) => `triangle ${im.ids[i]}, colour ` +
          js([...im.rgba.subarray(i * 4, i * 4 + 3)]);
        return { message: `The courtyard lit by ${fx.shader}.asm ` +
          `(${fx.width} x ${fx.height}) must be the same picture by ` +
          `warps (stage 6) as one lane at a time (stage 5). Pixel ` +
          `(${i % a.w}, ${Math.floor(i / a.w)}): ${show(b)} by warps, ` +
          `${show(a)} one lane at a time.` };
      }
      if (warp.counts.warps !== fx.warps) {
        return { message: `The courtyard by warps: one warp per 4 x 2 ` +
          'block per triangle with at least one pixel that passed the ' +
          `depth test; ${warp.counts.warps} warps, expected ${fx.warps}.` };
      }
      return null;
    }),
  },
  {
    id: '6.courtyard-ratio',
    section: 'Eight lanes, one issue',
    uses: [['warp.mjs', 'runWarp']],
    run: needsSupplied(async (gpu, ctx) => {
      const fx = ctx.fixture('6-courtyard');
      const scene = ctx.scenes.courtyard({ shader: fx.shader });
      const one = gpu.pipeline.render(scene, { stage: 5 }).counts.issues;
      const warp = gpu.pipeline.render(scene, { stage: 6 }).counts.issues;
      const ratio = one / warp;
      if (ratio >= fx.ratioGate) return null;
      return { message: `The courtyard lit by ${fx.shader}.asm: ${one} ` +
        `issues one lane at a time, ${warp} by warps, ratio ` +
        `${ratio.toFixed(2)}; warps must issue at least ` +
        `${fx.ratioGate} times fewer (measured ${fx.ratio}).` };
    }),
  },
];
