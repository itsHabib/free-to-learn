// Draws the lesson figures in lessons/figures/ from the course's own code, so a figure can't drift from
// what the runtime does.
//   node tools/figures.mjs           write the figures
//   node tools/figures.mjs --check   exit 1 if any figure differs from what the course gives now
//   node tools/figures.mjs --data    print the numbers each figure is drawn from
// Every byte, row index and count below comes from running reference/runtime.mjs, lib/wasm.mjs,
// lib/bakeoff.mjs or an example on the inputs the lessons use; the stack walk follows evaluate step by step and
// is checked against interpret. The inputs (the demo's six quantities, the 80-row tail, batch size 256) are the
// lessons' own and are copied here. Only the layout is placed by hand. The lesson alt text is written by hand from
// `--data`; rerun it after a change.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpret, compile, run } from '../reference/runtime.mjs';
import { signedI32 } from '../lib/wasm.mjs';
import { fixedRule, workloads } from '../lib/bakeoff.mjs';
import { replayBug } from '../examples/replay-bug.mjs';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(course, 'lessons', 'figures');
const over30 = [['load'], ['const', 30], ['gt']];

// ---------------------------------------------------------------- data, one function per figure

// Lesson 01: the stack after each instruction of over30, for a quantity and for a missing one. The steps
// follow evaluate in reference/runtime.mjs; the last stack must equal what interpret answers.
function stackData() {
  const rows = [46, null].map(value => {
    const stack = [], steps = [];
    for (const [op, literal] of over30) {
      let popped = null;
      if (op === 'load') stack.push(value);
      else if (op === 'const') stack.push(literal);
      else {
        const right = stack.pop(), left = stack.pop();
        popped = { left, right };
        stack.push(left !== null && right !== null && left > right);
      }
      steps.push({ op: [op, literal].filter(x => x !== undefined).join(' '), stack: stack.slice(), popped });
    }
    const answer = interpret(over30, value);
    if (stack.length !== 1 || stack[0] !== answer) throw Error(`stack walk for ${value} ends at ${stack} but interpret says ${answer}`);
    return { value, steps, answer };
  });
  return { program: over30, rows };
}

// Lesson 02: the bytes the reference compiler emits for quantity > -70, read back out of the module it
// hands to WebAssembly. The predicate built from them must agree with the interpreter on the lesson's inputs.
function bytesData() {
  const program = [['load'], ['const', -70], ['gt']];
  const Original = WebAssembly.Module;
  let module = null;
  WebAssembly.Module = function (bytes) { module = Uint8Array.from(bytes); return new Original(bytes); };
  let predicate;
  try { predicate = compile(program); } finally { WebAssembly.Module = Original; }
  const inputs = [-71, -70, -69, 0];
  const results = inputs.map(v => predicate(v));
  inputs.forEach((v, i) => { if (results[i] !== Number(interpret(program, v))) throw Error(`compiled and interpreted disagree at ${v}`); });
  // Walk the module's sections: id, unsigned length, payload.
  const sections = [];
  let at = 8;
  while (at < module.length) {
    const id = module[at];
    let size = 0, shift = 0, p = at + 1, b;
    do { b = module[p++]; size |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    sections.push({ id, at, header: p - at, size, end: p + size });
    at = p + size;
  }
  const code = sections.find(s => s.id === 10);
  // Code section payload: function count, body size, local declarations (0), instructions, end (0x0b).
  const bodyAt = code.end - code.size + 2;
  const instructions = [...module.slice(bodyAt + 1, code.end - 1)];
  const groups = program.map(([op, literal]) => ({
    tuple: [op, literal].filter(x => x !== undefined).join(' '),
    label: literal === undefined ? `['${op}']` : `['${op}', ${literal}]`,
    bytes: op === 'load' ? [0x20, 0x00] : op === 'const' ? [0x41, ...signedI32(literal)] : [0x4a],
    wasm: op === 'load' ? 'local.get 0' : op === 'const' ? `i32.const ${literal}` : 'i32.gt_s',
  }));
  if (groups.flatMap(g => g.bytes).join() !== instructions.join()) throw Error('module body is not the three groups in order');
  const leb = signedI32(-70);
  // Decode the payloads, last byte's first, as a signed number of 7 * n bits.
  const bits = leb.length * 7;
  let raw = 0;
  leb.forEach((b, i) => { raw += (b & 0x7f) * 2 ** (7 * i); });
  const decoded = raw >= 2 ** (bits - 1) ? raw - 2 ** bits : raw;
  if (decoded !== -70) throw Error(`signed LEB128 decodes to ${decoded}`);
  const names = { 1: 'type', 3: 'function', 7: 'export', 10: 'code' };
  return { program, groups, results, inputs, leb, decoded, total: module.length,
    sections: [{ name: 'header', bytes: 8 }, ...sections.map(s => ({ name: names[s.id] ?? `section ${s.id}`, bytes: s.header + s.size }))],
    body: instructions.length };
}

// Lesson 03: the worked demo (six orders, one batch, compile chosen) and the deliberately wrong restart in
// examples/replay-bug.mjs next to the correct runtime on the same three orders.
function handoffData() {
  const demoValues = [40, 18, 70, null, 31, 30];
  const demo = run(over30, demoValues, { batchSize: 6, choose: () => 'compile' });
  const guard = demo.trace.find(e => e.kind === 'guard-failure');
  const batch = demo.trace.find(e => e.kind === 'batch');
  const bugValues = [45, null, 46];
  const bug = replayBug();
  const right = run(over30, bugValues, { batchSize: 3, choose: () => 'compile' });
  const rightGuard = right.trace.find(e => e.kind === 'guard-failure');
  return { demo: { values: demoValues, matches: demo.matches, guard, compiledRows: batch.compiledRows, interpreted: batch.interpreted },
    bug: { values: bugValues, ...bug }, right: { matches: right.matches, resumeAt: rightGuard.resumeAt } };
}

// Lesson 04: fixedRule's answer over remaining rows and the previous 256-row batch's null count, with and
// without a cached predicate, and the lesson's three cases.
function ruleData() {
  const rows = 256, step = 32, maxRemaining = 1024, maxNulls = 16;
  const panels = [false, true].map(compiled => {
    const grid = [];
    for (let nulls = 0; nulls <= maxNulls; nulls++) {
      const line = [];
      for (let r = 0; r < maxRemaining; r += step) line.push(fixedRule({ remainingRows: r + step / 2, compiled, previous: { rows, nulls, guardFailures: 0 } }));
      grid.push(line);
    }
    return { compiled, grid };
  });
  // The last null count that still compiles and the least remaining rows that build a fresh predicate.
  const nullLimit = Math.max(...Array.from({ length: maxNulls + 1 }, (_, n) => n).filter(n => fixedRule({ remainingRows: 4096, compiled: true, previous: { rows, nulls: n } }) === 'compile'));
  let minRemaining = 0;
  while (fixedRule({ remainingRows: minRemaining, compiled: false, previous: { rows, nulls: 0 } }) !== 'compile') minRemaining++;
  const cases = [
    { label: 'opening', remainingRows: 768, nulls: 2, compiled: false },
    { label: '80 rows', remainingRows: 80, nulls: 0, compiled: false },
    { label: '80 rows', remainingRows: 80, nulls: 0, compiled: true },
  ].map(c => ({ ...c, action: fixedRule({ remainingRows: c.remainingRows, compiled: c.compiled, previous: { rows, nulls: c.nulls } }) }));
  const first = fixedRule({ remainingRows: 4096, compiled: false, previous: { rows: 0, nulls: 0 } });
  return { rows, step, maxRemaining, maxNulls, panels, nullLimit, minRemaining, cases, first };
}

// Lesson 04 capstone: the two importer layouts from `race --shift --seed 1901`, run under fixedRule.
function positionData() {
  const seed = 1901;
  const layouts = workloads(seed, true).map(w => {
    const { matches, trace } = run(over30, w.values, { batchSize: 256, choose: fixedRule });
    if (matches.join() !== w.expected.join()) throw Error(`${w.name}: wrong matches`);
    const batches = trace.filter(e => e.kind === 'batch').map(b => ({ compiledRows: b.compiledRows, interpreted: b.interpreted, nulls: b.nulls }));
    const nullAt = w.values.slice(256, 512).indexOf(null);
    return { name: w.name, rows: w.values.length, batches, nullAt,
      exits: trace.filter(e => e.kind === 'guard-failure').length,
      builds: trace.filter(e => e.kind === 'compile').length,
      compiledRows: batches.reduce((s, b) => s + b.compiledRows, 0) };
  });
  return { seed, layouts };
}

// ---------------------------------------------------------------- drawing
const W = 480;
const INK = '#1f2b29', MUTED = '#5c6865', RULE = '#c9d2cf', WASM = '#1f6f68', WASM_BG = '#d8ece8', INTERP = '#a65a17', INTERP_BG = '#f6e3cf', BAD = '#b3261e';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = v => v.toLocaleString('en-US');
const show = v => (v === null ? 'null' : String(v));
const t = (x, y, s, a = '') => `<text x="${x}" y="${y}"${a ? ' ' + a : ''}>${esc(s)}</text>`;
const box = (x, y, w, h, fill, stroke = INK, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"${extra ? ' ' + extra : ''}/>`;
function svg(h, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="t d" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="14" fill="${INK}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<rect width="${W}" height="${h}" fill="#ffffff"/>
${body.join('\n')}
</svg>
`;
}

function stackFigure(d) {
  const body = [t(16, 24, 'The stack after each instruction of over30', 'font-weight="600"')];
  const colX = [140, 258, 376], bw = 64, bh = 24;
  d.program.forEach(([op, lit], i) => body.push(t(colX[i] + bw / 2, 52, lit === undefined ? `['${op}']` : `['${op}', ${lit}]`, `text-anchor="middle" font-size="13" ${MONO}`)));
  body.push(`<line x1="16" y1="62" x2="${W - 16}" y2="62" stroke="${RULE}"/>`);
  d.rows.forEach((row, r) => {
    const base = 136 + r * 110; // bottom of the stack
    body.push(t(16, base - 30, `quantity ${show(row.value)}`, 'font-weight="600"'));
    body.push(t(16, base - 12, `answer: ${row.answer}`, `font-size="13" fill="${MUTED}"`));
    row.steps.forEach((step, i) => {
      step.stack.forEach((v, k) => {
        const y = base - (k + 1) * bh;
        const top = k === step.stack.length - 1;
        const bool = typeof v === 'boolean';
        body.push(box(colX[i], y, bw, bh, bool ? WASM_BG : '#f3f5f4', top ? INK : MUTED));
        body.push(t(colX[i] + bw / 2, y + 17, show(v), `text-anchor="middle" ${MONO}`));
      });
      const topY = base - step.stack.length * bh;
      body.push(t(colX[i] + bw + 4, topY + 16, '← top', `font-size="12.5" fill="${MUTED}"`));
      if (step.popped) body.push(t(colX[i] + bw / 2, base + 18, step.popped.left === null || step.popped.right === null ? 'a null operand: false' : `left ${show(step.popped.left)} > right ${show(step.popped.right)}`, `text-anchor="middle" font-size="13" fill="${MUTED}"`));
    });
  });
  const h = 136 + 110 + 38;
  const [a, b] = d.rows;
  const desc = `The program load, const 30, gt, run on two orders. Quantity ${a.value}: after load the stack holds ${a.steps[0].stack.join(', ')}; after const 30 it holds ${a.steps[1].stack.join(', ')} with 30 on top; gt pops 30 as the right operand and ${a.value} as the left and pushes ${a.answer}. Missing quantity: load pushes null, const 30 pushes 30, and gt pushes ${b.answer} because one operand is null.`;
  return svg(h, 'The stack after each instruction', desc, body);
}

function bytesFigure(d) {
  const body = [t(16, 24, 'quantity > -70, compiled to WebAssembly bytes', 'font-weight="600"')];
  const cw = 46, x0 = 70, y0 = 62;
  let x = x0;
  for (const g of d.groups) {
    const w = g.bytes.length * cw;
    body.push(t(x + w / 2, y0 - 10, g.label, `text-anchor="middle" font-size="13" ${MONO}`));
    g.bytes.forEach((b, i) => {
      body.push(box(x + i * cw, y0, cw, 28, g.tuple.startsWith('const') ? '#eef3f2' : '#f3f5f4'));
      body.push(t(x + i * cw + cw / 2, y0 + 19, b.toString(16).toUpperCase().padStart(2, '0'), `text-anchor="middle" ${MONO}`));
    });
    body.push(t(x + w / 2, y0 + 46, g.wasm, `text-anchor="middle" font-size="13" fill="${MUTED}" ${MONO}`));
    x += w + 10;
  }
  body.push(t(16, y0 + 19, 'bytes', `font-size="13" fill="${MUTED}"`));
  // The signed LEB128 bytes of the literal, bit by bit.
  const y1 = 150, bit = 22, lx = 70;
  body.push(t(16, y1 - 10, `-70 takes ${d.leb.length} bytes: 7 payload bits each, lowest group first`, 'font-weight="600" font-size="13"'));
  d.leb.forEach((b, j) => {
    const bx = lx + j * (8 * bit + 40);
    const bits = b.toString(2).padStart(8, '0');
    [...bits].forEach((c, i) => {
      const fill = i === 0 ? INTERP_BG : (j === d.leb.length - 1 && i === 1) ? WASM_BG : '#f3f5f4';
      body.push(box(bx + i * bit, y1 + 6, bit, 26, fill, MUTED));
      body.push(t(bx + i * bit + bit / 2, y1 + 24, c, `text-anchor="middle" ${MONO}`));
    });
    body.push(t(bx + 4 * bit, y1 + 50, `0x${b.toString(16).toUpperCase()}`, `text-anchor="middle" font-size="13" fill="${MUTED}" ${MONO}`));
    body.push(t(bx + bit / 2, y1 + 66, b & 0x80 ? 'more follows' : 'last byte', `font-size="12.5" fill="${INTERP}"`));
  });
  const last = lx + (d.leb.length - 1) * (8 * bit + 40);
  body.push(t(last + bit * 1.5, y1 + 82, 'sign bit: 1, negative', `font-size="12.5" fill="${WASM}"`));
  // The module around the body.
  const y2 = 270, mx = 16, mw = W - 32;
  body.push(t(16, y2 - 12, `the whole module is ${d.total} bytes; your instructions are ${d.body}`, 'font-weight="600" font-size="13"'));
  let sx = mx;
  for (const s of d.sections) {
    const w = (s.bytes / d.total) * mw;
    body.push(box(sx, y2, w, 24, s.name === 'code' ? WASM_BG : '#f3f5f4', MUTED));
    body.push(t(sx + w / 2, y2 + (w < s.name.length * 7.5 ? 56 : 40), s.name, `text-anchor="middle" font-size="12.5" fill="${MUTED}"`));
    body.push(t(sx + w / 2, y2 + 16, String(s.bytes), `text-anchor="middle" font-size="12.5" ${MONO}`));
    sx += w;
  }
  const h = y2 + 70;
  const desc = `The program load, const -70, gt as the reference compiler emits it. load becomes 20 00 (local.get 0); const -70 becomes 41 then ${d.leb.map(b => b.toString(16).toUpperCase()).join(' ')} (i32.const -70); gt becomes 4A (i32.gt_s). The literal -70 needs ${d.leb.length} bytes of signed LEB128: ${d.leb.map(b => b.toString(2).padStart(8, '0')).join(' and ')}. The first bit of each byte says whether another byte follows; the other seven are payload, the lowest 7-bit group first, each byte drawn high bit first; the second bit of the last byte, its highest payload bit, is the sign. The whole module is ${d.total} bytes (${d.sections.map(s => `${s.name} ${s.bytes}`).join(', ')}), of which ${d.body} are the instructions.`;
  return svg(h, 'quantity > -70 as WebAssembly bytes', desc, body);
}

function strip(body, values, x0, y, cw, mark = {}) {
  values.forEach((v, i) => {
    body.push(t(x0 + i * cw + cw / 2, y - 6, `row ${i}`, `text-anchor="middle" font-size="12.5" fill="${MUTED}"`));
    body.push(box(x0 + i * cw, y, cw, 30, v === null ? '#fbe9e7' : '#f3f5f4', mark[i] ?? INK));
    body.push(t(x0 + i * cw + cw / 2, y + 20, show(v), `text-anchor="middle" ${MONO}`));
  });
}
function band(body, x, y, w, color, bg, label) {
  body.push(box(x, y, w, 18, bg, color));
  body.push(t(x + w / 2, y + 13, label, `text-anchor="middle" font-size="12.5" fill="${color}"`));
}

function handoffFigure(d) {
  const body = [t(16, 24, 'One cursor, two engines', 'font-weight="600"')];
  const cw = 56, x0 = 40;
  // The worked demo.
  const { demo } = d;
  body.push(t(16, 52, 'node lab.mjs demo --worked: one batch of six orders, compile chosen', `font-size="13" fill="${MUTED}"`));
  strip(body, demo.values, x0, 78, cw);
  band(body, x0, 114, demo.compiledRows * cw, WASM, WASM_BG, 'Wasm predicate');
  band(body, x0 + demo.compiledRows * cw, 136, demo.interpreted * cw, INTERP, INTERP_BG, 'interpreter');
  const gx = x0 + demo.guard.at * cw;
  body.push(`<line x1="${gx}" y1="70" x2="${gx}" y2="156" stroke="${BAD}" stroke-width="2"/>`);
  body.push(t(gx + 6, 172, `guard fails at row ${demo.guard.at}; resume at ${demo.guard.resumeAt}`, `font-size="13" fill="${BAD}"`));
  for (const m of demo.matches) body.push(t(x0 + m * cw + cw - 4, 91, '✓', `text-anchor="end" font-size="13" fill="${WASM}"`));
  body.push(t(x0 + 6 * cw + 12, 98, `matches`, `font-size="13" fill="${MUTED}"`));
  body.push(t(x0 + 6 * cw + 12, 114, demo.matches.join(', '), `font-size="13" ${MONO}`));
  // The wrong restart and the right one.
  const y = 222;
  body.push(t(16, y - 12, `examples/replay-bug.mjs restarts at ${d.bug.resumeAt}; the runtime resumes at ${d.right.resumeAt}`, `font-size="13" fill="${MUTED}"`));
  strip(body, d.bug.values, x0, y + 14, cw);
  const ox = x0 + 3 * cw + 24;
  // Restart at 0.
  band(body, x0, y + 50, d.bug.failedAt * cw, WASM, WASM_BG, 'Wasm');
  band(body, x0 + d.bug.resumeAt * cw, y + 72, (3 - d.bug.resumeAt) * cw, BAD, '#fbe9e7', "interpreter");
  body.push(t(ox, y + 64, 'restart at 0', `font-size="13" fill="${MUTED}"`));
  body.push(t(ox, y + 82, `matches ${d.bug.matches.join(', ')}`, `font-size="13" ${MONO}`));
  const dup = d.bug.matches.findIndex((m, i) => d.bug.matches.indexOf(m) !== i);
  body.push(t(ox + 150, y + 82, `row ${d.bug.matches[dup]} twice`, `font-size="13" fill="${BAD}"`));
  // Resume at the guard.
  band(body, x0, y + 104, d.right.resumeAt * cw, WASM, WASM_BG, 'Wasm');
  band(body, x0 + d.right.resumeAt * cw, y + 126, (3 - d.right.resumeAt) * cw, INTERP, INTERP_BG, "interpreter");
  body.push(t(ox, y + 118, `resume at ${d.right.resumeAt}`, `font-size="13" fill="${MUTED}"`));
  body.push(t(ox, y + 136, `matches ${d.right.matches.join(', ')}`, `font-size="13" ${MONO}`));
  const h = y + 162;
  const desc = `Top: the worked demo, orders ${demo.values.map(show).join(', ')} in one batch with compile chosen. The Wasm predicate takes rows 0 to ${demo.compiledRows - 1}; the null at row ${demo.guard.at} fails the guard; the interpreter takes rows ${demo.guard.resumeAt} to 5. Matches ${demo.matches.join(', ')}. Bottom: orders ${d.bug.values.map(show).join(', ')}. examples/replay-bug.mjs fails at row ${d.bug.failedAt} and restarts the interpreter at row ${d.bug.resumeAt}, so it reports ${d.bug.matches.join(', ')}: row ${d.bug.matches[dup]} twice. The runtime resumes at row ${d.right.resumeAt} and reports ${d.right.matches.join(', ')}.`;
  return svg(h, 'One cursor, two engines', desc, body);
}

function ruleFigure(d) {
  const body = [t(16, 24, 'What fixedRule chooses after a 256-row batch', 'font-weight="600"')];
  const pw = 180, ph = 153, py = 66, cols = d.maxRemaining / d.step, rows = d.maxNulls + 1;
  const cx = pw / cols, cy = ph / rows;
  const px = [62, 62 + pw + 40];
  const xOf = (p, r) => px[p] + (r / d.maxRemaining) * pw;
  const yOf = nulls => py + ph - (nulls + 1) * cy;
  d.panels.forEach((panel, p) => {
    body.push(t(px[p] + pw / 2, py - 12, panel.compiled ? 'predicate already built' : 'nothing compiled yet', `text-anchor="middle" font-size="13" font-weight="600"`));
    panel.grid.forEach((line, nulls) => {
      let start = 0;
      for (let i = 1; i <= line.length; i++) {
        if (i === line.length || line[i] !== line[start]) {
          const c = line[start] === 'compile';
          body.push(`<rect x="${(px[p] + start * cx).toFixed(2)}" y="${yOf(nulls).toFixed(2)}" width="${((i - start) * cx).toFixed(2)}" height="${cy.toFixed(2)}" fill="${c ? WASM_BG : INTERP_BG}" shape-rendering="crispEdges"/>`);
          start = i;
        }
      }
    });
    body.push(`<rect x="${px[p]}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="${MUTED}"/>`);
    for (const r of [0, 512, 1024]) body.push(t(xOf(p, r), py + ph + 16, n(r), `text-anchor="middle" font-size="12.5" fill="${MUTED}"`));
    body.push(t(px[p] + pw / 2, py + ph + 32, 'rows still to process', `text-anchor="middle" font-size="12.5" fill="${MUTED}"`));
    for (const k of [0, d.nullLimit, d.maxNulls]) body.push(t(px[p] - 6, yOf(k) + cy / 2 + 4, String(k), `text-anchor="end" font-size="12.5" fill="${MUTED}"`));
    for (const c of d.cases.filter(c => c.compiled === panel.compiled)) {
      const x = xOf(p, c.remainingRows), y = yOf(c.nulls) + cy / 2;
      body.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${INK}"/>`);
      const right = x < px[p] + pw / 2;
      body.push(t(x + (right ? 7 : -7), y - (right ? 7 : 16), `${c.label}: ${c.action}`, `font-size="12.5" text-anchor="${right ? 'start' : 'end'}"`));
    }
  });
  body.push(`<text x="18" y="${py + ph / 2}" font-size="12.5" fill="${MUTED}" text-anchor="middle" transform="rotate(-90 18 ${py + ph / 2})">nulls in the previous batch</text>`);
  const ly = py + ph + 52;
  body.push(box(62, ly, 14, 14, WASM_BG, WASM), t(82, ly + 12, 'compile', 'font-size="13"'));
  body.push(box(150, ly, 14, 14, INTERP_BG, INTERP), t(170, ly + 12, 'interpret', 'font-size="13"'));
  body.push(t(62, ly + 34, `The first batch has no history: fixedRule answers ${d.first}.`, `font-size="13" fill="${MUTED}"`));
  const h = ly + 48;
  const [open, cold, warm] = d.cases;
  const desc = `Two maps of fixedRule's answer, by rows still to process (0 to ${n(d.maxRemaining)}) and nulls in the previous 256-row batch (0 to ${d.maxNulls}). With nothing compiled yet it chooses compile only when at least ${d.minRemaining} rows remain and the previous batch had at most ${d.nullLimit} nulls. With a predicate already built the row count no longer matters: it compiles whenever the previous batch had at most ${d.nullLimit} nulls. Marked: the opening case (${open.remainingRows} rows, ${open.nulls} nulls, nothing built) chooses ${open.action}; an ${cold.remainingRows}-row tail chooses ${cold.action} with nothing built and ${warm.action} with a predicate built. The first batch has no history and always chooses ${d.first}.`;
  return svg(h, "fixedRule's answer by rows remaining and nulls", desc, body);
}

function positionFigure(d) {
  const body = [t(16, 24, `Same nulls, different place: race --shift --seed ${d.seed}`, 'font-weight="600"')];
  const x0 = 132, bw = (W - x0 - 16) / d.layouts[0].batches.length;
  d.layouts.forEach((L, k) => {
    const y = 66 + k * 92;
    body.push(t(16, y + 16, L.name, 'font-weight="600" font-size="13"'));
    body.push(t(16, y + 34, `Wasm rows ${n(L.compiledRows)}`, `font-size="13" fill="${WASM}"`));
    body.push(t(16, y + 50, `exits ${L.exits}`, `font-size="13" fill="${BAD}"`));
    L.batches.forEach((b, i) => {
      const x = x0 + i * bw, hc = (b.compiledRows / 256) * 48, hi = (b.interpreted / 256) * 48;
      if (hc) body.push(`<rect x="${x.toFixed(2)}" y="${(y + 48 - hc).toFixed(2)}" width="${(bw - 2).toFixed(2)}" height="${hc.toFixed(2)}" fill="${WASM_BG}" stroke="${WASM}"/>`);
      if (hi) body.push(`<rect x="${x.toFixed(2)}" y="${(y + 48 - hc - hi).toFixed(2)}" width="${(bw - 2).toFixed(2)}" height="${hi.toFixed(2)}" fill="${INTERP_BG}" stroke="${INTERP}"/>`);
    });
    body.push(t(x0, y + 64, 'batch 0', `font-size="12.5" fill="${MUTED}"`));
    body.push(t(x0 + (L.batches.length - 1) * bw + bw - 2, y + 64, `batch ${L.batches.length - 1}`, `text-anchor="end" font-size="12.5" fill="${MUTED}"`));
  });
  // One batch to scale: where the null sits and how many rows come before it.
  const y = 66 + 2 * 92 + 8, sw = W - x0 - 18;
  body.push(t(16, y - 6, 'batch 1, all 256 rows', 'font-size="13" font-weight="600"'));
  d.layouts.forEach((L, k) => {
    const yy = y + 6 + k * 30;
    body.push(t(16, yy + 14, L.name, `font-size="13" fill="${MUTED}"`));
    const before = L.batches[1].compiledRows, nx = x0 + (L.nullAt / 256) * sw;
    if (before) body.push(box(x0, yy, (before / 256) * sw, 18, WASM_BG, WASM));
    body.push(box(x0 + (before / 256) * sw, yy, ((256 - before) / 256) * sw, 18, INTERP_BG, INTERP));
    body.push(`<line x1="${nx.toFixed(2)}" y1="${yy - 3}" x2="${nx.toFixed(2)}" y2="${yy + 21}" stroke="${BAD}" stroke-width="3"/>`);
    body.push(t(L.nullAt < 128 ? nx + 6 : nx - 6, yy + 13, `null at row ${L.nullAt}: ${before} rows in Wasm`, `font-size="12.5" text-anchor="${L.nullAt < 128 ? 'start' : 'end'}"`));
  });
  const ly = y + 72;
  body.push(box(x0, ly, 14, 14, WASM_BG, WASM), t(x0 + 20, ly + 12, 'rows the Wasm predicate ran', 'font-size="13"'));
  body.push(box(x0 + 200, ly, 14, 14, INTERP_BG, INTERP), t(x0 + 220, ly + 12, 'rows interpreted', 'font-size="13"'));
  const h = ly + 28;
  const [a, b] = d.layouts;
  const desc = `Both importers from race --shift --seed ${d.seed} run under fixedRule in 256-row batches: ${n(a.rows)} rows in ${a.batches.length} batches, one null in each batch. Batch 0 is interpreted in both because there is no history. In "${a.name}" the null is row 0 of each batch, so every later batch hits the guard before any row and is interpreted: ${n(a.compiledRows)} Wasm rows, ${a.exits} exits. In "${b.name}" the null is the batch's last row, so ${b.batches[1].compiledRows} rows of each later batch run in Wasm first: ${n(b.compiledRows)} Wasm rows, ${b.exits} exits. Same exits, very different work in Wasm.`;
  return svg(h, 'Same number of nulls, different place in the batch', desc, body);
}

// ---------------------------------------------------------------- main
const FIGURES = {
  'stack-walk': [stackData, stackFigure],
  'wasm-bytes': [bytesData, bytesFigure],
  'guard-handoff': [handoffData, handoffFigure],
  'fixed-rule-map': [ruleData, ruleFigure],
  'guard-position': [positionData, positionFigure],
};

const mode = process.argv[2];
if (mode !== undefined && !['--check', '--data'].includes(mode)) { console.error('usage: node tools/figures.mjs [--check | --data]'); process.exit(2); }
if (mode === '--data') {
  for (const [name, [data]] of Object.entries(FIGURES)) console.log(name, JSON.stringify(data(), null, 1));
} else {
  if (mode !== '--check') mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const [name, [data, draw]] of Object.entries(FIGURES)) {
    const file = join(out, `${name}.svg`), text = draw(data());
    if (mode === '--check') {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { console.error(`stale: lessons/figures/${name}.svg (run node tools/figures.mjs)`); stale++; }
    } else writeFileSync(file, text);
  }
  if (mode === '--check') { if (stale) process.exitCode = 1; else console.log(`${Object.keys(FIGURES).length} figures match`); }
  else console.log(`wrote ${Object.keys(FIGURES).length} figures to lessons/figures/`);
}
